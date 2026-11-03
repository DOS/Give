import "server-only"

import type { Db } from "@/lib/campaigns"
import { PUBLIC_TIER_COLUMNS, type PublicRewardTier } from "@/lib/pledges"

/**
 * Server side of the pledge flow (section 4.2). Backers are always signed in:
 * they read their own pledges with their own token under RLS
 * (contributions_read), which also proves the token before anything runs
 * under the service role. The pledge functions and give.pledge_payment run as
 * the service role with the user id the server passes; the payment details
 * come only from give.pledge_payment, for a pledge the caller has just read
 * as theirs. Money tables are never selected with `*`.
 */

/** Columns of a pledge the pledge and payment pages need. */
export const PLEDGE_COLUMNS =
  "id, campaign_id, kind, intended_amount, received_amount, reference_code, status, reward_tier_id, " +
  "shipping_address, public_name, is_anonymous, message, payment_due_at, refund_due_at, fulfillment_status, " +
  "fulfillment_note, fulfillment_updated_at, created_at"

export interface OwnPledge {
  id: string
  campaign_id: string
  kind: "pledge"
  intended_amount: number
  received_amount: number
  reference_code: string
  status: string
  reward_tier_id: string | null
  shipping_address: unknown
  public_name: string | null
  is_anonymous: boolean
  message: string | null
  payment_due_at: string | null
  refund_due_at: string | null
  fulfillment_status: string | null
  fulfillment_note: string | null
  fulfillment_updated_at: string | null
  created_at: string
}

/** bigint columns may arrive as strings, depending on the PostgREST setup. */
function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function toPledge(row: Record<string, unknown>): OwnPledge {
  return {
    ...(row as unknown as OwnPledge),
    intended_amount: num(row.intended_amount),
    received_amount: num(row.received_amount),
  }
}

/** The signed-in backer's pledge by reference code (RLS also lets organizers read, so match the user). */
export async function ownPledgeByCode(db: Db, userId: string, code: string): Promise<OwnPledge | null> {
  const { data, error } = await db
    .from("contributions")
    .select(PLEDGE_COLUMNS)
    .eq("reference_code", code)
    .eq("kind", "pledge")
    .eq("contributor_user_id", userId)
    .maybeSingle()
  if (error) throw error
  return data ? toPledge(data as unknown as Record<string, unknown>) : null
}

/** The signed-in backer's pledge by id. */
export async function ownPledgeById(db: Db, userId: string, id: string): Promise<OwnPledge | null> {
  const { data, error } = await db
    .from("contributions")
    .select(PLEDGE_COLUMNS)
    .eq("id", id)
    .eq("kind", "pledge")
    .eq("contributor_user_id", userId)
    .maybeSingle()
  if (error) throw error
  return data ? toPledge(data as unknown as Record<string, unknown>) : null
}

/** The backer's pledges on one campaign, newest first (at most one is open). */
export async function ownPledgesOnCampaign(db: Db, userId: string, campaignId: string): Promise<OwnPledge[]> {
  const { data, error } = await db
    .from("contributions")
    .select(PLEDGE_COLUMNS)
    .eq("campaign_id", campaignId)
    .eq("kind", "pledge")
    .eq("contributor_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toPledge)
}

function toTier(row: Record<string, unknown>): PublicRewardTier {
  return {
    ...(row as unknown as PublicRewardTier),
    min_amount: num(row.min_amount),
    quantity_claimed: num(row.quantity_claimed),
    quantity_limit: row.quantity_limit === null || row.quantity_limit === undefined ? null : num(row.quantity_limit),
    quantity_remaining:
      row.quantity_remaining === null || row.quantity_remaining === undefined ? null : num(row.quantity_remaining),
  }
}

/** Active tiers of a public campaign, in the creator's order. */
export async function listPublicTiers(db: Db, campaignId: string): Promise<PublicRewardTier[]> {
  const { data, error } = await db
    .from("public_reward_tiers")
    .select(PUBLIC_TIER_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toTier)
}

/** One active tier of a public campaign, or null. */
export async function getPublicTier(db: Db, campaignId: string, tierId: string): Promise<PublicRewardTier | null> {
  const { data, error } = await db
    .from("public_reward_tiers")
    .select(PUBLIC_TIER_COLUMNS)
    .eq("campaign_id", campaignId)
    .eq("id", tierId)
    .maybeSingle()
  if (error) throw error
  return data ? toTier(data as unknown as Record<string, unknown>) : null
}

/** A tier by id as the backer may read it (RLS: tiers of public campaigns), retired ones included. */
export async function getTierTitle(
  db: Db,
  tierId: string
): Promise<{ title: string; estimated_delivery: string | null } | null> {
  const { data, error } = await db
    .from("reward_tiers")
    .select("title, estimated_delivery")
    .eq("id", tierId)
    .maybeSingle()
  if (error) throw error
  return data as { title: string; estimated_delivery: string | null } | null
}

export interface PledgePayment {
  reference_code: string
  status: string
  intended_amount: number
  received_amount: number
  amount_due: number
  payment_due_at: string
  /** NULL when the campaign has no usable bank account right now. */
  account: { bank_bin: string; account_number: string; account_name: string } | null
}

interface PledgePaymentRow {
  reference_code: string
  status: string
  intended_amount: unknown
  received_amount: unknown
  amount_due: unknown
  payment_due_at: string
  channel: string | null
  bank_bin: string | null
  account_number: string | null
  account_name: string | null
}

/**
 * What the backer pays and where, from give.pledge_payment: a row only for
 * their own pledge waiting for payment before payment_due_at. The account is
 * the campaign's usable bank account (the creator's own, verified, in their
 * legal name), or null when it has none; a wallet counts as none, since Give
 * shows bank transfers only.
 */
export async function pledgePayment(
  service: Db,
  contributionId: string,
  userId: string
): Promise<PledgePayment | null> {
  const { data, error } = await service
    .rpc("pledge_payment", { p_contribution_id: contributionId, p_user_id: userId })
    .select(
      "reference_code, status, intended_amount, received_amount, amount_due, payment_due_at, channel, bank_bin, " +
        "account_number, account_name"
    )
    .maybeSingle()
  if (error) throw error
  const row = data as PledgePaymentRow | null
  if (!row) return null
  const usable = row.channel !== "crypto" && !!row.bank_bin && !!row.account_number
  return {
    reference_code: row.reference_code,
    status: row.status,
    intended_amount: num(row.intended_amount),
    received_amount: num(row.received_amount),
    amount_due: num(row.amount_due),
    payment_due_at: row.payment_due_at,
    account: usable
      ? {
          bank_bin: row.bank_bin as string,
          account_number: row.account_number as string,
          account_name: row.account_name ?? "",
        }
      : null,
  }
}
