import { z } from "zod"

import { isPublicPrelaunch, type CampaignStatus, type CampaignType, type Db } from "./campaigns"

/**
 * Peer-to-peer campaign ambassadors, `?ref=` referral links, and opt-in
 * campaign leaderboard (DOS/Give#319, DOS.Me `20261202130000_give_campaign_ambassadors.sql`).
 *
 * Strictly zero-PII: no function here ever reads or returns `user_id` or `email`.
 * All client mutations/personal reads run strictly under the user's own JWT via
 * SECURITY DEFINER RPCs; public reads use `campaign_ambassador_leaderboard` and
 * `public_ambassador_ref`.
 */

export const AMBASSADOR_REF_PATTERN = /^[a-z0-9]{8,12}$/
export const AMBASSADOR_NAME_MAX = 80
export const AMBASSADOR_LEADERBOARD_DEFAULT_LIMIT = 10
export const AMBASSADOR_LEADERBOARD_MAX_LIMIT = 50

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

export interface PublicAmbassadorRef {
  ref_code: string
  display_name: string
}

export interface AmbassadorLeaderboardRow {
  ref_code: string
  display_name: string
  matched_count: number
  matched_total_vnd: number
}

export interface MyCampaignAmbassador {
  ref_code: string
  display_name: string
  show_on_leaderboard: boolean
  matched_count: number
  matched_total_vnd: number
  created_at: string
  updated_at: string
}

export interface MyAmbassadorLink {
  campaign_id: string
  campaign_slug: string
  campaign_title: string
  campaign_status: CampaignStatus
  campaign_type: CampaignType
  ref_code: string
  display_name: string
  show_on_leaderboard: boolean
  matched_count: number
  matched_total_vnd: number
  created_at: string
  updated_at: string
}

export interface UpsertedAmbassador {
  ref_code: string
  display_name: string
  show_on_leaderboard: boolean
  created_at: string
}

/**
 * Normalizes and validates an untrusted `?ref=` or hidden-field value.
 * Fail-open: returns `null` for missing, blank, non-string, or malformed inputs
 * so an invalid referral code NEVER blocks a page render, donation, or pledge.
 */
export function sanitizeAmbassadorRef(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  return AMBASSADOR_REF_PATTERN.test(normalized) ? normalized : null
}

/** Shareable campaign path carrying an ambassador's opaque `?ref=` code. */
export function ambassadorLinkPath(slug: string, refCode: string): string {
  return `/campaigns/${encodeURIComponent(slug)}?ref=${encodeURIComponent(refCode)}`
}

/**
 * Builds `/campaigns/[slug]/pledge` preserving optional `?tier=` and/or `?ref=`
 * query parameters. Invalid `refCode` values are silently dropped.
 */
export function campaignPledgeHref(
  slug: string,
  options: { tierId?: string | null; refCode?: string | null } = {}
): string {
  const params = new URLSearchParams()
  if (options.tierId) params.set("tier", options.tierId)
  const cleanRef = sanitizeAmbassadorRef(options.refCode)
  if (cleanRef) params.set("ref", cleanRef)
  const qs = params.toString()
  return `/campaigns/${encodeURIComponent(slug)}/pledge${qs ? `?${qs}` : ""}`
}

/**
 * Whether the "Tạo link kêu gọi giúp chiến dịch" UI should appear on a
 * campaign page: live (before ends_at) or opted-in future pre-launch teaser;
 * NEVER on draft, preview, suspended, cancelled, or ended campaigns.
 */
export function canCreateAmbassadorLink(
  campaign: {
    status: CampaignStatus
    prelaunch_public?: boolean | null
    starts_at?: string | null
    ends_at?: string | null
  },
  preview: boolean,
  now: Date = new Date()
): boolean {
  if (preview) return false
  if (campaign.status === "live") {
    if (!campaign.ends_at) return true
    const endsAt = new Date(campaign.ends_at)
    return !Number.isNaN(endsAt.getTime()) && endsAt.getTime() > now.getTime()
  }
  return isPublicPrelaunch(campaign, now)
}

export const ambassadorFormSchema = z.object({
  display_name: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length >= 1, "Hãy nhập tên hiển thị của bạn.")
    .refine((s) => s.length <= AMBASSADOR_NAME_MAX, `Tên hiển thị tối đa ${AMBASSADOR_NAME_MAX} ký tự.`)
    .refine((s) => !CONTROL_CHARS.test(s), "Tên hiển thị không được chứa ký tự xuống dòng hoặc ký tự điều khiển."),
  show_on_leaderboard: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "boolean" ? v : v === "on" || v === "true")),
})

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null
  return (data as T | null) ?? null
}

/**
 * Resolves an exact `?ref=` code on a publicly visible campaign to its public
 * `(ref_code, display_name)` pair via `give.public_ambassador_ref`.
 * Returns `null` without querying when `rawRef` fails format validation.
 */
export async function getPublicAmbassadorRef(
  db: Db,
  campaignId: string,
  rawRef: unknown
): Promise<PublicAmbassadorRef | null> {
  const ref = sanitizeAmbassadorRef(rawRef)
  if (!ref) return null
  const { data, error } = await db.rpc("public_ambassador_ref", {
    p_campaign_id: campaignId,
    p_ref_code: ref,
  })
  if (error) throw error
  const row = firstRow<{ ref_code?: unknown; display_name?: unknown }>(data)
  if (!row || typeof row.ref_code !== "string" || typeof row.display_name !== "string") return null
  return { ref_code: row.ref_code, display_name: row.display_name }
}

/**
 * Loads the public opt-in `"Người đồng hành lan tỏa"` leaderboard via
 * `give.campaign_ambassador_leaderboard`. Strictly for `isPublicLiveOrEnded`
 * campaigns (DB also fails closed on non-public/pre-launch/suspended).
 */
export async function listCampaignAmbassadorLeaderboard(
  db: Db,
  campaignId: string,
  limit: number = AMBASSADOR_LEADERBOARD_DEFAULT_LIMIT
): Promise<AmbassadorLeaderboardRow[]> {
  const clamped = Math.min(
    Math.max(Math.trunc(limit) || AMBASSADOR_LEADERBOARD_DEFAULT_LIMIT, 1),
    AMBASSADOR_LEADERBOARD_MAX_LIMIT
  )
  const { data, error } = await db.rpc("campaign_ambassador_leaderboard", {
    p_campaign_id: campaignId,
    p_limit: clamped,
  })
  if (error) throw error
  if (!Array.isArray(data)) return []
  return data
    .map((item) => {
      const row = item as Record<string, unknown>
      if (typeof row.ref_code !== "string" || typeof row.display_name !== "string") return null
      return {
        ref_code: row.ref_code,
        display_name: row.display_name,
        matched_count: Number(row.matched_count) || 0,
        matched_total_vnd: Number(row.matched_total_vnd) || 0,
      }
    })
    .filter(
      (row): row is AmbassadorLeaderboardRow => row !== null && row.matched_count > 0 && row.matched_total_vnd > 0
    )
}

/**
 * Loads the signed-in caller's ambassador record and net matched stats for a
 * single campaign via `give.get_my_campaign_ambassador` (user JWT only).
 */
export async function getMyCampaignAmbassador(db: Db, campaignId: string): Promise<MyCampaignAmbassador | null> {
  const { data, error } = await db.rpc("get_my_campaign_ambassador", {
    p_campaign_id: campaignId,
  })
  if (error) throw error
  const row = firstRow<Record<string, unknown>>(data)
  if (!row || typeof row.ref_code !== "string" || typeof row.display_name !== "string") return null
  return {
    ref_code: row.ref_code,
    display_name: row.display_name,
    show_on_leaderboard: row.show_on_leaderboard === true,
    matched_count: Number(row.matched_count) || 0,
    matched_total_vnd: Number(row.matched_total_vnd) || 0,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  }
}

/**
 * Loads all of the signed-in caller's ambassador links and net matched stats
 * via `give.list_my_ambassador_links` (user JWT only, for `/me`).
 */
export async function listMyAmbassadorLinks(db: Db): Promise<MyAmbassadorLink[]> {
  const { data, error } = await db.rpc("list_my_ambassador_links")
  if (error) throw error
  if (!Array.isArray(data)) return []
  return data
    .map((item) => {
      const row = item as Record<string, unknown>
      if (
        typeof row.campaign_id !== "string" ||
        typeof row.campaign_slug !== "string" ||
        typeof row.campaign_title !== "string" ||
        typeof row.ref_code !== "string" ||
        typeof row.display_name !== "string"
      ) {
        return null
      }
      return {
        campaign_id: row.campaign_id,
        campaign_slug: row.campaign_slug,
        campaign_title: row.campaign_title,
        campaign_status: row.campaign_status as CampaignStatus,
        campaign_type: row.campaign_type as CampaignType,
        ref_code: row.ref_code,
        display_name: row.display_name,
        show_on_leaderboard: row.show_on_leaderboard === true,
        matched_count: Number(row.matched_count) || 0,
        matched_total_vnd: Number(row.matched_total_vnd) || 0,
        created_at: String(row.created_at ?? ""),
        updated_at: String(row.updated_at ?? ""),
      }
    })
    .filter((row): row is MyAmbassadorLink => row !== null)
}

/**
 * Creates or updates the signed-in caller's ambassador record via
 * `give.upsert_my_campaign_ambassador` (user JWT only; `ref_code` is immutable
 * once created).
 */
export async function upsertMyCampaignAmbassador(
  db: Db,
  input: { campaignId: string; displayName: string; showOnLeaderboard: boolean }
): Promise<UpsertedAmbassador> {
  const { data, error } = await db.rpc("upsert_my_campaign_ambassador", {
    p_campaign_id: input.campaignId,
    p_display_name: input.displayName,
    p_show_on_leaderboard: input.showOnLeaderboard,
  })
  if (error) throw error
  const row = firstRow<Record<string, unknown>>(data)
  if (!row || typeof row.ref_code !== "string" || typeof row.display_name !== "string") {
    throw new Error("Unexpected empty response from upsert_my_campaign_ambassador")
  }
  return {
    ref_code: row.ref_code,
    display_name: row.display_name,
    show_on_leaderboard: row.show_on_leaderboard === true,
    created_at: String(row.created_at ?? ""),
  }
}
