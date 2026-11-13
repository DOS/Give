import type { Db } from "./campaigns"
import { formatVnd } from "./format"

/**
 * Manual matching of incoming transactions that carried no usable reference
 * code (design section 2.4 "Phân loại lại", section 8 test 14). Such a
 * transaction is booked to 'unmatched_in'; give.match_transaction moves it to
 * 'received' with a reversal plus a post, so "đã thanh toán" (received +
 * unmatched_in + other_in) stays the same, and a second match is refused.
 * Money that is not a donation (an organizer top-up, a bank fee refund or correction, interest)
 * is explained instead by finance/admin staff: give.explain_inbound_transaction
 * moves it to 'other_in' the same way (DOS/Give#49).
 *
 * Reads run with the caller's token: the campaign's organizer and
 * finance/admin staff see its transactions, contributions and ledger.
 */

/**
 * Why a transaction has no campaign (campaign_id NULL, never changed later):
 * no binding of its account covered its booking (give.binding_covers_booking:
 * no active binding, a draft campaign or one not yet submitted, after the
 * binding ended, or a verification transfer on the binding day), or the
 * account's owner was not the organizer of the bound campaign (DOS/Give#119).
 * Worded in DOS/Give#148.
 */
export const UNATTRIBUTED_CAUSES =
  "lúc nhận tiền, giao dịch nằm ngoài thời gian tài khoản gắn với một chiến dịch đã gửi duyệt (ví dụ khoản chuyển thử để xác minh tài khoản, tiền vào trước khi chiến dịch gửi duyệt hoặc sau khi tài khoản được nhả), hoặc tài khoản không thuộc về người tổ chức của chiến dịch được gắn"

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

/** An unmatched transaction with the owner of its receiving account, as far as the caller may read it. */
export interface UnmatchedRow extends UnmatchedTransaction {
  /**
   * receiving_accounts.owner_user_id, or null when the caller may not read the
   * account: finance/admin staff read every account, anyone else only the
   * accounts they own (receiving_accounts_read).
   */
  account_owner_id: string | null
  /**
   * The receiving account of the binding that attributed the transaction
   * (bank_transactions.binding_id), or null when the caller may not read the
   * binding. The organizer reads the bindings of their campaigns
   * (account_bindings_read).
   */
  binding_account_id: string | null
}

/**
 * Incoming, attributed transactions with neither a match nor an explanation,
 * newest first. Every such transaction is posted to 'unmatched_in' when it is
 * recorded (give.record_bank_transaction -> give.match_transaction).
 */
export async function listUnmatched(
  db: Db,
  { campaignId, limit = 100 }: { campaignId?: string; limit?: number } = {}
): Promise<{ transactions: UnmatchedRow[]; total: number }> {
  let query = db
    .from("bank_transactions")
    .select(
      `${TX_COLUMNS}, transaction_matches(bank_transaction_id), inbound_explanations(bank_transaction_id), ` +
        "account:receiving_accounts!receiving_account_id(owner_user_id), " +
        "binding:account_bindings!binding_id(receiving_account_id)",
      { count: "exact" }
    )
    .eq("direction", "in")
    .not("campaign_id", "is", null)
    .is("transaction_matches", null)
    .is("inbound_explanations", null)
  if (campaignId) query = query.eq("campaign_id", campaignId)
  const { data, error, count } = await query.order("booked_at", { ascending: false }).limit(limit)
  if (error) throw error
  const transactions = (
    (data ?? []) as unknown as (UnmatchedTransaction & {
      transaction_matches?: unknown
      inbound_explanations?: unknown
      account?: { owner_user_id: string } | { owner_user_id: string }[] | null
      binding?: { receiving_account_id: string } | { receiving_account_id: string }[] | null
    })[]
  ).map(({ transaction_matches: _match, inbound_explanations: _explanation, account, binding, ...tx }) => ({
    ...tx,
    amount: Number(tx.amount),
    account_owner_id: one(account)?.owner_user_id ?? null,
    binding_account_id: one(binding)?.receiving_account_id ?? null,
  }))
  return { transactions, total: count ?? transactions.length }
}

/**
 * True when the transaction's receiving account is not owned by its campaign's
 * organizer: give.match_transaction then refuses every match with
 * GIVE_ACCOUNT_OWNER_MISMATCH (DOS/Give#119). Only a transaction attributed
 * before the two came to differ (a direct data edit) is in this state; it
 * stays 'unmatched_in' and keeps blocking the release of the binding
 * (DOS/Give#148).
 *
 * Uses only what the reader may read. Staff read every account, so the owner
 * is compared. Organizers read only their own accounts, so an account they
 * cannot read is not theirs, but only when they can read the transaction's
 * binding and it points at that account: a missing binding or an account
 * left out for any other reason never shows the notice. False when the
 * organizer is unknown; the database refuses the match either way.
 */
export function accountOwnerMismatch(
  tx: Pick<UnmatchedRow, "receiving_account_id" | "account_owner_id" | "binding_account_id">,
  organizerId: string | null | undefined
): boolean {
  if (!organizerId) return false
  if (tx.account_owner_id !== null) return tx.account_owner_id !== organizerId
  return tx.binding_account_id !== null && tx.binding_account_id === tx.receiving_account_id
}

/** GIVE_ACCOUNT_OWNER_MISMATCH for the campaign's organizer (DOS/Give#136): only an admin data repair clears it. */
export const OWNER_MISMATCH_FOR_ORGANIZER =
  "Tài khoản nhận khoản tiền này không thuộc về người tổ chức của chiến dịch, nên giao dịch không khớp được. Hãy liên hệ đội ngũ Give để kiểm tra lại tài khoản nhận và chiến dịch."

/** The same for finance staff, who are the Give team: it goes to an admin. */
export const OWNER_MISMATCH_FOR_STAFF =
  "Tài khoản nhận khoản tiền này không thuộc về người tổ chức của chiến dịch, nên giao dịch không khớp được. Hãy báo quản trị viên kiểm tra lại tài khoản nhận và người tổ chức của chiến dịch trước khi xử lý giao dịch này."

/**
 * The notice an unmatched row shows instead of its match form when no match
 * can succeed (DOS/Give#148), worded for the reader; null otherwise.
 */
export function ownerMismatchNotice(
  tx: Pick<UnmatchedRow, "receiving_account_id" | "account_owner_id" | "binding_account_id">,
  organizerId: string | null | undefined,
  viewerId: string
): string | null {
  if (!accountOwnerMismatch(tx, organizerId)) return null
  return viewerId === organizerId ? OWNER_MISMATCH_FOR_ORGANIZER : OWNER_MISMATCH_FOR_STAFF
}

// ---------------------------------------------------------------------------
// Incoming money that belongs to no campaign (DOS/Give#148)
// ---------------------------------------------------------------------------

export interface UnattributedTransaction {
  id: string
  receiving_account_id: string
  provider_tx_id: string
  amount: number
  booked_at: string
  booked_date_only: boolean
  description: string | null
  counterparty_name: string | null
  counterparty_account_masked: string | null
  source: string
}

/**
 * Incoming transactions recorded with no campaign (campaign_id NULL: see
 * UNATTRIBUTED_CAUSES), newest first, with their count. Read with the
 * caller's token; under bank_transactions_read only finance/admin staff (and
 * the account's owner) read them. No campaign's totals include them, and no
 * action in the app attributes them.
 */
export async function listUnattributed(
  db: Db,
  { limit = 100 }: { limit?: number } = {}
): Promise<{ transactions: UnattributedTransaction[]; total: number }> {
  const { data, error, count } = await db
    .from("bank_transactions")
    .select(
      "id, receiving_account_id, provider_tx_id, amount, booked_at, booked_date_only, description, " +
        "counterparty_name, counterparty_account_masked, source",
      { count: "exact" }
    )
    .eq("direction", "in")
    .is("campaign_id", null)
    .order("booked_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  const transactions = ((data ?? []) as unknown as UnattributedTransaction[]).map((tx) => ({
    ...tx,
    amount: Number(tx.amount),
  }))
  return { transactions, total: count ?? transactions.length }
}

const SOURCE_LABELS: Record<string, string> = {
  webhook: "ngân hàng báo về",
  api_poll: "đọc từ ngân hàng",
  statement_import: "sao kê tải lên",
  chain_indexer: "chuỗi khối",
  manual: "nhập tay",
}

/** How the transaction reached Give, in words. */
export function transactionSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

/**
 * The organizer of each campaign, for finance/admin staff: authenticated may
 * not read campaigns.organizer_id, so it comes through give.managed_campaigns,
 * which returns every campaign to staff and only their own to organizers.
 */
export async function campaignOrganizers(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const { data, error } = await db.rpc("managed_campaigns", {}).select("id, organizer_id").in("id", unique)
  if (error) throw error
  return new Map(((data ?? []) as { id: string; organizer_id: string }[]).map((c) => [c.id, c.organizer_id]))
}

/** PostgREST embeds a one-to-one relation as an object; some setups send an array. */
function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

/** One incoming transaction the caller may read, with its match or explanation if any. */
export async function getIncoming(
  db: Db,
  id: string
): Promise<
  (UnmatchedTransaction & { direction: string; matched_to: string | null; explained_as: string | null }) | null
> {
  const { data, error } = await db
    .from("bank_transactions")
    .select(`${TX_COLUMNS}, direction, transaction_matches(contribution_id), inbound_explanations(kind)`)
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const {
    transaction_matches: match,
    inbound_explanations: explanation,
    ...tx
  } = data as unknown as UnmatchedTransaction & {
    direction: string
    transaction_matches: { contribution_id: string } | { contribution_id: string }[] | null
    inbound_explanations?: { kind: string } | { kind: string }[] | null
  }
  return {
    ...tx,
    amount: Number(tx.amount),
    matched_to: one(match)?.contribution_id ?? null,
    explained_as: one(explanation)?.kind ?? null,
  }
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
  const amount =
    c.received_amount > 0
      ? `${formatVnd(c.intended_amount)} (đã nhận ${formatVnd(c.received_amount)})`
      : formatVnd(c.intended_amount)
  return [c.reference_code, amount, name, status].filter(Boolean).join(" · ")
}

/** Reference codes as donors type them: "gv 7k2m 9qx" -> "GV7K2M9QX". */
export function normalizeReferenceCode(input: string): string {
  return input.toUpperCase().replace(/[\s.-]/g, "")
}

export const REFERENCE_CODE = /^GV[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/

// ---------------------------------------------------------------------------
// "Đã thanh toán" and its three parts
// ---------------------------------------------------------------------------

export interface PaidBreakdown {
  /** SUM(received): money matched to contributions. */
  received: number
  /** SUM(unmatched_in): money in the account that no contribution claims yet. */
  unmatched: number
  /** SUM(other_in): money in the account explained as not a donation. */
  other: number
  /** received + unmatched + other: money that reached the receiving account. */
  paid: number
}

/**
 * The campaign's 'received', 'unmatched_in' and 'other_in' ledger sums,
 * reversals included, in one read (give.campaign_paid, DOS/Give#56). It runs
 * with the caller's rights, so it reads the ledger under the same RLS as the
 * pages around it. Null when the database returns no row, or does not have
 * the function yet (the breakdown is only shown, so an app deployed before
 * the migration still matches and explains).
 */
export async function paidBreakdown(db: Db, campaignId: string): Promise<PaidBreakdown | null> {
  const { data, error } = await db.rpc("campaign_paid", { p_campaign_id: campaignId }).maybeSingle()
  if (error?.code === "PGRST202" || error?.code === "42883") return null
  if (error) throw error
  if (!data) return null
  const row = data as Record<"received_amount" | "unmatched_amount" | "other_amount" | "paid_amount", number | string>
  return {
    received: Number(row.received_amount),
    unmatched: Number(row.unmatched_amount),
    other: Number(row.other_amount),
    paid: Number(row.paid_amount),
  }
}

/** The sentence a manual match ends with: test 14 says "đã thanh toán" does not move. */
export function paidAfterMatch(before: PaidBreakdown | null, after: PaidBreakdown | null): string {
  if (!before || !after) return ""
  if (before.paid === after.paid) {
    return ` Tổng đã thanh toán không đổi: ${formatVnd(after.paid)} (đã khớp ${formatVnd(before.received)} → ${formatVnd(after.received)}, chưa khớp ${formatVnd(before.unmatched)} → ${formatVnd(after.unmatched)}).`
  }
  return ` Tổng đã thanh toán hiện là ${formatVnd(after.paid)} (trước khi khớp: ${formatVnd(before.paid)}; có giao dịch khác vừa được ghi cùng lúc).`
}

/** The sentence an explanation ends with: like a match, it only moves money between the parts. */
export function paidAfterExplain(before: PaidBreakdown | null, after: PaidBreakdown | null): string {
  if (!before || !after) return ""
  if (before.paid === after.paid) {
    return ` Tổng đã thanh toán không đổi: ${formatVnd(after.paid)} (chưa khớp ${formatVnd(before.unmatched)} → ${formatVnd(after.unmatched)}, không phải tiền ủng hộ ${formatVnd(before.other)} → ${formatVnd(after.other)}).`
  }
  return ` Tổng đã thanh toán hiện là ${formatVnd(after.paid)} (trước khi giải trình: ${formatVnd(before.paid)}; có giao dịch khác vừa được ghi cùng lúc).`
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

// ---------------------------------------------------------------------------
// Incoming money that is not a donation (DOS/Give#49)
// ---------------------------------------------------------------------------

/** give.inbound_explanations: reason and evidence, each up to this many characters. */
export const MAX_EXPLANATION_LENGTH = 1000

export interface InboundExplanation {
  bank_transaction_id: string
  kind: string
  reason: string
  evidence: string
  explained_at: string
  tx: { amount: number; booked_at: string; campaign_id: string }
}

/** The latest explanations of incoming money the caller may read (finance/admin staff: all). */
export async function listInboundExplanations(
  db: Db,
  { limit = 30 }: { limit?: number } = {}
): Promise<InboundExplanation[]> {
  const { data, error } = await db
    .from("inbound_explanations")
    .select(
      "bank_transaction_id, kind, reason, evidence, explained_at, tx:bank_transactions!inner(amount, booked_at, campaign_id)"
    )
    .order("explained_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as InboundExplanation[]).map((e) => ({
    ...e,
    tx: { ...e.tx, amount: Number(e.tx.amount) },
  }))
}
