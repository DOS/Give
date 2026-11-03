import type { Db } from "./campaigns"

/**
 * The stop on payment requests of a succeeded back campaign (DOS/Give#89; DDL
 * in DOS-Me `supabase/migrations/20261106110000_give_pledge_net_refunds_and_payment_stop.sql`).
 *
 * When fraud is suspected after a project reached its goal, a moderator or
 * admin stops its payment requests (give.set_payment_requests_stopped):
 * reminders stop, give.pledge_payment returns nothing so the payment page
 * shows no transfer details, the backers still asked to pay and the creator
 * get a notice, and the campaign page shows the public note. The internal
 * reason stays in the audit log. Resuming brings the payment pages back. The
 * stop does not count against the backers: no pledge lapses while stopped,
 * and resuming moves the deadlines and the reminder days of the pledges still
 * waiting by the time it was stopped (owner decision on DOS/Give#89).
 */

/** Longest internal reason and public note the database keeps. */
export const STOP_REASON_MAX = 1000
export const STOP_PUBLIC_NOTE_MAX = 500

export interface PaymentStop {
  payments_stopped_at: string | null
  payments_stopped_note: string | null
}

/** Whether a moderator has stopped the campaign's payment requests. */
export function paymentRequestsStopped(campaign: Partial<PaymentStop> | null | undefined): boolean {
  return !!campaign?.payments_stopped_at
}

/** A succeeded back campaign as the moderator's list shows it (give.public_campaigns). */
export interface SucceededBackCampaign extends PaymentStop {
  id: string
  slug: string
  title: string
  outcome_at: string | null
  pledged_amount: number
  paid_amount: number
  refund_owed_amount: number
  backers_count: number
}

const SUCCEEDED_COLUMNS =
  "id, slug, title, outcome_at, pledged_amount, paid_amount, refund_owed_amount, backers_count, " +
  "payments_stopped_at, payments_stopped_note"

/** bigint sums may arrive as strings, depending on the PostgREST setup. */
function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Succeeded back campaigns, those with stopped payment requests first, then
 * the most recent outcome first. Public data only.
 */
export async function listSucceededBackCampaigns(db: Db, limit = 200): Promise<SucceededBackCampaign[]> {
  const { data, error } = await db
    .from("public_campaigns")
    .select(SUCCEEDED_COLUMNS)
    .eq("type", "back")
    .eq("status", "succeeded")
    .order("payments_stopped_at", { ascending: false, nullsFirst: false })
    .order("outcome_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as SucceededBackCampaign),
    pledged_amount: num(row.pledged_amount),
    paid_amount: num(row.paid_amount),
    refund_owed_amount: num(row.refund_owed_amount),
    backers_count: num(row.backers_count),
  }))
}
