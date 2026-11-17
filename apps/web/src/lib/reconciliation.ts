import type { Db } from "./campaigns"
import { VIA_CONTACT_EMAIL } from "./contact"
import { formatVnd, toVietnamLocalInput } from "./format"
import { isOwnContribution, type Viewer } from "./own-contribution"

/**
 * Manual matching of incoming transactions that carried no usable reference
 * code (design section 2.4 "Phân loại lại", section 8 test 14). Such a
 * transaction is booked to 'unmatched_in'; give.match_transaction moves it to
 * 'received' with a reversal plus a post, so "đã thanh toán" (received +
 * unmatched_in + other_in) stays the same, and a second match is refused.
 * Money that is not a donation (an organizer top-up, a bank fee refund or correction, interest)
 * is explained instead by finance/admin staff: give.explain_inbound_transaction
 * moves it to 'other_in' the same way (DOS/Give#49). Money a bank returned
 * from a transfer out (a bounced payment or refund) is linked to that
 * outgoing transaction instead: give.link_returned_transfer reverses the
 * 'unmatched_in' post and nets the outgoing post (DOS/Give#72). An admin can
 * send a mistaken explanation back to 'unmatched_in'
 * (give.return_inbound_to_unmatched, DOS/Give#196): the explanation row stays,
 * superseded by its row in give.inbound_explanation_returns, and the money is
 * unmatched again until it is matched; it is never explained again.
 *
 * Reads run with the caller's token: the campaign's organizer and
 * finance/admin staff see its transactions, contributions and ledger.
 */

/**
 * Why a transaction has no campaign (campaign_id NULL, never changed later),
 * as possible causes after "Lý do có thể là: ". When it was recorded, no
 * binding of its account covered its booking (give.binding_covers_booking:
 * no binding, a draft campaign or one not yet submitted, a verification
 * transfer on the binding day, booked on the old account from an approved
 * swap on, booked after the binding ended, or recorded after an ordinary
 * release, since only bindings a swap ended are searched),
 * or the account's owner was not the organizer of the bound campaign
 * (DOS/Give#119). Worded in DOS/Give#148.
 */
export const UNATTRIBUTED_CAUSES =
  "khoản chuyển thử để xác minh tài khoản; tiền vào khi tài khoản chưa gắn với chiến dịch nào hoặc khi chiến dịch chưa gửi duyệt; tiền vào tài khoản cũ sau khi chiến dịch đã đổi sang tài khoản khác; tiền vào sau khi tài khoản được nhả, hoặc tiền vào trước đó nhưng đến khi tài khoản đã được nhả mới được ghi nhận (ví dụ sao kê nhập muộn); hoặc tài khoản không thuộc về người tổ chức của chiến dịch được gắn"

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
  asset: string
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
  "id, campaign_id, receiving_account_id, provider_tx_id, asset, amount, booked_at, booked_date_only, description, " +
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
  /**
   * The explanation an admin sent back to unmatched (DOS/Give#196), or null
   * for money that was never explained. Such money is matched like any other
   * unmatched money, and never explained again or linked as a returned transfer.
   */
  returned_explanation: ReturnedExplanation | null
}

/** A mistaken explanation that was returned to unmatched, as clients may read it (returned_by is never granted). */
export interface ReturnedExplanation {
  /** The kind the explanation gave, now superseded. */
  kind: string
  /** Why the admin returned it. */
  reason: string
  returned_at: string
}

const UNMATCHED_EMBEDS =
  "transaction_matches(bank_transaction_id), own_in:own_account_transfers!in_transaction_id(id), " +
  "returned_transfers!bank_transaction_id(bank_transaction_id), " +
  "account:receiving_accounts!receiving_account_id(owner_user_id), " +
  "binding:account_bindings!binding_id(receiving_account_id)"

type ReturnRef = { reason: string; returned_at: string }

type UnmatchedRead = UnmatchedTransaction & {
  transaction_matches?: unknown
  inbound_explanations?: unknown
  explanation?:
    | { kind: string; returned?: ReturnRef | ReturnRef[] | null }
    | { kind: string; returned?: ReturnRef | ReturnRef[] | null }[]
    | null
  own_in?: unknown
  returned_transfers?: unknown
  account?: { owner_user_id: string } | { owner_user_id: string }[] | null
  binding?: { receiving_account_id: string } | { receiving_account_id: string }[] | null
}

/**
 * Incoming, attributed transactions with no match, no explanation that still
 * stands, and no link as a returned transfer, newest first, with their
 * count. Every such transaction is posted to 'unmatched_in' when it is
 * recorded (give.record_bank_transaction -> give.match_transaction), or again
 * when an admin returns its explanation (DOS/Give#196). The incoming leg of a
 * transfer between the campaign's own accounts (DOS/Give#84) is settled and
 * cannot be matched, so it is left out. give.returned_transfers has two
 * foreign keys to bank_transactions, so the embed names the incoming one
 * (DOS/Give#72).
 *
 * Two reads, both with the caller's token: transactions never explained, and
 * transactions whose explanation has a return row (both embeds required, so
 * only returned explanations pass; the return is read under its RLS, which
 * follows the transaction). PostgREST cannot say "no explanation, or a
 * returned one" in one filter. The two sets are disjoint, so the total is
 * their sum and nothing is listed twice.
 */
export async function listUnmatched(
  db: Db,
  { campaignId, limit = 100 }: { campaignId?: string; limit?: number } = {}
): Promise<{ transactions: UnmatchedRow[]; total: number }> {
  const read = (explanation: string, neverExplained: boolean) => {
    let query = db
      .from("bank_transactions")
      .select(`${TX_COLUMNS}, ${UNMATCHED_EMBEDS}, ${explanation}`, { count: "exact" })
      .eq("direction", "in")
      .not("campaign_id", "is", null)
      .is("transaction_matches", null)
      .is("own_in", null)
      .is("returned_transfers", null)
    if (neverExplained) query = query.is("inbound_explanations", null)
    if (campaignId) query = query.eq("campaign_id", campaignId)
    // The id breaks ties at the limit, so both reads cut the same way the merge sorts.
    return query.order("booked_at", { ascending: false }).order("id", { ascending: false }).limit(limit)
  }
  const [open, returned] = await Promise.all([
    read("inbound_explanations(bank_transaction_id)", true),
    read(
      "explanation:inbound_explanations!inner(kind, returned:inbound_explanation_returns!inner(reason, returned_at))",
      false
    ),
  ])
  if (open.error) throw open.error
  if (returned.error) throw returned.error
  const rows = [
    ...((open.data ?? []) as unknown as UnmatchedRead[]),
    ...((returned.data ?? []) as unknown as UnmatchedRead[]),
  ]
  const transactions = rows
    .map(
      ({
        transaction_matches: _match,
        inbound_explanations: _explanation,
        explanation,
        own_in: _pair,
        returned_transfers: _returned,
        account,
        binding,
        ...tx
      }): UnmatchedRow => {
        const e = one(explanation)
        const r = one(e?.returned)
        return {
          ...tx,
          amount: Number(tx.amount),
          account_owner_id: one(account)?.owner_user_id ?? null,
          binding_account_id: one(binding)?.receiving_account_id ?? null,
          returned_explanation: e && r ? { kind: e.kind, reason: r.reason, returned_at: r.returned_at } : null,
        }
      }
    )
    .sort((a, b) => Date.parse(b.booked_at) - Date.parse(a.booked_at) || b.id.localeCompare(a.id))
    .slice(0, limit)
  const total = (open.count ?? (open.data ?? []).length) + (returned.count ?? (returned.data ?? []).length)
  return { transactions, total }
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
export const OWNER_MISMATCH_FOR_ORGANIZER = `Tài khoản nhận khoản tiền này không thuộc về người tổ chức của chiến dịch, nên giao dịch không khớp được. Hãy liên hệ đội ngũ Give ${VIA_CONTACT_EMAIL} để kiểm tra lại tài khoản nhận và chiến dịch.`

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

type CorrectionRef = { contribution_id: string }
type ExplanationRef = {
  kind: string
  inbound_explanation_corrections?: CorrectionRef | CorrectionRef[] | null
  inbound_explanation_returns?: { returned_at: string } | { returned_at: string }[] | null
}

/**
 * One incoming transaction the caller may read, with its match, explanation
 * or return link if any. A corrected explanation (DOS/Give#71) is superseded
 * by its correction: the transaction is matched to the correction's
 * contribution and no longer explained, so explained_as is null and
 * corrected_to names that contribution. A returned explanation (DOS/Give#196)
 * is superseded by its return: explained_as is null and explanation_returned
 * is true; the money is unmatched until it is matched (matched_to).
 */
export async function getIncoming(
  db: Db,
  id: string
): Promise<
  | (UnmatchedTransaction & {
      direction: string
      matched_to: string | null
      explained_as: string | null
      /** The contribution a correction of its explanation credited the money to (DOS/Give#71). */
      corrected_to: string | null
      /** The outgoing transaction it was linked to as returned money (DOS/Give#72). */
      returned_of: string | null
      /** Its explanation was returned to unmatched (DOS/Give#196): it is never explained, corrected or linked again. */
      explanation_returned: boolean
    })
  | null
> {
  const { data, error } = await db
    .from("bank_transactions")
    .select(
      `${TX_COLUMNS}, direction, transaction_matches(contribution_id), ` +
        "inbound_explanations(kind, inbound_explanation_corrections(contribution_id), inbound_explanation_returns(returned_at)), " +
        "returned_transfers!bank_transaction_id(original_transaction_id)"
    )
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const {
    transaction_matches: match,
    inbound_explanations: explanation,
    returned_transfers: returned,
    ...tx
  } = data as unknown as UnmatchedTransaction & {
    direction: string
    transaction_matches: { contribution_id: string } | { contribution_id: string }[] | null
    inbound_explanations?: ExplanationRef | ExplanationRef[] | null
    returned_transfers?: { original_transaction_id: string } | { original_transaction_id: string }[] | null
  }
  const explained = one(explanation)
  const corrected = one(explained?.inbound_explanation_corrections)?.contribution_id ?? null
  const explanationReturned = one(explained?.inbound_explanation_returns) !== null
  return {
    ...tx,
    amount: Number(tx.amount),
    matched_to: corrected ?? one(match)?.contribution_id ?? null,
    explained_as: corrected || explanationReturned ? null : (explained?.kind ?? null),
    corrected_to: corrected,
    returned_of: one(returned)?.original_transaction_id ?? null,
    explanation_returned: explanationReturned,
  }
}

export interface MatchCandidate {
  id: string
  kind: "donation" | "pledge"
  reference_code: string
  intended_amount: number
  received_amount: number
  /** Sum of the contribution's 'refunded' ledger entries (posts and reversals). */
  refunded_amount: number
  status: string
  public_name: string | null
  guest_name: string | null
  is_anonymous: boolean
  created_at: string
  /** The signed-in contributor, null for a guest: staff never credit money to their own (GIVE_SELF_REVIEW). */
  contributor_user_id?: string | null
}

export interface ContributionTarget {
  id: string
  reference_code: string
  status: string
  /** The signed-in contributor, null for a guest (DOS/Give#71: staff never credit their own). */
  contributor_user_id: string | null
  /** A guest's email, read with the actor's token only to apply the own-contribution rule (DOS/Give#199). */
  guest_email: string | null
}

const CANDIDATE_COLUMNS =
  "id, kind, reference_code, intended_amount, received_amount, status, public_name, guest_name, is_anonymous, created_at, " +
  "contributor_user_id"

function toAmount(value: unknown): number {
  if (typeof value !== "number" && (typeof value !== "string" || value.trim() === "")) {
    throw new Error("Invalid money amount")
  }
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error("Invalid money amount")
  return n
}

/**
 * Contributions of the campaign that can take money, newest first, with their
 * ledger refunds read under the caller's RLS (ledger_entries_read: the
 * campaign's organizer and finance/admin staff). Never falls back to gross if
 * refunds are missing. The match form puts those still waiting for the
 * transaction's net amount due first (DOS/Give#93). The viewer's own
 * contributions, signed in or as a guest with their email, are left out:
 * nobody matches or credits money to their own (DOS/Give#199). guest_email
 * is read for that and dropped.
 */
export async function listMatchCandidates(db: Db, campaignId: string, viewer: Viewer): Promise<MatchCandidate[]> {
  const { data, error } = await db
    .from("contributions")
    .select(`${CANDIDATE_COLUMNS}, guest_email, refunds:ledger_entries!contribution_id(amount)`)
    .eq("campaign_id", campaignId)
    .in("status", [...MATCHABLE_STATUSES])
    .eq("refunds.bucket", "refunded")
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw error
  return (
    (data ?? []) as unknown as (Omit<MatchCandidate, "refunded_amount"> & {
      guest_email?: string | null
      refunds?: { amount: unknown }[] | null
    })[]
  ).flatMap(({ refunds, guest_email, ...c }) => {
    if (!Array.isArray(refunds)) {
      throw new Error("Match candidate query did not return ledger refunds")
    }
    if (isOwnContribution({ contributor_user_id: c.contributor_user_id, guest_email }, viewer)) return []
    return {
      ...c,
      intended_amount: toAmount(c.intended_amount),
      received_amount: toAmount(c.received_amount),
      refunded_amount: refunds.reduce((sum, r) => sum + toAmount(r.amount), 0),
    }
  })
}

/**
 * True when the contribution still waits for this exact amount:
 * - pledges ('payment_due', 'partially_paid'): net amount due
 *   intended - (received - refunded), matching give.pledge_payment and
 *   give.pledge_balances (DOS/Give#89, DOS/Give#93); a 'paid' pledge is
 *   already settled (a later partial refund is compensation, not due again);
 * - donations: intended - received while nothing has been refunded (a refunded
 *   gift is never owed back by the donor, even though status stays 'received').
 */
export function waitsFor(
  c: Pick<MatchCandidate, "kind" | "status" | "intended_amount" | "received_amount" | "refunded_amount">,
  amount: number
): boolean {
  if (!(amount > 0)) return false
  if (c.kind === "pledge") {
    if (c.status !== "payment_due" && c.status !== "partially_paid") return false
    return c.intended_amount - (c.received_amount - c.refunded_amount) === amount
  }
  if (c.refunded_amount > 0) return false
  return c.intended_amount - c.received_amount === amount
}

/** Finds a contribution of the campaign by id or by its reference code. */
export async function findContribution(
  db: Db,
  campaignId: string,
  by: { id: string } | { referenceCode: string }
): Promise<ContributionTarget | null> {
  let query = db
    .from("contributions")
    .select("id, reference_code, status, contributor_user_id, guest_email")
    .eq("campaign_id", campaignId)
  query = "id" in by ? query.eq("id", by.id) : query.eq("reference_code", by.referenceCode)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data as ContributionTarget | null
}

/** "GV7K2M9QX · 200.000 ₫ · Nguyễn Văn A · chờ chuyển khoản" */
export function candidateLabel(c: MatchCandidate): string {
  const name = c.public_name ?? c.guest_name ?? (c.is_anonymous ? "Ẩn danh" : null)
  const status = CONTRIBUTION_STATUS_LABELS[c.status] ?? c.status
  const progress =
    c.received_amount > 0 || c.refunded_amount > 0
      ? `đã nhận ${formatVnd(c.received_amount)}${c.refunded_amount > 0 ? `, đã hoàn ${formatVnd(c.refunded_amount)}` : ""}`
      : null
  const amount = progress ? `${formatVnd(c.intended_amount)} (${progress})` : formatVnd(c.intended_amount)
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
  /** Its correction, once an admin corrected it (DOS/Give#71): the explanation is then superseded. */
  correction: InboundCorrection | null
  /** Its return to unmatched, once an admin returned it (DOS/Give#196): the explanation is then superseded. */
  returned: InboundReturn | null
  /**
   * Whether the account binding of its transaction is released (null when
   * the reader may not read the binding): a released binding takes no
   * unmatched money again, so the return is refused (GIVE_BINDING_RELEASED).
   */
  binding_released: boolean | null
}

/** give.inbound_explanation_returns as clients may read it (returned_by is never granted). */
export interface InboundReturn {
  reason: string
  returned_at: string
}

/** give.inbound_explanation_corrections as clients may read it (corrected_by is never granted). */
export interface InboundCorrection {
  contribution_id: string
  reason: string
  corrected_at: string
  contribution: { reference_code: string } | null
}

type ReleasedRef = { released_at: string | null }
type InboundExplanationRow = Omit<InboundExplanation, "correction" | "returned" | "binding_released" | "tx"> & {
  tx: InboundExplanation["tx"] & { binding?: ReleasedRef | ReleasedRef[] | null }
  correction?: InboundCorrection | InboundCorrection[] | null
  returned?: InboundReturn | InboundReturn[] | null
}

/**
 * The latest explanations of incoming money the caller may read
 * (finance/admin staff: all), with any correction or return to unmatched,
 * and whether the transaction's binding is released.
 */
export async function listInboundExplanations(
  db: Db,
  { limit = 30 }: { limit?: number } = {}
): Promise<InboundExplanation[]> {
  const { data, error } = await db
    .from("inbound_explanations")
    .select(
      "bank_transaction_id, kind, reason, evidence, explained_at, " +
        "tx:bank_transactions!inner(amount, booked_at, campaign_id, binding:account_bindings!binding_id(released_at)), " +
        "correction:inbound_explanation_corrections(contribution_id, reason, corrected_at, contribution:contributions(reference_code)), " +
        "returned:inbound_explanation_returns(reason, returned_at)"
    )
    .order("explained_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as InboundExplanationRow[]).map(({ correction, returned, tx, ...e }) => {
    const c = one(correction)
    const { binding, ...rest } = tx
    const b = one(binding)
    return {
      ...e,
      tx: { ...rest, amount: Number(rest.amount) },
      correction: c ? { ...c, contribution: one(c.contribution) } : null,
      returned: one(returned),
      binding_released: b ? b.released_at !== null : null,
    }
  })
}

// ---------------------------------------------------------------------------
// Correcting a mistaken explanation (DOS/Give#71)
// ---------------------------------------------------------------------------

/** give.inbound_explanation_corrections.reason: up to this many characters. */
export const MAX_CORRECTION_REASON_LENGTH = 1000

/** The audit action give.explain_inbound_transaction writes, with the explaining staff member as actor. */
const EXPLAIN_AUDIT_ACTION = "bank_transaction.explain_inbound"

/**
 * Who explained each transaction, from give.audit_log (admins only under
 * RLS; inbound_explanations.explained_by is not granted to clients). Used to
 * hide the correction from the admin who made the explanation, since
 * give.correct_inbound_explanation refuses them (GIVE_SELF_REVIEW). A
 * transaction without an audit row, or with no actor on it, is left out.
 */
export async function explainersOf(db: Db, transactionIds: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(transactionIds)]
  if (unique.length === 0) return new Map()
  const { data, error } = await db
    .from("audit_log")
    .select("entity_id, actor_id")
    .eq("action", EXPLAIN_AUDIT_ACTION)
    .eq("entity", "bank_transaction")
    .in("entity_id", unique)
  if (error) throw error
  const explainers = new Map<string, string>()
  for (const row of (data ?? []) as { entity_id: string; actor_id: string | null }[]) {
    if (row.actor_id) explainers.set(row.entity_id, row.actor_id)
  }
  return explainers
}

/**
 * Why the viewer may not correct this explanation, worded for them, or null
 * when they may. Mirrors the refusals give.correct_inbound_explanation
 * raises before it looks at the contribution: admins only (not finance: the
 * correction undoes a finance decision), never on their own campaign or
 * their own explanation (GIVE_SELF_REVIEW), and once only. The database
 * still checks all of it under its locks.
 */
export function correctionBlocked(
  e: Pick<InboundExplanation, "correction"> & Partial<Pick<InboundExplanation, "returned">>,
  viewer: { id: string; isAdmin: boolean; organizerId?: string | null; explainerId?: string | null }
): string | null {
  if (!viewer.isAdmin || e.correction || e.returned) return null
  if (viewer.organizerId === viewer.id) {
    return "Bạn là người tổ chức chiến dịch này, nên không sửa được giải trình. Nhờ một quản trị viên khác."
  }
  if (viewer.explainerId === viewer.id) {
    return "Bạn là người đã giải trình khoản này, nên không tự sửa được. Nhờ một quản trị viên khác."
  }
  return null
}

/**
 * Contributions an admin may credit corrected money to: not their own
 * (GIVE_SELF_REVIEW). listMatchCandidates already leaves out the viewer's
 * own, guest ones with their email included (DOS/Give#199); this keeps the
 * signed-in check for a list read some other way.
 */
export function correctionCandidates(candidates: readonly MatchCandidate[], viewerId: string): MatchCandidate[] {
  return candidates.filter((c) => c.contributor_user_id !== viewerId)
}

/** The sentence a correction ends with: the money moves from "not a donation" to matched, paid does not move. */
export function paidAfterCorrect(before: PaidBreakdown | null, after: PaidBreakdown | null): string {
  if (!before || !after) return ""
  if (before.paid === after.paid) {
    return ` Tổng đã thanh toán không đổi: ${formatVnd(after.paid)} (đã khớp ${formatVnd(before.received)} → ${formatVnd(after.received)}, không phải tiền ủng hộ ${formatVnd(before.other)} → ${formatVnd(after.other)}).`
  }
  return ` Tổng đã thanh toán hiện là ${formatVnd(after.paid)} (trước khi sửa: ${formatVnd(before.paid)}; có giao dịch khác vừa được ghi cùng lúc).`
}

// ---------------------------------------------------------------------------
// Returning a mistaken explanation to unmatched (DOS/Give#196)
// ---------------------------------------------------------------------------

/** give.inbound_explanation_returns.reason: up to this many characters. */
export const MAX_RETURN_TO_UNMATCHED_REASON_LENGTH = 1000

/** What happens after a return, said wherever an admin can return an explanation. */
export const RETURN_TO_UNMATCHED_EFFECT =
  'Sau khi đưa về, khoản tiền tính là chưa khớp: người tổ chức hoặc nhân viên tài chính khớp được với một lượt ủng hộ của chiến dịch, nhưng không giải trình lại được là "không phải tiền ủng hộ", không sửa giải trình được và không ghi nhận được là tiền bị ngân hàng trả lại. Mỗi giao dịch chỉ đưa về được một lần.'

/**
 * An explanation an admin may still return or correct: neither corrected nor
 * returned (the two exclude each other, and each happens once).
 */
export function explanationOpen(e: Pick<InboundExplanation, "correction" | "returned">): boolean {
  return !e.correction && !e.returned
}

/**
 * Why the viewer may not return this explanation to unmatched, worded for
 * them, or null when they may. Mirrors the refusals of
 * give.return_inbound_to_unmatched that the page can see: admins only, never
 * on their own campaign or their own explanation (GIVE_SELF_REVIEW), and not
 * once the transaction's binding is released (GIVE_BINDING_RELEASED). A
 * corrected or returned explanation offers nothing (null). The database
 * checks all of it again under its locks.
 */
export function returnToUnmatchedBlocked(
  e: Pick<InboundExplanation, "correction" | "returned" | "binding_released">,
  viewer: { id: string; isAdmin: boolean; organizerId?: string | null; explainerId?: string | null }
): string | null {
  if (!viewer.isAdmin || !explanationOpen(e)) return null
  if (viewer.organizerId === viewer.id) {
    return "Bạn là người tổ chức chiến dịch này, nên không đưa được khoản này về chưa khớp. Nhờ một quản trị viên khác."
  }
  if (viewer.explainerId === viewer.id) {
    return "Bạn là người đã giải trình khoản này, nên không tự đưa về chưa khớp được. Nhờ một quản trị viên khác."
  }
  if (e.binding_released) {
    return 'Tài khoản nhận đã được nhả khỏi chiến dịch, nên khoản này không đưa về chưa khớp được nữa. Nếu đây là tiền ủng hộ của một lượt đã biết, dùng "Sửa giải trình".'
  }
  return null
}

/** The sentence a return ends with: the money moves from "not a donation" back to unmatched, paid does not move. */
export function paidAfterReturnToUnmatched(before: PaidBreakdown | null, after: PaidBreakdown | null): string {
  if (!before || !after) return ""
  if (before.paid === after.paid) {
    return ` Tổng đã thanh toán không đổi: ${formatVnd(after.paid)} (không phải tiền ủng hộ ${formatVnd(before.other)} → ${formatVnd(after.other)}, chưa khớp ${formatVnd(before.unmatched)} → ${formatVnd(after.unmatched)}).`
  }
  return ` Tổng đã thanh toán hiện là ${formatVnd(after.paid)} (trước khi đưa về: ${formatVnd(before.paid)}; có giao dịch khác vừa được ghi cùng lúc).`
}

// ---------------------------------------------------------------------------
// Money a bank returned from a transfer out (DOS/Give#72)
// ---------------------------------------------------------------------------

/** What give.link_returned_transfer did: the outgoing transaction was a payment or a refund. */
export type ReturnOutcome = "disbursement_returned" | "refund_returned"

/**
 * An outgoing transaction that a returned incoming one may be linked to:
 * explained (give.disbursements) and not returned yet. A leg of an
 * own-account transfer has no disbursements row, so it is never one.
 */
export interface ReturnCandidate {
  id: string
  campaign_id: string
  receiving_account_id: string
  asset: string
  amount: number
  booked_at: string
  booked_date_only: boolean
  counterparty_account_masked: string | null
  is_refund: boolean
  purpose: string
  /** For a refund, the refunded contribution's reference code, when the reader may read it. */
  refund_reference_code: string | null
}

type RefundedContribution = { reference_code: string; contributor_user_id: string | null; guest_email: string | null }

type CandidateDisbursement = {
  is_refund: boolean
  purpose: string
  refund: RefundedContribution | RefundedContribution[] | null
}

interface ReturnCandidateRow extends Omit<ReturnCandidate, "is_refund" | "purpose" | "refund_reference_code"> {
  disbursement: CandidateDisbursement | CandidateDisbursement[] | null
  returned_transfers?: unknown
}

/** Outgoing transactions read per campaign for the link form. */
export const RETURN_CANDIDATE_LIMIT = 200

/**
 * Explained outgoing transactions of the campaign that no incoming
 * transaction returned yet, newest first, at most RETURN_CANDIDATE_LIMIT.
 * Read with the caller's token: finance/admin staff read every campaign's
 * transactions and explanations. A refund to the viewer's own contribution
 * (signed in or as a guest with their email) is left out: linking its return
 * makes the refund owed to them again (DOS/Give#199). The contribution's
 * contributor and guest email are read for that and dropped.
 */
export async function listReturnCandidates(db: Db, campaignId: string, viewer: Viewer): Promise<ReturnCandidate[]> {
  const { data, error } = await db
    .from("bank_transactions")
    .select(
      "id, campaign_id, receiving_account_id, asset, amount, booked_at, booked_date_only, counterparty_account_masked, " +
        "disbursement:disbursements!inner(is_refund, purpose, " +
        "refund:contributions!refund_contribution_id(reference_code, contributor_user_id, guest_email)), " +
        "returned_transfers!original_transaction_id(bank_transaction_id)"
    )
    .eq("direction", "out")
    .eq("campaign_id", campaignId)
    .is("returned_transfers", null)
    .order("booked_at", { ascending: false })
    .limit(RETURN_CANDIDATE_LIMIT)
  if (error) throw error
  return ((data ?? []) as unknown as ReturnCandidateRow[]).flatMap(
    ({ disbursement, returned_transfers: _returned, ...tx }) => {
      const d = one(disbursement)
      if (!d) return []
      const refund = one(d.refund)
      if (d.is_refund && refund && isOwnContribution(refund, viewer)) return []
      return [
        {
          ...tx,
          amount: toAmount(tx.amount),
          is_refund: d.is_refund,
          purpose: d.purpose,
          refund_reference_code: refund?.reference_code ?? null,
        },
      ]
    }
  )
}

/** The local day (Vietnam time) of an ISO time, "2026-11-15". */
function vietnamDay(iso: string): string {
  return toVietnamLocalInput(iso).slice(0, 10)
}

/**
 * The candidates give.link_returned_transfer would accept for this incoming
 * transaction: same campaign, receiving account and asset, an amount not
 * below it (the bank may keep a fee), booked no later by local day. The
 * database checks all of this again under its locks.
 */
export function returnCandidatesFor(
  tx: Pick<UnmatchedTransaction, "campaign_id" | "receiving_account_id" | "asset" | "amount" | "booked_at">,
  candidates: readonly ReturnCandidate[]
): ReturnCandidate[] {
  const day = vietnamDay(tx.booked_at)
  return candidates.filter(
    (c) =>
      c.campaign_id === tx.campaign_id &&
      c.receiving_account_id === tx.receiving_account_id &&
      c.asset === tx.asset &&
      c.amount >= tx.amount &&
      vietnamDay(c.booked_at) <= day
  )
}

/** "−2.000.000 ₫ · 03/11/2026 · Hoàn tiền GV7K2M9QX · Hoàn tiền vì chiến dịch dừng" */
export function returnCandidateLabel(c: ReturnCandidate): string {
  const day = vietnamDay(c.booked_at).split("-").reverse().join("/")
  const kind = c.is_refund ? ["Hoàn tiền", c.refund_reference_code].filter(Boolean).join(" ") : "Khoản chi"
  const purpose = c.purpose.length > 60 ? `${c.purpose.slice(0, 59)}…` : c.purpose
  return [`−${formatVnd(c.amount)}`, day, kind, purpose].filter(Boolean).join(" · ")
}

/** The sentence a link ends with: "đã thanh toán" drops by the returned amount, which it had counted as money in. */
export function paidAfterReturn(before: PaidBreakdown | null, after: PaidBreakdown | null, amount: number): string {
  if (!before || !after) return ""
  if (before.paid - after.paid === amount && before.unmatched - after.unmatched === amount) {
    return ` Tổng đã thanh toán giảm từ ${formatVnd(before.paid)} xuống ${formatVnd(after.paid)} (chưa khớp ${formatVnd(before.unmatched)} → ${formatVnd(after.unmatched)}): tiền bị trả lại là tiền của chiến dịch quay về, không phải tiền ủng hộ mới.`
  }
  return ` Tổng đã thanh toán hiện là ${formatVnd(after.paid)} (trước khi ghi nhận: ${formatVnd(before.paid)}; có giao dịch khác vừa được ghi cùng lúc).`
}

export interface ReturnedTransfer {
  bank_transaction_id: string
  original_transaction_id: string
  reason: string
  evidence: string
  linked_at: string
  tx: { amount: number; booked_at: string; campaign_id: string }
  original: { amount: number; booked_at: string; is_refund: boolean | null } | null
}

type ReturnedTransferRow = Omit<ReturnedTransfer, "tx" | "original"> & {
  tx: { amount: unknown; booked_at: string; campaign_id: string }
  original: {
    amount: unknown
    booked_at: string
    disbursement: { is_refund: boolean } | { is_refund: boolean }[] | null
  } | null
}

/**
 * The latest returned transfers the caller may read, with their private
 * reason and evidence (finance/admin staff: all). linked_by is not granted
 * to clients and is not read.
 */
export async function listReturnedTransfers(
  db: Db,
  { limit = 30 }: { limit?: number } = {}
): Promise<ReturnedTransfer[]> {
  const { data, error } = await db
    .from("returned_transfers")
    .select(
      "bank_transaction_id, original_transaction_id, reason, evidence, linked_at, " +
        "tx:bank_transactions!bank_transaction_id!inner(amount, booked_at, campaign_id), " +
        "original:bank_transactions!original_transaction_id(amount, booked_at, disbursement:disbursements(is_refund))"
    )
    .order("linked_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as ReturnedTransferRow[]).map(({ tx, original, ...link }) => ({
    ...link,
    tx: { ...tx, amount: toAmount(tx.amount) },
    original: original
      ? {
          amount: toAmount(original.amount),
          booked_at: original.booked_at,
          is_refund: one(original.disbursement)?.is_refund ?? null,
        }
      : null,
  }))
}
