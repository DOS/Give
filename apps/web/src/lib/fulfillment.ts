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

/** The database's limits on one call (GIVE_FULFILLMENT_BATCH_INVALID, GIVE_FULFILLMENT_NOTE_TOO_LONG). */
export const FULFILLMENT_BATCH_MAX = 500
export const FULFILLMENT_NOTE_MAX = 500

export function isFulfillmentStatus(value: unknown): value is FulfillmentStatus {
  return typeof value === "string" && (FULFILLMENT_STATUSES as readonly string[]).includes(value)
}

/** Label of a pledge's delivery status; null means the creator has not reported anything yet. */
export function fulfillmentLabel(status: string | null | undefined): string {
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
  /** 1-based page number of FULFILLMENT_BATCH_MAX pledges. */
  page: number
}

const MAX_FULFILLMENT_PAGE = 10_000

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

function parsePage(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) return 1
  return Math.min(Number(value), MAX_FULFILLMENT_PAGE)
}

export function parseFulfillmentFilters(params: Record<string, string | string[] | undefined>): FulfillmentFilters {
  const tier = firstParam(params.tier)
  const status = firstParam(params.status)
  return {
    tier: tier === "none" || isUuid(tier) ? tier : null,
    status: status === "none" || isFulfillmentStatus(status) ? status : null,
    page: parsePage(firstParam(params.page)),
  }
}

/** Builds a /me/campaigns/[id]/fulfillment URL, preserving active filters and omitting defaults. */
export function fulfillmentHref(campaignId: string, filters: Partial<FulfillmentFilters> = {}): string {
  const params = new URLSearchParams()
  if (filters.tier) params.set("tier", filters.tier)
  if (filters.status) params.set("status", filters.status)
  if (filters.page && filters.page > 1) params.set("page", String(filters.page))
  const query = params.toString()
  const base = `/me/campaigns/${campaignId}/fulfillment`
  return query ? `${base}?${query}` : base
}

const FULFILLMENT_PLEDGE_COLUMNS =
  "id, reference_code, public_name, is_anonymous, intended_amount, received_amount, reward_tier_id, shipping_address, fulfillment_status, fulfillment_note, fulfillment_updated_at, created_at"

function fulfillmentQuery(
  db: Db,
  campaignId: string,
  filters: Pick<FulfillmentFilters, "tier" | "status">,
  columns: string,
  head = false
) {
  let query = db
    .from("contributions")
    .select(columns, head ? { count: "exact", head: true } : { count: "exact" })
    .eq("campaign_id", campaignId)
    .eq("kind", "pledge")
    .eq("status", "paid")
  if (filters.tier === "none") query = query.is("reward_tier_id", null)
  else if (filters.tier) query = query.eq("reward_tier_id", filters.tier)
  if (filters.status === "none") query = query.is("fulfillment_status", null)
  else if (filters.status) query = query.eq("fulfillment_status", filters.status)
  return query
}

/**
 * Paid pledges of a campaign the caller organizes, oldest first, read with
 * their token (RLS: the organizer and finance see their campaign's
 * contributions). One page of at most FULFILLMENT_BATCH_MAX rows, so
 * "select all" on any page fits a single RPC call.
 */
export async function listFulfillmentPledges(
  db: Db,
  campaignId: string,
  filters: Pick<FulfillmentFilters, "tier" | "status"> & { page?: number }
): Promise<{ pledges: FulfillmentPledge[]; total: number }> {
  const page = Math.max(1, Math.trunc(filters.page ?? 1))
  const from = (page - 1) * FULFILLMENT_BATCH_MAX
  const to = page * FULFILLMENT_BATCH_MAX - 1
  const { data, error, count } = await fulfillmentQuery(db, campaignId, filters, FULFILLMENT_PLEDGE_COLUMNS)
    .order("created_at", { ascending: true })
    .order("id")
    .range(from, to)
  if (error?.code === "PGRST103") {
    const counted = await fulfillmentQuery(db, campaignId, filters, "id", true)
    if (counted.error) throw counted.error
    return { pledges: [], total: counted.count ?? 0 }
  }
  if (error) throw error
  const pledges = (data ?? []) as unknown as FulfillmentPledge[]
  return { pledges, total: count ?? (pledges.length > 0 ? from + pledges.length : 0) }
}

/** The keys the pledge form stores (DOS/Give#31, lib/pledges.ts shippingAddressSchema), labelled. */
const SHIPPING_LABELS: Record<string, string> = {
  recipient: "Người nhận",
  phone: "Số điện thoại",
  address: "Địa chỉ",
}

/**
 * The lines of a shipping address as the pledge form stored it (a JSON
 * object, DOS/Give#31): known keys first with their labels, then any other
 * non-empty text or number value as it is.
 */
export function shippingLines(address: Record<string, unknown> | null): string[] {
  if (!address || typeof address !== "object" || Array.isArray(address)) return []
  const text = (v: unknown) =>
    (typeof v === "string" && v.trim() !== "") || typeof v === "number" ? String(v).trim() : null
  const known = Object.entries(SHIPPING_LABELS).flatMap(([key, label]) => {
    const value = text(address[key])
    return value === null ? [] : [`${label}: ${value}`]
  })
  const rest = Object.entries(address).flatMap(([key, v]) => {
    const value = Object.hasOwn(SHIPPING_LABELS, key) ? null : text(v)
    return value === null ? [] : [value]
  })
  return [...known, ...rest]
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
