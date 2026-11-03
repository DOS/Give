import type { CampaignStatus, Db } from "./campaigns"
import { isEditableStatus } from "./campaigns"
import { formatVnd } from "./format"

/**
 * Reward tiers of `back` campaigns (DOS/Give#83, DDL DOS.Me
 * `20261105150000_give_rewards.sql`, DOS/Give#30).
 *
 * Creators edit tiers through the service-role RPCs save_reward_tier,
 * delete_reward_tier, reorder_reward_tiers and retire_reward_tier; reads use
 * the caller's token: give.reward_tiers (authenticated, RLS: own campaign,
 * staff, or a tier of a public campaign) for the editor and previews, and
 * the view give.public_reward_tiers (active tiers of public campaigns, with
 * the slots left) for everyone else.
 */

export type RewardTierStatus = "active" | "retired"

export interface RewardTier {
  id: string
  campaign_id: string
  title: string
  description: string | null
  min_amount: number
  /** null = unlimited. */
  quantity_limit: number | null
  quantity_claimed: number
  /** The first day of the month ("2027-03-01"), or null. */
  estimated_delivery: string | null
  requires_shipping: boolean
  shipping_note: string | null
  status: RewardTierStatus
  sort_order: number
  retired_at: string | null
}

/** A row of give.public_reward_tiers: active tiers only, with the slots left (null = unlimited). */
export interface PublicRewardTier extends Omit<RewardTier, "status" | "retired_at"> {
  quantity_remaining: number | null
}

/** The database caps a campaign at 50 tiers (GIVE_REWARD_TIER_LIMIT). */
export const MAX_TIERS = 50

const TIER_COLUMNS =
  "id, campaign_id, title, description, min_amount, quantity_limit, quantity_claimed, estimated_delivery, requires_shipping, shipping_note, status, sort_order, retired_at"

const PUBLIC_TIER_COLUMNS =
  "id, campaign_id, title, description, min_amount, quantity_limit, quantity_claimed, quantity_remaining, estimated_delivery, requires_shipping, shipping_note, sort_order"

// ---------------------------------------------------------------------------
// Rules (mirror give.lock_tier_campaign and give.retire_reward_tier; the
// database stays the authority)
// ---------------------------------------------------------------------------

/** Tiers are added, edited, reordered and deleted only while the campaign is draft or changes_requested. */
export function canEditTiers(status: CampaignStatus): boolean {
  return isEditableStatus(status)
}

/** Statuses in which retire_reward_tier accepts a tier: before the campaign ends. */
export const RETIRABLE_STATUSES: readonly CampaignStatus[] = [
  "draft",
  "changes_requested",
  "approved",
  "live",
  "suspended",
]

/**
 * After approval a tier is read-only except retiring it, and only while no
 * pledge holds a slot of it. Before approval the creator deletes it instead.
 */
export function canRetireTier(status: CampaignStatus, tier: Pick<RewardTier, "status" | "quantity_claimed">): boolean {
  return (
    !canEditTiers(status) &&
    RETIRABLE_STATUSES.includes(status) &&
    tier.status === "active" &&
    tier.quantity_claimed === 0
  )
}

/** Tiers first to last, as the creator ordered them (ties by id, like the database's index). */
export function sortTiers<T extends Pick<RewardTier, "id" | "sort_order">>(tiers: readonly T[]): T[] {
  return [...tiers].sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * The tier ids after moving one tier up or down by one place, or null when
 * it cannot move (unknown id, already first or last).
 */
export function moveTier(ids: readonly string[], id: string, direction: "up" | "down"): string[] | null {
  const from = ids.indexOf(id)
  if (from < 0) return null
  const to = direction === "up" ? from - 1 : from + 1
  if (to < 0 || to >= ids.length) return null
  const next = [...ids]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/** Slots left, or null for an unlimited tier. */
export function remainingSlots(tier: Pick<RewardTier, "quantity_limit" | "quantity_claimed">): number | null {
  return tier.quantity_limit === null ? null : Math.max(tier.quantity_limit - tier.quantity_claimed, 0)
}

export function isSoldOut(tier: Pick<RewardTier, "quantity_limit" | "quantity_claimed">): boolean {
  return remainingSlots(tier) === 0
}

/** "Còn 3/10 suất", "Hết suất" or "Không giới hạn số suất". */
export function quantityLabel(tier: Pick<RewardTier, "quantity_limit" | "quantity_claimed">): string {
  const left = remainingSlots(tier)
  if (left === null) return "Không giới hạn số suất"
  if (left === 0) return "Hết suất"
  return `Còn ${left}/${tier.quantity_limit} suất`
}

/** "Tháng 3/2027" for a delivery month stored as its first day, or null. */
export function deliveryMonthLabel(date: string | null): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(date ?? "")
  return match ? `Tháng ${Number(match[2])}/${match[1]}` : null
}

/** The value a month input needs ("2027-03") for a stored delivery month. */
export function deliveryMonthInput(date: string | null): string {
  return /^\d{4}-\d{2}/.exec(date ?? "")?.[0] ?? ""
}

export function minAmountLabel(amount: number): string {
  return `Từ ${formatVnd(amount)}`
}

/**
 * Backers can pick a tier only while the campaign is live, has started and
 * has an end date still ahead (give.lock_pledge_campaign).
 */
export function acceptsPledges(
  campaign: { type: string; status: CampaignStatus; starts_at: string | null; ends_at: string | null },
  now = new Date()
): boolean {
  return (
    campaign.type === "back" &&
    campaign.status === "live" &&
    (campaign.starts_at === null || new Date(campaign.starts_at) <= now) &&
    campaign.ends_at !== null &&
    new Date(campaign.ends_at) > now
  )
}

/** The pledge flow (DOS/Give#31) with this tier chosen. */
export function pledgeHref(slug: string, tierId: string): string {
  return `/campaigns/${slug}/pledge?tier=${encodeURIComponent(tierId)}`
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Every tier of a campaign the caller organizes (or, for staff, any), retired ones included. */
export async function listCampaignTiers(db: Db, campaignId: string): Promise<RewardTier[]> {
  const { data, error } = await db
    .from("reward_tiers")
    .select(TIER_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("sort_order")
    .order("id")
  if (error) throw error
  return (data ?? []) as RewardTier[]
}

/** Active tiers of a public campaign with the slots left, for any visitor. */
export async function listPublicTiers(db: Db, campaignId: string): Promise<PublicRewardTier[]> {
  const { data, error } = await db
    .from("public_reward_tiers")
    .select(PUBLIC_TIER_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("sort_order")
    .order("id")
  if (error) throw error
  return (data ?? []) as PublicRewardTier[]
}

/** What the organizer's preview of a campaign that is not public yet shows: its active tiers. */
export function previewTiers(tiers: readonly RewardTier[]): PublicRewardTier[] {
  return sortTiers(tiers.filter((t) => t.status === "active")).map(({ status: _s, retired_at: _r, ...tier }) => ({
    ...tier,
    quantity_remaining: remainingSlots(tier),
  }))
}
