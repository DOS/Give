import type { Db } from "./campaigns"
import { formatVnd } from "./format"

/**
 * Manual matching of incoming transactions that carried no usable reference
 * code (design section 2.4 "Phân loại lại", section 8 test 14). Such a
 * transaction is booked to 'unmatched_in'; give.match_transaction moves it to
 * 'received' with a reversal plus a post, so "đã thanh toán" (received +
 * unmatched_in) stays the same, and a second match is refused.
 *
 * Reads run with the caller's token: the campaign's organizer and
 * finance/admin staff see its transactions, contributions and ledger.
 */

/** Contribution statuses give.match_transaction accepts. */
export const MATCHABLE_STATUSES = [
  "awaiting_transfer",
  "expired",
  "received",
  "payment_due",
  "partially_paid",
  "paid",
] as const

const CONTRIBUTION_STATUS_LABELS: Record<string, string> = {
  awaiting_transfer: "chờ chuyển khoản",
  expired: "quá hạn",
  received: "đã nhận",
  payment_due: "đến hạn thanh toán",
  partially_paid: "đã trả một phần",
  paid: "đã trả đủ",
}

export interface UnmatchedTransaction {
  id: string
  campaign_id: string
  receiving_account_id: string
  provider_tx_id: string
  amount: number
  booked_at: string
  booked_date_only: boolean
  description: string | null
  counterparty_name: string | null
  counterparty_account_masked: string | null
  source: string
  after_close: boolean
}

const TX_COLUMNS =
  "id, campaign_id, receiving_account_id, provider_tx_id, amount, booked_at, booked_date_only, description, " +
  "counterparty_name, counterparty_account_masked, source, after_close"

/**
 * Incoming, attributed transactions without a match, newest first. Every
 * such transaction is posted to 'unmatched_in' when it is recorded
 * (give.record_bank_transaction -> give.match_transaction).
 */
export async function listUnmatched(
  db: Db,
  { campaignId, limit = 100 }: { campaignId?: string; limit?: number } = {}
): Promise<UnmatchedTransaction[]> {
  let query = db
    .from("bank_transactions")
    .select(`${TX_COLUMNS}, transaction_matches(bank_transaction_id)`)
    .eq("direction", "in")
    .not("campaign_id", "is", null)
    .is("transaction_matches", null)
  if (campaignId) query = query.eq("campaign_id", campaignId)
  const { data, error } = await query.order("booked_at", { ascending: false }).limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as (UnmatchedTransaction & { transaction_matches?: unknown })[]).map(
    ({ transaction_matches: _match, ...tx }) => ({ ...tx, amount: Number(tx.amount) })
  )
}

/** One incoming transaction the caller may read, with its match if any. */
export async function getIncoming(
  db: Db,
  id: string
): Promise<(UnmatchedTransaction & { direction: string; matched_to: string | null }) | null> {
  const { data, error } = await db
    .from("bank_transactions")
    .select(`${TX_COLUMNS}, direction, transaction_matches(contribution_id)`)
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const { transaction_matches: match, ...tx } = data as unknown as UnmatchedTransaction & {
    direction: string
    transaction_matches: { contribution_id: string } | { contribution_id: string }[] | null
  }
  const first = Array.isArray(match) ? match[0] : match
  return { ...tx, amount: Number(tx.amount), matched_to: first?.contribution_id ?? null }
}

export interface MatchCandidate {
  id: string
  kind: "donation" | "pledge"
  reference_code: string
  intended_amount: number
  received_amount: number
  status: string
  public_name: string | null
  guest_name: string | null
  is_anonymous: boolean
  created_at: string
}

const CANDIDATE_COLUMNS =
  "id, kind, reference_code, intended_amount, received_amount, status, public_name, guest_name, is_anonymous, created_at"

/**
 * Contributions of the campaign that can take money, newest first. The match
 * form puts those still waiting for exactly the transaction's amount first.
 */
export async function listMatchCandidates(db: Db, campaignId: string): Promise<MatchCandidate[]> {
  const { data, error } = await db
    .from("contributions")
    .select(CANDIDATE_COLUMNS)
    .eq("campaign_id", campaignId)
    .in("status", [...MATCHABLE_STATUSES])
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw error
  return ((data ?? []) as MatchCandidate[]).map((c) => ({
    ...c,
    intended_amount: Number(c.intended_amount),
    received_amount: Number(c.received_amount),
  }))
}

/** True when the contribution still waits for exactly this amount. */
export function waitsFor(c: Pick<MatchCandidate, "intended_amount" | "received_amount">, amount: number): boolean {
  return c.intended_amount - c.received_amount === amount
}

/** Finds a contribution of the campaign by id or by its reference code. */
export async function findContribution(
  db: Db,
  campaignId: string,
  by: { id: string } | { referenceCode: string }
): Promise<MatchCandidate | null> {
  let query = db.from("contributions").select(CANDIDATE_COLUMNS).eq("campaign_id", campaignId)
  query = "id" in by ? query.eq("id", by.id) : query.eq("reference_code", by.referenceCode)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data as MatchCandidate | null
}

/** "GV7K2M9QX · 200.000 ₫ · Nguyễn Văn A · chờ chuyển khoản" */
export function candidateLabel(c: MatchCandidate): string {
  const name = c.public_name ?? c.guest_name ?? (c.is_anonymous ? "Ẩn danh" : null)
  const status = CONTRIBUTION_STATUS_LABELS[c.status] ?? c.status
  return [c.reference_code, formatVnd(c.intended_amount), name, status].filter(Boolean).join(" · ")
}

/** Reference codes as donors type them: "gv 7k2m 9qx" -> "GV7K2M9QX". */
export function normalizeReferenceCode(input: string): string {
  return input.toUpperCase().replace(/[\s.-]/g, "")
}

export const REFERENCE_CODE = /^GV[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/

// ---------------------------------------------------------------------------
// "Đã thanh toán" and its two parts
// ---------------------------------------------------------------------------

export interface PaidBreakdown {
  /** SUM(received): money matched to contributions. */
  received: number
  /** SUM(unmatched_in): money in the account that no contribution claims yet. */
  unmatched: number
  /** received + unmatched: money that reached the receiving account. */
  paid: number
}

const PAGE = 1000
/** Stops reading a ledger larger than this; the page then shows no breakdown. */
const MAX_LEDGER_ROWS = 50_000

/**
 * Sums the campaign's 'received' and 'unmatched_in' ledger entries, reversals
 * included (they carry a negative amount). Null when the ledger is too large
 * to read here.
 */
export async function paidBreakdown(db: Db, campaignId: string): Promise<PaidBreakdown | null> {
  let received = 0
  let unmatched = 0
  for (let from = 0; ; from += PAGE) {
    if (from >= MAX_LEDGER_ROWS) return null
    const { data, error } = await db
      .from("ledger_entries")
      .select("id, bucket, amount")
      .eq("campaign_id", campaignId)
      .in("bucket", ["received", "unmatched_in"])
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as { bucket: string; amount: number | string }[]
    for (const row of rows) {
      if (row.bucket === "received") received += Number(row.amount)
      else unmatched += Number(row.amount)
    }
    if (rows.length < PAGE) break
  }
  return { received, unmatched, paid: received + unmatched }
}

/** The sentence a manual match ends with: test 14 says "đã thanh toán" does not move. */
export function paidAfterMatch(before: PaidBreakdown | null, after: PaidBreakdown | null): string {
  if (!before || !after) return ""
  if (before.paid === after.paid) {
    return ` Tổng đã thanh toán không đổi: ${formatVnd(after.paid)} (đã khớp ${formatVnd(before.received)} → ${formatVnd(after.received)}, chưa khớp ${formatVnd(before.unmatched)} → ${formatVnd(after.unmatched)}).`
  }
  return ` Tổng đã thanh toán hiện là ${formatVnd(after.paid)} (trước khi khớp: ${formatVnd(before.paid)}; có giao dịch khác vừa được ghi cùng lúc).`
}

// ---------------------------------------------------------------------------
// Manual matches made
// ---------------------------------------------------------------------------

export interface ManualMatch {
  bank_transaction_id: string
  contribution_id: string
  matched_at: string
  tx: { amount: number; booked_at: string; campaign_id: string }
  contribution: { reference_code: string } | null
}

/** The latest manual matches, of one campaign or of every campaign the caller may read. */
export async function listManualMatches(
  db: Db,
  { campaignId, limit = 30 }: { campaignId?: string; limit?: number } = {}
): Promise<ManualMatch[]> {
  let query = db
    .from("transaction_matches")
    .select(
      "bank_transaction_id, contribution_id, matched_at, tx:bank_transactions!inner(amount, booked_at, campaign_id), " +
        "contribution:contributions(reference_code)"
    )
    .eq("matched_by", "manual")
  if (campaignId) query = query.eq("tx.campaign_id", campaignId)
  const { data, error } = await query.order("matched_at", { ascending: false }).limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as ManualMatch[]).map((m) => ({ ...m, tx: { ...m.tx, amount: Number(m.tx.amount) } }))
}
