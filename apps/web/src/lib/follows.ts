import type { Db, OrganizerKind, VerificationStatus } from "./campaigns"
import { isUuid } from "./ids"
import {
  isReservedOrganizerHandle,
  isValidOrganizerHandleFormat,
  normalizeOrganizerHandle,
  safeAvatarUrl,
} from "./organizer-handle"

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
