import type { CampaignStatus, CampaignType, Db } from "./campaigns"
import type { ReceivingAccount } from "./receiving-accounts"

/**
 * A transfer between a campaign's own accounts after an account swap
 * (DOS/Give#84, first item; PO decision of 2026-11-03). DDL in DOS-Me
 * `supabase/migrations/20261115120000_give_own_account_transfer.sql`.
 *
 * After an approved swap (DOS/Give#55) the organizer often moves the balance
 * of the old account to the new one. Both legs are recorded for the campaign:
 * the outflow from the old account as spending to explain, the inflow on the
 * new one as unmatched money in, so the same money would count twice in
 * "đã thanh toán" and once more as spending. Finance or an admin marks the
 * pair (give.mark_own_account_transfer): both ledger posts are reversed, the
 * pair leaves the public paid and spending totals, the outgoing leg no
 * longer counts as unexplained, and the public statement labels both legs
 * OWN_TRANSFER_LABEL. Finance's reason and the counterparty stay private.
 *
 * Reads here run with the staff member's token (finance/admin read every
 * swap request, binding and transaction under RLS).
 */

/** The public label of both legs (give.public_statement.own_transfer_label). */
export const OWN_TRANSFER_LABEL = "Chuyển sang tài khoản mới"

/** give.own_account_transfers.reason: 1 to 1000 characters. */
export const OWN_TRANSFER_REASON_MAX = 1000

/** Approved swaps the page looks at, newest decision first. */
export const OWN_TRANSFER_SWAP_LIMIT = 100
/** Candidate transactions read per direction; a busier queue shows the oldest first. */
export const OWN_TRANSFER_LEG_LIMIT = 500

type AccountLabel = Pick<ReceivingAccount, "owner_user_id" | "channel" | "bank_bin" | "account_number" | "account_name">

interface SwapRow {
  id: string
  campaign_id: string
  old_binding_id: string
  new_binding_id: string | null
  decided_at: string | null
  campaign: { id: string; slug: string; title: string; status: CampaignStatus; type: CampaignType } | null
  old_binding: {
    id: string
    receiving_account_id: string
    released_at: string | null
    account: AccountLabel | null
  } | null
  new_binding: { id: string; receiving_account_id: string; bound_at: string; account: AccountLabel | null } | null
}

/** One leg candidate: a bank transaction of the campaign, as finance reads it. */
export interface TransferLeg {
  id: string
  campaign_id: string
  binding_id: string
  amount: number
  asset: string
  booked_at: string
  booked_date_only: boolean
  description: string | null
  counterparty_name: string | null
  counterparty_account_masked: string | null
}

/** An approved swap with the legs finance may pair for it. */
export interface SwapTransfers {
  swap_id: string
  campaign: SwapRow["campaign"]
  campaign_id: string
  decided_at: string | null
  old_account: AccountLabel | null
  new_account: AccountLabel | null
  /** Outgoing transactions on the old binding with no explanation and no pair, oldest first. */
  outs: TransferLeg[]
  /**
   * Incoming transactions with no match, explanation or pair on a binding of
   * the same campaign that an approved swap started at or after this swap's
   * old binding ended, on another account (the database's rule), oldest first.
   */
  ins: TransferLeg[]
}

const ACCOUNT_LABEL = "owner_user_id, channel, bank_bin, account_number, account_name"

// Two foreign keys point at account_bindings, so each binding is named by its constraint.
const SWAP_COLUMNS = `id, campaign_id, old_binding_id, new_binding_id, decided_at,
  campaign:campaigns(id, slug, title, status, type),
  old_binding:account_bindings!account_swap_requests_old_binding_id_fkey(id, receiving_account_id, released_at,
    account:receiving_accounts(${ACCOUNT_LABEL})),
  new_binding:account_bindings!account_swap_requests_new_binding_id_fkey(id, receiving_account_id, bound_at,
    account:receiving_accounts(${ACCOUNT_LABEL}))`.replace(/\s+/g, " ")

const LEG_COLUMNS =
  "id, campaign_id, binding_id, amount, asset, booked_at, booked_date_only, description, counterparty_name, counterparty_account_masked"

/** PostgREST embeds a to-one relation as an object; some setups send an array. */
function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

function toLeg(row: Record<string, unknown>): TransferLeg {
  const leg: Record<string, unknown> = {}
  for (const key of LEG_COLUMNS.split(", ")) leg[key] = row[key]
  return { ...(leg as unknown as TransferLeg), amount: Number(row.amount) }
}

/** The account label of a binding embed, whichever shape PostgREST sends. */
function accountOf(binding: { account: AccountLabel | AccountLabel[] | null } | null): AccountLabel | null {
  return binding ? one(binding.account) : null
}

/**
 * Approved swaps that still have an outgoing transaction to explain or pair
 * on their old account, with the incoming candidates of the same campaign.
 * A swap whose old account has nothing open is left out.
 */
export async function listSwapTransfers(db: Db): Promise<SwapTransfers[]> {
  const { data, error } = await db
    .from("account_swap_requests")
    .select(SWAP_COLUMNS)
    .eq("status", "approved")
    .order("decided_at", { ascending: false })
    .limit(OWN_TRANSFER_SWAP_LIMIT)
  if (error) throw error
  const swaps = ((data ?? []) as unknown as SwapRow[]).map((s) => ({
    ...s,
    campaign: one(s.campaign),
    old_binding: one(s.old_binding),
    new_binding: one(s.new_binding),
  }))
  if (swaps.length === 0) return []

  const oldBindingIds = [...new Set(swaps.map((s) => s.old_binding_id))]
  const newBindings = swaps.flatMap((s) => (s.new_binding ? [{ ...s.new_binding, campaign_id: s.campaign_id }] : []))
  const newBindingIds = [...new Set(newBindings.map((b) => b.id))]

  const [outs, ins] = await Promise.all([
    db
      .from("bank_transactions")
      .select(
        `${LEG_COLUMNS}, disbursements(bank_transaction_id), own_out:own_account_transfers!out_transaction_id(id)`
      )
      .in("binding_id", oldBindingIds)
      .eq("direction", "out")
      .is("disbursements", null)
      .is("own_out", null)
      .order("booked_at", { ascending: true })
      .limit(OWN_TRANSFER_LEG_LIMIT),
    newBindingIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : db
          .from("bank_transactions")
          .select(
            `${LEG_COLUMNS}, transaction_matches(bank_transaction_id), inbound_explanations(bank_transaction_id), ` +
              "own_in:own_account_transfers!in_transaction_id(id)"
          )
          .in("binding_id", newBindingIds)
          .eq("direction", "in")
          .not("campaign_id", "is", null)
          .is("transaction_matches", null)
          .is("inbound_explanations", null)
          .is("own_in", null)
          .order("booked_at", { ascending: true })
          .limit(OWN_TRANSFER_LEG_LIMIT),
  ])
  if (outs.error) throw outs.error
  if (ins.error) throw ins.error
  const outLegs = ((outs.data ?? []) as Record<string, unknown>[]).map(toLeg)
  const inLegs = ((ins.data ?? []) as Record<string, unknown>[]).map(toLeg)

  return swaps
    .map((s): SwapTransfers => {
      const released = s.old_binding?.released_at ?? null
      const oldAccountId = s.old_binding?.receiving_account_id ?? null
      // Bindings of this campaign that an approved swap started at or after the old one ended, on another account.
      const targets = new Set(
        newBindings
          .filter(
            (b) =>
              b.campaign_id === s.campaign_id &&
              released !== null &&
              new Date(b.bound_at).getTime() >= new Date(released).getTime() &&
              b.receiving_account_id !== oldAccountId
          )
          .map((b) => b.id)
      )
      return {
        swap_id: s.id,
        campaign: s.campaign,
        campaign_id: s.campaign_id,
        decided_at: s.decided_at,
        old_account: accountOf(s.old_binding),
        new_account: accountOf(s.new_binding),
        outs: outLegs.filter((t) => t.binding_id === s.old_binding_id && t.campaign_id === s.campaign_id),
        ins: inLegs.filter((t) => targets.has(t.binding_id) && t.campaign_id === s.campaign_id),
      }
    })
    .filter((s) => s.outs.length > 0)
}

/**
 * Incoming candidates that can pair with an outgoing leg: same amount and
 * asset (the database refuses any other), closest booking time first.
 */
export function pairCandidates(out: TransferLeg, ins: readonly TransferLeg[]): TransferLeg[] {
  const at = new Date(out.booked_at).getTime()
  return ins
    .filter((t) => t.amount === out.amount && t.asset === out.asset)
    .sort((a, b) => Math.abs(new Date(a.booked_at).getTime() - at) - Math.abs(new Date(b.booked_at).getTime() - at))
}

/** A marked pair, as finance reads it (marked_by is never granted to clients). */
export interface OwnTransfer {
  id: string
  campaign_id: string
  reason: string
  marked_at: string
  campaign: { slug: string; title: string } | null
  out_tx: { amount: number; asset: string; booked_at: string; booked_date_only: boolean } | null
  in_tx: { booked_at: string; booked_date_only: boolean } | null
}

/** The most recently marked pairs, newest first. */
export async function listOwnTransfers(db: Db, limit = 30): Promise<OwnTransfer[]> {
  const { data, error } = await db
    .from("own_account_transfers")
    .select(
      "id, campaign_id, reason, marked_at, campaign:campaigns(slug, title), " +
        "out_tx:bank_transactions!out_transaction_id(amount, asset, booked_at, booked_date_only), " +
        "in_tx:bank_transactions!in_transaction_id(booked_at, booked_date_only)"
    )
    .order("marked_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (
    (data ?? []) as unknown as (Omit<OwnTransfer, "campaign" | "out_tx" | "in_tx"> & {
      campaign: OwnTransfer["campaign"] | OwnTransfer["campaign"][]
      out_tx: OwnTransfer["out_tx"] | OwnTransfer["out_tx"][]
      in_tx: OwnTransfer["in_tx"] | OwnTransfer["in_tx"][]
    })[]
  ).map((row) => {
    const out = one(row.out_tx)
    return {
      ...row,
      campaign: one(row.campaign),
      out_tx: out ? { ...out, amount: Number(out.amount) } : null,
      in_tx: one(row.in_tx),
    }
  })
}
