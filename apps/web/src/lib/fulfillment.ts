import type { CampaignStatus, Db } from "./campaigns"
import { isUuid } from "./ids"

/**
 * Delivery of rewards to backers who paid (DOS/Give#83): the creator sets
 * contributions.fulfillment_status and fulfillment_note through the
 * service-role RPC give.set_pledge_fulfillment (DOS/Give#30), on paid
 * pledges of a succeeded back campaign, up to 500 at a time.
 */

export const FULFILLMENT_STATUSES = ["pending", "in_progress", "shipped", "delivered", "issue"] as const
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number]

export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  pending: "Chờ chuẩn bị",
  in_progress: "Đang chuẩn bị",
  shipped: "Đã gửi đi",
  delivered: "Đã giao",
  issue: "Có vấn đề",
}

export const FULFILLMENT_COLORS: Record<FulfillmentStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  in_progress: "bg-sky-100 text-sky-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  issue: "bg-red-100 text-red-800",
}

/** The database's limits on one call (GIVE_FULFILLMENT_BATCH_INVALID, GIVE_FULFILLMENT_NOTE_TOO_LONG). */
export const FULFILLMENT_BATCH_MAX = 500
export const FULFILLMENT_NOTE_MAX = 500

export function isFulfillmentStatus(value: unknown): value is FulfillmentStatus {
  return typeof value === "string" && (FULFILLMENT_STATUSES as readonly string[]).includes(value)
}

/** Label of a pledge's delivery status; null means the creator has not reported anything yet. */
export function fulfillmentLabel(status: string | null): string {
  return isFulfillmentStatus(status) ? FULFILLMENT_LABELS[status] : "Chưa cập nhật"
}

/** Only a succeeded back campaign reports delivery. */
export function canUpdateFulfillment(campaign: { type: string; status: CampaignStatus }): boolean {
  return campaign.type === "back" && campaign.status === "succeeded"
}

export interface FulfillmentPledge {
  id: string
  reference_code: string
  public_name: string | null
  is_anonymous: boolean
  intended_amount: number
  received_amount: number
  reward_tier_id: string | null
  shipping_address: Record<string, unknown> | null
  fulfillment_status: FulfillmentStatus | null
  fulfillment_note: string | null
  fulfillment_updated_at: string | null
  created_at: string
}

export interface FulfillmentFilters {
  /** A tier id, "none" for pledges without a reward, or null for all. */
  tier: string | null
  /** A delivery status, "none" for not reported yet, or null for all. */
  status: FulfillmentStatus | "none" | null
}

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

export function parseFulfillmentFilters(params: Record<string, string | string[] | undefined>): FulfillmentFilters {
  const tier = firstParam(params.tier)
  const status = firstParam(params.status)
  return {
    tier: tier === "none" || isUuid(tier) ? tier : null,
    status: status === "none" || isFulfillmentStatus(status) ? status : null,
  }
}

/**
 * Paid pledges of a campaign the caller organizes, oldest first, read with
 * their token (RLS: the organizer and finance see their campaign's
 * contributions). At most one batch, so "select all" fits one call.
 */
export async function listFulfillmentPledges(
  db: Db,
  campaignId: string,
  filters: FulfillmentFilters
): Promise<{ pledges: FulfillmentPledge[]; total: number }> {
  let query = db
    .from("contributions")
    .select(
      "id, reference_code, public_name, is_anonymous, intended_amount, received_amount, reward_tier_id, shipping_address, fulfillment_status, fulfillment_note, fulfillment_updated_at, created_at",
      { count: "exact" }
    )
    .eq("campaign_id", campaignId)
    .eq("kind", "pledge")
    .eq("status", "paid")
  if (filters.tier === "none") query = query.is("reward_tier_id", null)
  else if (filters.tier) query = query.eq("reward_tier_id", filters.tier)
  if (filters.status === "none") query = query.is("fulfillment_status", null)
  else if (filters.status) query = query.eq("fulfillment_status", filters.status)
  const { data, error, count } = await query
    .order("created_at", { ascending: true })
    .order("id")
    .limit(FULFILLMENT_BATCH_MAX)
  if (error) throw error
  const pledges = (data ?? []) as FulfillmentPledge[]
  return { pledges, total: count ?? pledges.length }
}

/**
 * The lines of a shipping address as the pledge form stored it (a JSON
 * object, DOS/Give#31): every non-empty text or number value, in order.
 */
export function shippingLines(address: Record<string, unknown> | null): string[] {
  if (!address || typeof address !== "object" || Array.isArray(address)) return []
  return Object.values(address)
    .filter((v): v is string | number => (typeof v === "string" && v.trim() !== "") || typeof v === "number")
    .map((v) => String(v).trim())
}

/** How many pledges of each delivery status, "none" for not reported. */
export function countByStatus(pledges: readonly Pick<FulfillmentPledge, "fulfillment_status">[]) {
  const counts: Record<FulfillmentStatus | "none", number> = {
    none: 0,
    pending: 0,
    in_progress: 0,
    shipped: 0,
    delivered: 0,
    issue: 0,
  }
  for (const p of pledges) counts[isFulfillmentStatus(p.fulfillment_status) ? p.fulfillment_status : "none"] += 1
  return counts
}
