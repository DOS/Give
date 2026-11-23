import {
  isPublicStatus,
  STATUS_LABELS,
  type CampaignStatus,
  type CampaignType,
  type Db,
  type OrganizerKind,
  type VerificationStatus,
} from "./campaigns"
import { isUuid } from "./ids"
import {
  isReservedOrganizerHandle,
  isValidOrganizerHandleFormat,
  normalizeOrganizerHandle,
  safeAvatarUrl,
} from "./organizer-handle"
import { SLUG_PATTERN } from "./slug"

/**
 * Campaign/organizer follows and donor impact summary data layer over the
 * DOS.Me migration `20261201120000_give_follows_prelaunch_and_donor_impact.sql`
 * (DOS/Give#315).
 *
 * Privacy invariants:
 * - Never exposes follower lists, follower IDs, or organizer `user_id`s.
 * - Organizer follow operations use ONLY handle-based SECURITY DEFINER RPCs
 *   (`organizer_follower_count_by_handle`, `is_following_organizer_by_handle`,
 *   `follow_organizer_by_handle`, `unfollow_organizer_by_handle`, and
 *   `list_my_followed_organizers`).
 * - Campaign follows run under the caller's own Supabase client (RLS).
 */

export interface FollowedOrganizer {
  handle: string
  display_name: string
  avatar_url: string | null
  kind: OrganizerKind
  verification_status: VerificationStatus
  followed_at: string
}

export interface FollowedCampaign {
  campaign_id: string
  slug: string
  type: CampaignType
  title: string
  summary: string | null
  status: CampaignStatus
  goal_amount: number
  starts_at: string | null
  ends_at: string | null
  prelaunch_public: boolean
  cover_storage_path: string | null
  cover_alt: string | null
  organizer_display_name: string | null
  organizer_handle: string | null
  organizer_verification_status: VerificationStatus | null
  received_amount: number
  followed_at: string
  has_supported: boolean
}

export interface CategoryImpactItem {
  category_id: string | null
  category_slug: string
  category_name: string
  total_vnd: number
  campaigns_count: number
}

export interface DonorImpactSummary {
  total_matched_vnd: number
  campaigns_supported_count: number
  active_monthly_plans_count: number
  followed_campaigns_count: number
  followed_organizers_count: number
  category_breakdown: CategoryImpactItem[]
}

export const EMPTY_DONOR_IMPACT_SUMMARY: DonorImpactSummary = {
  total_matched_vnd: 0,
  campaigns_supported_count: 0,
  active_monthly_plans_count: 0,
  followed_campaigns_count: 0,
  followed_organizers_count: 0,
  category_breakdown: [],
}

function toSafeCount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0
}

function validHandle(rawHandle: string): string | null {
  const handle = normalizeOrganizerHandle(rawHandle)
  if (!isValidOrganizerHandleFormat(handle) || isReservedOrganizerHandle(handle)) return null
  return handle
}

// ---------------------------------------------------------------------------
// Campaign follows
// ---------------------------------------------------------------------------

export async function getCampaignFollowerCount(db: Db, campaignId: string): Promise<number> {
  if (!isUuid(campaignId)) return 0
  const { data, error } = await db.rpc("campaign_follower_count", { p_campaign_id: campaignId })
  if (error) throw error
  return toSafeCount(data)
}

export async function isFollowingCampaign(db: Db, userId: string, campaignId: string): Promise<boolean> {
  if (!isUuid(userId) || !isUuid(campaignId)) return false
  const { data, error } = await db
    .from("campaign_follows")
    .select("campaign_id")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}

export async function followCampaign(db: Db, userId: string, campaignId: string): Promise<void> {
  const { error } = await db.from("campaign_follows").insert({ user_id: userId, campaign_id: campaignId })
  if (error && error.code !== "23505") throw error
}

export async function unfollowCampaign(db: Db, userId: string, campaignId: string): Promise<void> {
  const { error } = await db.from("campaign_follows").delete().eq("user_id", userId).eq("campaign_id", campaignId)
  if (error) throw error
}

interface RawFollowedCampaignRow {
  campaign_id?: unknown
  slug?: unknown
  type?: unknown
  title?: unknown
  summary?: unknown
  status?: unknown
  goal_amount?: unknown
  starts_at?: unknown
  ends_at?: unknown
  prelaunch_public?: unknown
  cover_storage_path?: unknown
  cover_alt?: unknown
  organizer_display_name?: unknown
  organizer_handle?: unknown
  organizer_verification_status?: unknown
  received_amount?: unknown
  followed_at?: unknown
  has_supported?: unknown
}

const VALID_VERIFICATION_STATUSES: ReadonlySet<VerificationStatus> = new Set([
  "unverified",
  "pending",
  "verified",
  "rejected",
])
const SAFE_COVER_STORAGE_PATH = /^campaigns\/[a-z0-9-]+\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i

function safeCampaignSlug(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 80) return null
  return SLUG_PATTERN.test(raw) ? raw : null
}

function safeCoverStoragePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return SAFE_COVER_STORAGE_PATH.test(trimmed) ? trimmed : null
}

function validIsoTimestamp(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return trimmed !== "" && !Number.isNaN(Date.parse(trimmed)) ? trimmed : null
}

/**
 * Lists the signed-in user's followed campaigns via `give.list_my_followed_campaigns`
 * (DOS/Give#337). Enforces slug, handle, cover-path, timestamp, and numeric checks,
 * and zeroes `received_amount` for non-public statuses (including pre-launch `approved`).
 */
export async function listMyFollowedCampaigns(db: Db, limit = 50, offset = 0): Promise<FollowedCampaign[]> {
  const clampedLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 50
  const clampedOffset = Number.isFinite(offset) ? Math.max(Math.trunc(offset), 0) : 0

  const { data, error } = await db.rpc("list_my_followed_campaigns", {
    p_limit: clampedLimit,
    p_offset: clampedOffset,
  })
  if (error) throw error

  const items: FollowedCampaign[] = []
  for (const row of (Array.isArray(data) ? data : []) as RawFollowedCampaignRow[]) {
    if (!isUuid(row.campaign_id)) continue
    const slug = safeCampaignSlug(row.slug)
    if (!slug) continue
    if (row.type !== "give" && row.type !== "back") continue
    if (typeof row.status !== "string" || !Object.hasOwn(STATUS_LABELS, row.status)) continue
    const status = row.status as CampaignStatus
    if (typeof row.title !== "string" || row.title.trim() === "") continue

    const organizerHandle = typeof row.organizer_handle === "string" ? validHandle(row.organizer_handle) : null
    const verificationStatus =
      typeof row.organizer_verification_status === "string" &&
      VALID_VERIFICATION_STATUSES.has(row.organizer_verification_status as VerificationStatus)
        ? (row.organizer_verification_status as VerificationStatus)
        : null

    items.push({
      campaign_id: row.campaign_id,
      slug,
      type: row.type,
      title: row.title,
      summary: typeof row.summary === "string" && row.summary.trim() !== "" ? row.summary : null,
      status,
      goal_amount: toSafeCount(row.goal_amount),
      starts_at: validIsoTimestamp(row.starts_at),
      ends_at: validIsoTimestamp(row.ends_at),
      prelaunch_public: row.prelaunch_public === true,
      cover_storage_path: safeCoverStoragePath(row.cover_storage_path),
      cover_alt: typeof row.cover_alt === "string" && row.cover_alt.trim() !== "" ? row.cover_alt : null,
      organizer_display_name:
        typeof row.organizer_display_name === "string" && row.organizer_display_name.trim() !== ""
          ? row.organizer_display_name
          : null,
      organizer_handle: organizerHandle,
      organizer_verification_status: verificationStatus,
      received_amount: isPublicStatus(status) ? toSafeCount(row.received_amount) : 0,
      followed_at: validIsoTimestamp(row.followed_at) ?? "",
      has_supported: row.has_supported === true,
    })
  }
  return items
}

// ---------------------------------------------------------------------------
// Organizer follows (handle-based RPCs only — zero organizer_id exposure)
// ---------------------------------------------------------------------------

export async function getOrganizerFollowerCountByHandle(db: Db, rawHandle: string): Promise<number> {
  const handle = validHandle(rawHandle)
  if (!handle) return 0
  const { data, error } = await db.rpc("organizer_follower_count_by_handle", { p_handle: handle })
  if (error) throw error
  return toSafeCount(data)
}

export async function isFollowingOrganizerByHandle(db: Db, rawHandle: string): Promise<boolean> {
  const handle = validHandle(rawHandle)
  if (!handle) return false
  const { data, error } = await db.rpc("is_following_organizer_by_handle", { p_handle: handle })
  if (error) throw error
  return data === true
}

export async function followOrganizerByHandle(db: Db, rawHandle: string): Promise<boolean> {
  const handle = validHandle(rawHandle)
  if (!handle) {
    throw Object.assign(new Error("GIVE_ORGANIZER_NOT_FOUND"), { code: "P0002" })
  }
  const { data, error } = await db.rpc("follow_organizer_by_handle", { p_handle: handle })
  if (error) throw error
  return data === true
}

export async function unfollowOrganizerByHandle(db: Db, rawHandle: string): Promise<boolean> {
  const handle = validHandle(rawHandle)
  if (!handle) return false
  const { data, error } = await db.rpc("unfollow_organizer_by_handle", { p_handle: handle })
  if (error) throw error
  return data === true
}

interface RawFollowedOrganizerRow {
  handle: string
  display_name: string
  avatar_url: string | null
  kind: OrganizerKind
  verification_status: VerificationStatus
  followed_at: string
}

export async function listMyFollowedOrganizers(db: Db): Promise<FollowedOrganizer[]> {
  const { data, error } = await db.rpc("list_my_followed_organizers")
  if (error) throw error
  return ((data ?? []) as RawFollowedOrganizerRow[])
    .filter((row) => typeof row.handle === "string" && row.handle.length > 0)
    .map((row) => ({
      handle: row.handle,
      display_name: row.display_name,
      avatar_url: safeAvatarUrl(row.avatar_url),
      kind: row.kind,
      verification_status: row.verification_status,
      followed_at: row.followed_at,
    }))
}

// ---------------------------------------------------------------------------
// Donor impact summary (give.my_donor_impact_summary)
// ---------------------------------------------------------------------------

interface RawDonorImpactRow {
  total_matched_vnd: number | string | null
  campaigns_supported_count: number | string | null
  active_monthly_plans_count: number | string | null
  followed_campaigns_count: number | string | null
  followed_organizers_count: number | string | null
  category_breakdown: unknown
}

function parseCategoryBreakdown(raw: unknown): CategoryImpactItem[] {
  if (!Array.isArray(raw)) return []
  const items: CategoryImpactItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const rec = entry as Record<string, unknown>
    const categorySlug =
      typeof rec.category_slug === "string" && rec.category_slug ? rec.category_slug : "uncategorized"
    const categoryName = typeof rec.category_name === "string" && rec.category_name ? rec.category_name : "Khác"
    const totalVnd = toSafeCount(rec.total_vnd)
    const campaignsCount = toSafeCount(rec.campaigns_count)
    if (totalVnd <= 0 && campaignsCount <= 0) continue
    items.push({
      category_id: typeof rec.category_id === "string" ? rec.category_id : null,
      category_slug: categorySlug,
      category_name: categoryName,
      total_vnd: totalVnd,
      campaigns_count: campaignsCount,
    })
  }
  return items
}

export async function getMyDonorImpactSummary(db: Db): Promise<DonorImpactSummary> {
  const { data, error } = await db.rpc("my_donor_impact_summary")
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as RawDonorImpactRow | null | undefined
  if (!row) return EMPTY_DONOR_IMPACT_SUMMARY
  return {
    total_matched_vnd: toSafeCount(row.total_matched_vnd),
    campaigns_supported_count: toSafeCount(row.campaigns_supported_count),
    active_monthly_plans_count: toSafeCount(row.active_monthly_plans_count),
    followed_campaigns_count: toSafeCount(row.followed_campaigns_count),
    followed_organizers_count: toSafeCount(row.followed_organizers_count),
    category_breakdown: parseCategoryBreakdown(row.category_breakdown),
  }
}
