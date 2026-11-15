import { z } from "zod"

import type { CampaignType, Db } from "./campaigns"
import { formatDate, formatVnd } from "./format"
import { isUuid } from "./ids"

/**
 * Money transparency (docs/Give-Technical-Design.md sections 2.4 and 4.1
 * steps 10-12). The DDL lives in DOS-Me
 * `supabase/migrations/20261101110000_give_money_core_ledger.sql`.
 *
 * Public pages read only the views give.public_campaigns,
 * give.public_statement and give.public_disbursement_evidence, always with
 * explicit column lists. Those views never carry a bank account-holder name,
 * guest details, transfer descriptions or full account numbers, and hide
 * anonymous donors' names (DOS-Me
 * `20261102210000_give_public_evidence_and_donor_names.sql`, DOS/Give#58);
 * nothing here adds any of that back.
 */

// ---------------------------------------------------------------------------
// The four numbers (give.public_campaigns)
// ---------------------------------------------------------------------------

export interface MoneyTotals {
  campaign_id: string
  type: CampaignType
  asset: string
  goal_amount: number
  /** SUM(pledged); only meaningful for back campaigns. */
  pledged_amount: number
  /** Money that reached the receiving account: SUM(received) + SUM(unmatched_in) + SUM(other_in). */
  paid_amount: number
  /** Equal to paid_amount: the money is already the organizer's. Published, not enforced. */
  disbursable_amount: number
  /** Every outgoing transaction that is not a refund, explained or not, net of what a bank returned (DOS/Give#72). */
  disbursed_amount: number
  refunded_amount: number
  /** The part of disbursed_amount with no explanation yet. */
  unexplained_out_amount: number
  unexplained_out_count: number
  supporters_count: number
  /**
   * SUM(other_in): the part of paid_amount that finance staff explained as
   * not a donation (an organizer top-up, a bank fee refund or correction, interest; DOS/Give#49).
   */
  other_in_amount: number
  /**
   * Back campaigns: what the creator owes backers right now (refund_due
   * pledges' received minus refunded, plus overpayment of paid pledges), shown
   * until it is refunded (section 4.2 step 5).
   */
  refund_owed_amount: number
  /** Back campaigns: pledges that hold their slot (pledged, payment_due, partially_paid, paid). */
  backers_count: number
  /**
   * Back campaigns: when a moderator stopped the payment requests after
   * success, and the public note (DOS/Give#89); null otherwise.
   */
  payments_stopped_at: string | null
  payments_stopped_note: string | null
  /**
   * Money moved from the campaign's old account to its new one after an
   * account swap, as finance paired it (DOS/Give#84). Counted in neither
   * paid_amount nor disbursed_amount: both legs' ledger posts are reversed.
   */
  own_transfer_amount: number
}

const TOTALS_COLUMNS =
  "id, type, asset, goal_amount, pledged_amount, paid_amount, disbursable_amount, disbursed_amount, " +
  "refunded_amount, unexplained_out_amount, unexplained_out_count, supporters_count, other_in_amount, " +
  "refund_owed_amount, backers_count, payments_stopped_at, payments_stopped_note, own_transfer_amount"

type TotalsRow = Omit<MoneyTotals, "campaign_id"> & { id: string }

/** bigint sums may arrive as strings, depending on the PostgREST setup. */
function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function toTotals(row: TotalsRow): MoneyTotals {
  return {
    campaign_id: row.id,
    type: row.type,
    asset: row.asset,
    goal_amount: num(row.goal_amount),
    pledged_amount: num(row.pledged_amount),
    paid_amount: num(row.paid_amount),
    disbursable_amount: num(row.disbursable_amount),
    disbursed_amount: num(row.disbursed_amount),
    refunded_amount: num(row.refunded_amount),
    unexplained_out_amount: num(row.unexplained_out_amount),
    unexplained_out_count: num(row.unexplained_out_count),
    supporters_count: num(row.supporters_count),
    other_in_amount: num(row.other_in_amount),
    refund_owed_amount: num(row.refund_owed_amount),
    backers_count: num(row.backers_count),
    payments_stopped_at: row.payments_stopped_at ?? null,
    payments_stopped_note: row.payments_stopped_note ?? null,
    own_transfer_amount: num(row.own_transfer_amount),
  }
}

/** Totals of one public campaign, or null when the campaign is not public. */
export async function getMoneyTotals(db: Db, campaignId: string): Promise<MoneyTotals | null> {
  const { data, error } = await db.from("public_campaigns").select(TOTALS_COLUMNS).eq("id", campaignId).maybeSingle()
  if (error) throw error
  return data ? toTotals(data as unknown as TotalsRow) : null
}

/** The id filter travels in the URL, so ids are asked for this many at a time. */
const TOTALS_PER_REQUEST = 100

/** Totals of several public campaigns, by campaign id (for discovery cards). */
export async function listMoneyTotals(db: Db, campaignIds: readonly string[]): Promise<Map<string, MoneyTotals>> {
  const totals = new Map<string, MoneyTotals>()
  const chunks: string[][] = []
  for (let i = 0; i < campaignIds.length; i += TOTALS_PER_REQUEST)
    chunks.push(campaignIds.slice(i, i + TOTALS_PER_REQUEST))
  const reads = await Promise.all(
    chunks.map((chunk) => db.from("public_campaigns").select(TOTALS_COLUMNS).in("id", chunk))
  )
  for (const { data, error } of reads) {
    if (error) throw error
    for (const row of (data ?? []) as unknown as TotalsRow[]) totals.set(row.id, toTotals(row))
  }
  return totals
}

/**
 * The headline amount: what a give campaign has received, or what a back
 * campaign has been pledged (payment only follows success). Money explained
 * as not a donation (other_in) is in the account but does not count towards
 * the goal.
 */
export function raisedAmount(totals: MoneyTotals | null | undefined, type: CampaignType): number {
  if (!totals) return 0
  return type === "back" ? totals.pledged_amount : Math.max(0, totals.paid_amount - totals.other_in_amount)
}

/**
 * What is left of the money that came in: paid in minus spent minus
 * refunded, never negative (an organizer may top the account up).
 */
export function remainingAmount(totals: MoneyTotals): number {
  return Math.max(0, totals.paid_amount - totals.disbursed_amount - totals.refunded_amount)
}

/** Explained spending: disbursed minus the unexplained part, never negative. */
export function explainedOutAmount(totals: MoneyTotals): number {
  return Math.max(0, totals.disbursed_amount - totals.unexplained_out_amount)
}

// ---------------------------------------------------------------------------
// Public statement (give.public_statement)
// ---------------------------------------------------------------------------

export type Direction = "in" | "out"

export interface StatementRow {
  id: string
  direction: Direction
  asset: string
  amount: number
  booked_at: string
  booked_date_only: boolean
  after_close: boolean
  matched: boolean
  /** Only for an explained payment out that is not a refund. */
  counterparty_account_masked: string | null
  /** null for incoming rows. */
  explained: boolean | null
  purpose: string | null
  category: string | null
  recipient: string | null
  is_refund: boolean | null
  explained_at: string | null
  /** The donor's chosen display name: only for an incoming row matched to a non-anonymous contribution. */
  donor_name: string | null
  /** For a matched incoming row, whether the donor chose anonymity; null otherwise. */
  donor_anonymous: boolean | null
  /** For an incoming row explained as not a donation, its kind (INBOUND_EXPLANATION_KINDS); null otherwise. */
  in_explanation: string | null
  in_explained_at: string | null
  /**
   * Both legs of a transfer between the campaign's own accounts after a swap
   * (DOS/Give#84): the pair id, when finance marked it, and the public label
   * "Chuyển sang tài khoản mới"; null otherwise. A paired outgoing leg counts
   * as explained.
   */
  own_transfer_id: string | null
  own_transfer_at: string | null
  own_transfer_label: string | null
  /** On an incoming row a bank returned (DOS/Give#72): the outgoing row it returns; null otherwise. */
  return_of: string | null
  /** On an outgoing row a bank returned: the incoming row that brought the money back; null otherwise. */
  returned_by: string | null
  /** When Give recorded the return, on both rows; null otherwise. */
  returned_at: string | null
  /**
   * On BOTH rows of a returned pair: what the bank kept (original minus
   * returned; 0 when it returned everything); null on any other row
   * (DOS/Give#195). A pair carries it twice, so never sum it across rows:
   * read it from one row of the pair (returnedTransferText does).
   */
  return_bank_fee: number | null
}

// counterparty_name is left out on purpose: the bank's account-holder name is
// never public (the view returns NULL there since DOS/Give#58).
const STATEMENT_COLUMNS =
  "id, direction, asset, amount, booked_at, booked_date_only, after_close, matched, " +
  "counterparty_account_masked, explained, purpose, category, recipient, is_refund, explained_at, " +
  "donor_name, donor_anonymous, in_explanation, in_explained_at, own_transfer_id, own_transfer_at, own_transfer_label, " +
  "return_of, returned_by, returned_at, return_bank_fee"

/**
 * Kinds of incoming money that is not a donation, as finance staff explain
 * it (give.inbound_explanations.kind, DOS/Give#49). The reason and evidence
 * behind an explanation stay private; the public sees this label only.
 */
export const INBOUND_EXPLANATION_KINDS = {
  organizer_top_up: "Người tổ chức nạp thêm tiền",
  bank_adjustment: "Ngân hàng hoàn phí hoặc điều chỉnh",
  interest: "Lãi ngân hàng",
  other: "Khoản khác, không phải tiền ủng hộ",
} as const

export type InboundExplanationKind = keyof typeof INBOUND_EXPLANATION_KINDS

export function isInboundExplanationKind(value: unknown): value is InboundExplanationKind {
  return typeof value === "string" && Object.hasOwn(INBOUND_EXPLANATION_KINDS, value)
}

/**
 * An incoming row explained as not a donation. A corrected explanation
 * (DOS/Give#71) is superseded by its match: give.public_statement then
 * returns the row as matched with no in_explanation, and a matched row is
 * never shown as "not a donation", so the money reads once, as a donation.
 */
export function explainedNotDonation(row: Pick<StatementRow, "direction" | "matched" | "in_explanation">): boolean {
  return row.direction === "in" && !row.matched && !!row.in_explanation
}

/** Label of a stored kind; a kind this app does not know yet still reads as "not a donation". */
export function inboundExplanationLabel(kind: string): string {
  return isInboundExplanationKind(kind) ? INBOUND_EXPLANATION_KINDS[kind] : INBOUND_EXPLANATION_KINDS.other
}

export const STATEMENT_FILTERS = ["all", "in", "out", "unexplained"] as const
export type StatementFilter = (typeof STATEMENT_FILTERS)[number]

export const STATEMENT_FILTER_LABELS: Record<StatementFilter, string> = {
  all: "Tất cả",
  in: "Tiền vào",
  out: "Tiền ra",
  unexplained: "Chưa giải trình",
}

export const STATEMENT_PAGE_SIZE = 50

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v))
/** Keeps ?page= bounded. */
const MAX_PAGE = 1000

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

export function parseStatementParams(params: Record<string, string | string[] | undefined>): {
  filter: StatementFilter
  page: number
} {
  const filter = firstParam(params.filter)
  const page = Number(firstParam(params.page))
  return {
    filter: (STATEMENT_FILTERS as readonly string[]).includes(filter) ? (filter as StatementFilter) : "all",
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  }
}

export function statementHref(slug: string, filter: StatementFilter, page = 1): string {
  const params = new URLSearchParams()
  if (filter !== "all") params.set("filter", filter)
  if (page > 1) params.set("page", String(page))
  const query = params.toString()
  return `/campaigns/${slug}/statement${query ? `?${query}` : ""}`
}

function statementQuery(db: Db, campaignId: string, filter: StatementFilter, columns: string, head = false) {
  let query = db.from("public_statement").select(columns, { count: "exact", head }).eq("campaign_id", campaignId)
  if (filter === "in" || filter === "out") query = query.eq("direction", filter)
  if (filter === "unexplained") query = query.eq("direction", "out").eq("explained", false)
  return query
}

/**
 * One page of a public campaign's statement, newest first, with the total
 * row count. A page past the end (a stale link after rows were explained)
 * returns no rows and the real total, so the page can send the visitor to
 * the last page instead of failing.
 */
export async function listStatement(
  db: Db,
  campaignId: string,
  filter: StatementFilter = "all",
  page = 1
): Promise<{ rows: StatementRow[]; total: number }> {
  const from = (page - 1) * STATEMENT_PAGE_SIZE
  const { data, error, count } = await statementQuery(db, campaignId, filter, STATEMENT_COLUMNS)
    .order("booked_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + STATEMENT_PAGE_SIZE - 1)
  if (error?.code === "PGRST103") {
    const counted = await statementQuery(db, campaignId, filter, "id", true)
    if (counted.error) throw counted.error
    return { rows: [], total: counted.count ?? 0 }
  }
  if (error) throw error
  const rows = ((data ?? []) as unknown as StatementRow[]).map((row) => ({
    ...row,
    amount: num(row.amount),
    return_bank_fee: row.return_bank_fee == null ? null : num(row.return_bank_fee),
  }))
  return { rows, total: count ?? rows.length }
}

export const ANONYMOUS_LABEL = "Ẩn danh"

// ---------------------------------------------------------------------------
// Returned transfers (DOS/Give#72)
// ---------------------------------------------------------------------------

/**
 * The incoming row of a returned transfer: money a bank sent back from a
 * transfer out of the campaign (a payment or a refund that did not go
 * through). Who sent it is not public, as for any row that is not a matched
 * donation; the reason and evidence stay private.
 */
export const RETURNED_IN_LABEL = "Ngân hàng trả lại tiền chuyển đi"

/** The other row of a returned transfer, as the public statement shows it. */
export interface StatementPair {
  id: string
  direction: Direction
  /** On the outgoing row: whether it was a refund to a backer. */
  is_refund: boolean | null
  amount: number
  booked_at: string
}

/**
 * The other row of each returned transfer on this page (return_of or
 * returned_by), read from give.public_statement, so a pair split across pages
 * still names its amount and day. By the id of the row on the page.
 */
export async function listStatementPairs(
  db: Db,
  campaignId: string,
  rows: readonly Pick<StatementRow, "id" | "return_of" | "returned_by">[]
): Promise<Map<string, StatementPair>> {
  const other = new Map<string, string>()
  for (const row of rows) {
    const id = row.return_of ?? row.returned_by
    if (id) other.set(row.id, id)
  }
  if (other.size === 0) return new Map()
  const { data, error } = await db
    .from("public_statement")
    .select("id, direction, is_refund, amount, booked_at")
    .eq("campaign_id", campaignId)
    .in("id", [...new Set(other.values())])
  if (error) throw error
  const byId = new Map(
    ((data ?? []) as unknown as StatementPair[]).map((pair) => [pair.id, { ...pair, amount: num(pair.amount) }])
  )
  const pairs = new Map<string, StatementPair>()
  for (const [rowId, otherId] of other) {
    const pair = byId.get(otherId)
    if (pair) pairs.set(rowId, pair)
  }
  return pairs
}

/**
 * What the bank kept on a returned transfer, from the row's return_bank_fee,
 * or from the pair's amounts when the column is missing; 0 when nothing was
 * kept or the row is not part of a returned pair.
 */
export function returnBankFee(
  row: Pick<StatementRow, "direction" | "amount" | "return_of" | "returned_by"> &
    Partial<Pick<StatementRow, "return_bank_fee">>,
  pair: Pick<StatementPair, "amount"> | null
): number {
  if (!row.return_of && !row.returned_by) return 0
  if (row.return_bank_fee != null) return Math.max(0, row.return_bank_fee)
  if (!pair) return 0
  return Math.max(0, row.direction === "in" ? pair.amount - row.amount : row.amount - pair.amount)
}

/**
 * The public note on either row of a returned transfer (DOS/Give#72): the
 * transfer out and the money the bank sent back each name the other's amount
 * and local day when it could be read; the reason and evidence are never
 * public. A fee the bank kept is spent money of the campaign (a bank fee in
 * "đã chi"), never money that reached a backer: on a returned refund the
 * whole refund counts zero, fee included, and the organizer still owes the
 * backer the full amount (DOS/Give#195). The fee is the same on both rows of
 * the pair; each note names it once.
 */
export function returnedTransferText(
  row: Pick<StatementRow, "direction" | "amount" | "is_refund" | "return_of" | "returned_by"> &
    Partial<Pick<StatementRow, "return_bank_fee">>,
  pair: StatementPair | null
): string {
  const fee = returnBankFee(row, pair)
  if (row.direction === "in") {
    // The return nets the original's bucket, so it is not money received.
    const kind = pair?.is_refund ? "hoàn tiền" : "chi"
    let text = pair
      ? `Tiền của khoản ${kind} −${formatVnd(pair.amount)} ngày ${formatDate(pair.booked_at)} quay về, nên không tính vào tổng đã nhận.`
      : "Tiền chiến dịch đã chuyển đi quay về, nên không tính vào tổng đã nhận."
    if (fee > 0) {
      text += ` Ngân hàng giữ lại ${formatVnd(fee)} phí: phần này là phí ngân hàng, tính vào tổng đã chi`
      text += pair?.is_refund
        ? ", không phải tiền người ủng hộ đã nhận. Người ủng hộ được hoàn đủ bằng một khoản chuyển mới; người tổ chức chịu phí."
        : "."
    }
    return text
  }
  const back = pair ? ` +${formatVnd(pair.amount)} ngày ${formatDate(pair.booked_at)}` : ""
  if (row.is_refund) {
    let text = `Khoản hoàn tiền này không đến được người ủng hộ: ngân hàng đã trả lại${back}. Cả khoản −${formatVnd(row.amount)} không còn tính vào tổng đã hoàn lại`
    text +=
      fee > 0
        ? `; ngân hàng giữ ${formatVnd(fee)} phí, tính là phí ngân hàng trong tổng đã chi. Người ủng hộ được hoàn đủ bằng một khoản chuyển mới; người tổ chức chịu phí.`
        : ". Người ủng hộ được hoàn lại bằng một khoản chuyển mới."
    return text
  }
  let text = pair
    ? `Khoản này không chuyển được: ngân hàng trả lại${back}, số tiền về đó không còn tính vào tổng đã chi.`
    : "Khoản này không chuyển được: ngân hàng đã trả tiền lại, số tiền về đó không còn tính vào tổng đã chi."
  if (fee > 0) text += ` Ngân hàng giữ ${formatVnd(fee)} phí, phần này vẫn tính là đã chi.`
  return text
}

/**
 * Who is on the other side of a statement row, as far as the public may
 * know (owner decision on DOS/Give#58): for money in, the donor's chosen
 * display name or "Ẩn danh", never the bank account-holder name; an
 * unmatched transfer has no name, and one explained as not a donation shows
 * its kind only. Both legs of a transfer between the campaign's own accounts
 * show the public label only ("Chuyển sang tài khoản mới", DOS/Give#84).
 */
export function counterpartyLabel(
  row: Pick<StatementRow, "direction" | "matched" | "donor_name" | "donor_anonymous" | "recipient" | "explained"> &
    Partial<Pick<StatementRow, "in_explanation" | "own_transfer_label" | "return_of">>
): string {
  if (row.own_transfer_label) return row.own_transfer_label
  if (row.direction === "in" && row.return_of) return RETURNED_IN_LABEL
  if (row.direction === "out") {
    if (!row.explained) return "Chưa rõ người nhận"
    return row.recipient ?? "Không công khai"
  }
  if (!row.matched && row.in_explanation) return inboundExplanationLabel(row.in_explanation)
  if (!row.matched) return "Chưa khớp với lượt ủng hộ nào"
  if (row.donor_anonymous) return ANONYMOUS_LABEL
  return row.donor_name ?? "Người ủng hộ"
}

// ---------------------------------------------------------------------------
// Public disbursement evidence (give.public_disbursement_evidence)
// ---------------------------------------------------------------------------

/** An evidence image anyone may see: of a public campaign and not hidden by staff. */
export interface PublicEvidence {
  id: string
  bank_transaction_id: string
  storage_path: string
  kind: EvidenceKind
  created_at: string
}

/** Evidence of the given outgoing transactions of a public campaign, oldest first, by transaction. */
export async function listPublicEvidence(
  db: Db,
  campaignId: string,
  transactionIds: readonly string[]
): Promise<Map<string, PublicEvidence[]>> {
  const ids = [...new Set(transactionIds)]
  if (ids.length === 0) return new Map()
  const { data, error } = await db
    .from("public_disbursement_evidence")
    .select("id, bank_transaction_id, storage_path, kind, created_at")
    .eq("campaign_id", campaignId)
    .in("bank_transaction_id", ids)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
  if (error) throw error
  const byTx = new Map<string, PublicEvidence[]>()
  for (const row of (data ?? []) as PublicEvidence[]) {
    byTx.set(row.bank_transaction_id, [...(byTx.get(row.bank_transaction_id) ?? []), row])
  }
  return byTx
}

/** A visitor's report that an evidence image exposes someone's personal data. */
export const reportSchema = z.object({
  reason: optionalText(500, "Lý do tối đa 500 ký tự"),
})

// ---------------------------------------------------------------------------
// Disbursement explanations (organizer side)
// ---------------------------------------------------------------------------

/** Days the organizer has to explain an outgoing transaction (section 4.1 step 10). */
export const EXPLAIN_WITHIN_DAYS = 7

/** True once an unexplained outgoing transaction is past the explanation window. */
export function explanationOverdue(bookedAt: string, now = new Date()): boolean {
  const booked = new Date(bookedAt).getTime()
  if (Number.isNaN(booked)) return false
  return now.getTime() - booked > EXPLAIN_WITHIN_DAYS * 86_400_000
}

/** Stored as the slug; give.disbursements.category allows up to 60 characters. */
export const DISBURSEMENT_CATEGORIES = {
  beneficiary: "Chuyển cho người thụ hưởng",
  goods: "Mua hàng, vật phẩm",
  services: "Dịch vụ, nhân công",
  logistics: "Vận chuyển, đi lại",
  bank_fee: "Phí ngân hàng",
  refund: "Hoàn tiền cho người ủng hộ",
  other: "Khác",
} as const

export type DisbursementCategory = keyof typeof DISBURSEMENT_CATEGORIES

export function isDisbursementCategory(value: unknown): value is DisbursementCategory {
  return typeof value === "string" && Object.hasOwn(DISBURSEMENT_CATEGORIES, value)
}

/** Label for a stored category; categories written by other clients show as they are. */
export function categoryLabel(category: string | null): string | null {
  if (!category) return null
  return isDisbursementCategory(category) ? DISBURSEMENT_CATEGORIES[category] : category
}

export const EVIDENCE_KINDS = {
  invoice: "Hóa đơn",
  receipt: "Biên nhận",
  photo: "Ảnh",
} as const

export type EvidenceKind = keyof typeof EVIDENCE_KINDS

export function isEvidenceKind(value: unknown): value is EvidenceKind {
  return typeof value === "string" && Object.hasOwn(EVIDENCE_KINDS, value)
}

/** Files per submission, and their combined size (Vercel caps request bodies at 4.5 MB). */
export const MAX_EVIDENCE_FILES = 5
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const EVIDENCE_PATH = new RegExp(`^disbursements/${UUID}/${UUID}/${UUID}\\.webp$`)

/** Storage key of an evidence image: disbursements/<campaign>/<transaction>/<object>.webp. */
export function evidencePath(campaignId: string, transactionId: string, objectId: string): string {
  return `disbursements/${campaignId}/${transactionId}/${objectId}.webp`
}

/**
 * The storage key that the segments after /media/evidence/ name, or null
 * unless it has exactly evidencePath()'s shape (no traversal, no other keys).
 */
export function parseEvidencePath(segments: readonly string[]): string | null {
  const path = ["disbursements", ...segments].join("/")
  return EVIDENCE_PATH.test(path) ? path : null
}

/**
 * Where the organizer's and staff pages load an evidence image
 * (app/media/evidence: under RLS, so also a hidden one).
 */
export function evidenceUrl(storagePath: string): string {
  return `/media/evidence/${storagePath.replace(/^disbursements\//, "")}`
}

/**
 * Where public pages load an evidence image (app/media/public/evidence: no
 * session, only images in give.public_disbursement_evidence).
 */
export function publicEvidenceUrl(storagePath: string): string {
  return `/media/public/evidence/${storagePath.replace(/^disbursements\//, "")}`
}

/** The campaign id inside an evidence storage key, or null when the key has another shape. */
export function evidenceCampaignId(storagePath: string): string | null {
  return EVIDENCE_PATH.test(storagePath) ? storagePath.split("/")[1] : null
}

/** An outgoing transaction of the organizer's campaign, read under RLS. */
export interface OutgoingTransaction {
  id: string
  campaign_id: string
  amount: number
  asset: string
  booked_at: string
  booked_date_only: boolean
  description: string | null
  counterparty_name: string | null
  counterparty_account_masked: string | null
}

export interface Evidence {
  id: string
  storage_path: string
  kind: EvidenceKind
  created_at: string
}

export interface Disbursement {
  purpose: string
  category: string | null
  recipient: string | null
  is_refund: boolean
  refund_contribution_id: string | null
  explained_at: string
  evidence: Evidence[]
}

/** The money a bank sent back from an explained transfer out (DOS/Give#72), as its organizer reads it. */
export interface ReturnedBack {
  /** The incoming amount: the original minus any fee the bank kept. */
  amount: number
  booked_at: string
  linked_at: string
}

/**
 * A transfer out that finance linked as returned by the bank but that has no
 * explanation (DOS/Give#194). give.link_returned_transfer refuses an
 * unexplained original today (GIVE_ORIGINAL_NOT_EXPLAINED), so this is a
 * guard: such a transfer is not money spent and is never offered to explain.
 */
export interface ReturnedUnexplained extends OutgoingTransaction {
  /** Null when the link is there but the money that came back could not be read. */
  returned: ReturnedBack | null
  /** When finance linked the return. */
  linked_at: string
}

/** The organizer's outgoing transactions that have no explanation. */
export interface UnexplainedOutgoing {
  /** Still to explain: they count as unexplained. */
  pending: OutgoingTransaction[]
  /** Returned by the bank: shown with the marker, never offered to explain. */
  returned: ReturnedUnexplained[]
}

export interface ExplainedTransaction extends OutgoingTransaction {
  disbursement: Disbursement
  /** Set when finance linked money a bank returned to this transfer. */
  returned: ReturnedBack | null
}

/** A contribution the organizer may still refund: it paid in more than was refunded. */
export interface RefundableContribution {
  id: string
  kind: "donation" | "pledge"
  reference_code: string
  public_name: string | null
  is_anonymous: boolean
  received_amount: number
  /** received_amount minus earlier refunds to it. */
  refundable_amount: number
}

const OUTGOING_COLUMNS =
  "id, campaign_id, amount, asset, booked_at, booked_date_only, description, counterparty_name, counterparty_account_masked"

const DISBURSEMENT_COLUMNS =
  "purpose, category, recipient, is_refund, refund_contribution_id, explained_at, " +
  "evidence:disbursement_evidence(id, storage_path, kind, created_at)"

/** At most this many evidence images per transaction, across submissions. */
export const MAX_EVIDENCE_PER_TRANSACTION = 20
/** Explained transactions shown on the organizer page; pending ones are all shown. */
export const EXPLAINED_PAGE_LIMIT = 100

function toOutgoing<T extends OutgoingTransaction>(tx: T): T {
  return { ...tx, amount: num(tx.amount) }
}

type ReturnedBackRow = { linked_at: string; back: { amount: unknown; booked_at: string } | null }
type ReturnedEmbed = ReturnedBackRow | ReturnedBackRow[] | null | undefined

/**
 * The link a bank return left on a transfer out (give.returned_transfers,
 * DOS/Give#72), read under RLS as the organizer reads their campaign's
 * transactions. Only the amount and day of the money that came back are read,
 * never the link's private reason or evidence.
 */
const RETURNED_EMBED =
  "returned:returned_transfers!original_transaction_id(linked_at, back:bank_transactions!bank_transaction_id(amount, booked_at))"

/** Whether a return is linked, and the money that came back when it could be read. */
function readReturned(
  embed: ReturnedEmbed
): { linked: false; back: null } | { linked: true; linked_at: string; back: ReturnedBack | null } {
  const link = Array.isArray(embed) ? embed[0] : embed
  if (!link) return { linked: false, back: null }
  return {
    linked: true,
    linked_at: link.linked_at,
    back: link.back
      ? { amount: num(link.back.amount), booked_at: link.back.booked_at, linked_at: link.linked_at }
      : null,
  }
}

/**
 * Every unexplained outgoing transaction of a campaign, oldest first, so none
 * can hide behind a page limit while it counts publicly as unexplained. A
 * transfer finance paired as moving the money to the campaign's new account
 * (DOS/Give#84) is settled and cannot be explained, so it is left out. A
 * transfer the bank returned (DOS/Give#194) is split off: it is not spending
 * to explain.
 */
export async function listUnexplainedOutgoing(db: Db, campaignId: string): Promise<UnexplainedOutgoing> {
  const { data, error } = await db
    .from("bank_transactions")
    .select(
      `${OUTGOING_COLUMNS}, disbursements(bank_transaction_id), own_out:own_account_transfers!out_transaction_id(id), ${RETURNED_EMBED}`
    )
    .eq("campaign_id", campaignId)
    .eq("direction", "out")
    .is("disbursements", null)
    .is("own_out", null)
    .order("booked_at", { ascending: true })
  if (error) throw error
  type Row = OutgoingTransaction & { disbursements?: unknown; own_out?: unknown; returned?: ReturnedEmbed }
  const result: UnexplainedOutgoing = { pending: [], returned: [] }
  for (const { disbursements: _embed, own_out: _pair, returned, ...row } of (data ?? []) as unknown as Row[]) {
    const tx = toOutgoing(row)
    const link = readReturned(returned)
    if (link.linked) result.returned.push({ ...tx, returned: link.back, linked_at: link.linked_at })
    else result.pending.push(tx)
  }
  return result
}

/**
 * Explained outgoing transactions with their explanation and evidence, newest
 * first, and the money a bank returned from each, if any (under RLS, as the
 * organizer reads give.returned_transfers of their campaign).
 */
export async function listExplainedOutgoing(
  db: Db,
  campaignId: string,
  limit = EXPLAINED_PAGE_LIMIT
): Promise<ExplainedTransaction[]> {
  const { data, error } = await db
    .from("bank_transactions")
    .select(`${OUTGOING_COLUMNS}, disbursement:disbursements!inner(${DISBURSEMENT_COLUMNS}), ${RETURNED_EMBED}`)
    .eq("campaign_id", campaignId)
    .eq("direction", "out")
    .order("booked_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  type Row = Omit<ExplainedTransaction, "returned"> & { returned?: ReturnedEmbed }
  return ((data ?? []) as unknown as Row[]).map(({ returned, ...tx }) => ({
    ...toOutgoing(tx),
    returned: readReturned(returned).back,
  }))
}

/**
 * What the organizer reads on an explained transfer out that a bank returned
 * (DOS/Give#72). A returned refund counts zero, fee included, so the backer
 * is owed the full refund again and the fee the bank kept is the organizer's
 * cost, a bank fee in "đã chi" (owner decision on DOS/Give#195). A returned
 * payment no longer counts as spent, except the fee.
 */
export function returnedOutgoingText(
  tx: Pick<OutgoingTransaction, "amount">,
  disbursement: Pick<Disbursement, "is_refund">,
  returned: ReturnedBack
): string {
  const fee = Math.max(0, tx.amount - returned.amount)
  const back = `Ngân hàng đã trả lại +${formatVnd(returned.amount)} ngày ${formatDate(returned.booked_at)}`
  if (disbursement.is_refund) {
    if (fee === 0) {
      return `${back}: khoản hoàn tiền này chưa đến được người ủng hộ, nên không còn tính là đã hoàn. Nếu bạn chưa chuyển lại, hãy kiểm tra số tài khoản với người ủng hộ, chuyển lại ${formatVnd(tx.amount)} rồi giải trình khoản chuyển mới là hoàn tiền. Nếu đã chuyển lại rồi, đừng chuyển thêm: số còn phải hoàn (nếu có) hiện trong danh sách chọn lượt ủng hộ khi giải trình hoàn tiền.`
    }
    return (
      `${back} và giữ ${formatVnd(fee)} phí: khoản hoàn tiền này chưa đến được người ủng hộ. Cả khoản −${formatVnd(tx.amount)} không còn tính là đã hoàn, kể cả phần phí. ` +
      `Phí ${formatVnd(fee)} do bạn chịu (tính là phí ngân hàng trong tổng đã chi), không trừ vào tiền hoàn. Nếu bạn chưa chuyển lại, hãy kiểm tra số tài khoản với người ủng hộ, chuyển lại đủ ${formatVnd(tx.amount)} rồi giải trình khoản chuyển mới là hoàn tiền. Nếu đã chuyển lại rồi, đừng chuyển thêm: số còn phải hoàn (nếu có) hiện trong danh sách chọn lượt ủng hộ khi giải trình hoàn tiền.`
    )
  }
  return fee === 0
    ? `${back}: khoản chi này không chuyển được, nên không còn tính vào tổng đã chi.`
    : `${back} và giữ ${formatVnd(fee)} phí: khoản chi này không chuyển được. Số tiền về không còn tính vào tổng đã chi; phí ${formatVnd(fee)} vẫn tính là đã chi.`
}

/**
 * What the organizer reads on a transfer out that a bank returned before it
 * was explained (DOS/Give#194): it never left the campaign, so it is not
 * spending to explain. Unreachable while give.link_returned_transfer refuses
 * an unexplained original; kept so the page never offers it to explain.
 */
export function returnedUnexplainedText(
  tx: Pick<OutgoingTransaction, "amount">,
  returned: ReturnedBack | null,
  linkedAt: string
): string {
  // The public totals still count such a transfer as unexplained until
  // finance settles it, so no total is promised here (only finance can fix it).
  const tail =
    "và sẽ xử lý khoản này trên sao kê công khai, nên bạn không giải trình nó như một khoản chi. Nếu sao kê vẫn tính khoản này là chưa giải trình, hãy liên hệ Give."
  if (!returned) {
    return `Ngày ${formatDate(linkedAt)}, bộ phận tài chính của Give đã ghi nhận khoản chuyển này bị ngân hàng trả lại ${tail}`
  }
  const fee = Math.max(0, tx.amount - returned.amount)
  const kept = fee > 0 ? ` và giữ ${formatVnd(fee)} phí ngân hàng` : ""
  return `Ngân hàng đã trả lại +${formatVnd(returned.amount)} ngày ${formatDate(returned.booked_at)}${kept}. Bộ phận tài chính của Give đã ghi nhận ${tail}`
}

/** An outgoing transaction with its explanation (null until explained) and whether a bank return is linked. */
export type OutgoingWithState = OutgoingTransaction & { disbursement: Disbursement | null; returned: boolean }

/** One outgoing transaction of the campaign with its explanation and return state, or null. */
export async function getOutgoing(
  db: Db,
  campaignId: string,
  transactionId: string
): Promise<OutgoingWithState | null> {
  const { data, error } = await db
    .from("bank_transactions")
    .select(`${OUTGOING_COLUMNS}, disbursement:disbursements(${DISBURSEMENT_COLUMNS}), ${RETURNED_EMBED}`)
    .eq("id", transactionId)
    .eq("campaign_id", campaignId)
    .eq("direction", "out")
    .maybeSingle()
  if (error) throw error
  const row = data as unknown as
    (OutgoingTransaction & { disbursement: Disbursement | null; returned?: ReturnedEmbed }) | null
  if (!row) return null
  const { returned, ...tx } = row
  return { ...toOutgoing(tx), returned: readReturned(returned).linked }
}

const REFUNDABLE_COLUMNS = "id, kind, reference_code, public_name, is_anonymous, received_amount"

type ContributionRow = Omit<RefundableContribution, "refundable_amount">

/** Earlier refunds per contribution of the campaign (ledger 'refunded' posts and reversals). */
async function refundedByContribution(db: Db, campaignId: string, ids?: string[]): Promise<Map<string, number>> {
  let query = db
    .from("ledger_entries")
    .select("contribution_id, amount")
    .eq("campaign_id", campaignId)
    .eq("bucket", "refunded")
  if (ids) query = query.in("contribution_id", ids)
  const { data, error } = await query
  if (error) throw error
  const sums = new Map<string, number>()
  for (const row of (data ?? []) as { contribution_id: string | null; amount: unknown }[]) {
    if (row.contribution_id) sums.set(row.contribution_id, (sums.get(row.contribution_id) ?? 0) + num(row.amount))
  }
  return sums
}

function withRefundable(rows: ContributionRow[], refunded: Map<string, number>): RefundableContribution[] {
  return rows
    .map((x) => {
      const received = num(x.received_amount)
      return { ...x, received_amount: received, refundable_amount: received - (refunded.get(x.id) ?? 0) }
    })
    .filter((x) => x.refundable_amount > 0)
}

/** Contributions of the campaign that can still be refunded, newest first (no guest name or email). */
export async function listRefundable(db: Db, campaignId: string, limit = 1000): Promise<RefundableContribution[]> {
  const [{ data, error }, refunded] = await Promise.all([
    db
      .from("contributions")
      .select(REFUNDABLE_COLUMNS)
      .eq("campaign_id", campaignId)
      .gt("received_amount", 0)
      .order("created_at", { ascending: false })
      .limit(limit),
    refundedByContribution(db, campaignId),
  ])
  if (error) throw error
  return withRefundable((data ?? []) as unknown as ContributionRow[], refunded)
}

/** One contribution of the campaign that can still be refunded, or null. */
export async function getRefundable(
  db: Db,
  campaignId: string,
  contributionId: string
): Promise<RefundableContribution | null> {
  const [{ data, error }, refunded] = await Promise.all([
    db
      .from("contributions")
      .select(REFUNDABLE_COLUMNS)
      .eq("id", contributionId)
      .eq("campaign_id", campaignId)
      .gt("received_amount", 0)
      .maybeSingle(),
    refundedByContribution(db, campaignId, [contributionId]),
  ])
  if (error) throw error
  return data ? (withRefundable([data as unknown as ContributionRow], refunded)[0] ?? null) : null
}

/** Reference codes of the campaign's contributions, by id (to label explained refunds). */
export async function listReferenceCodes(
  db: Db,
  campaignId: string,
  contributionIds: readonly string[]
): Promise<Map<string, string>> {
  if (contributionIds.length === 0) return new Map()
  const { data, error } = await db
    .from("contributions")
    .select("id, reference_code")
    .eq("campaign_id", campaignId)
    .in("id", [...new Set(contributionIds)])
  if (error) throw error
  return new Map(((data ?? []) as { id: string; reference_code: string }[]).map((x) => [x.id, x.reference_code]))
}

/** How a contribution appears in the organizer's refund picker. */
export function refundOptionLabel(x: RefundableContribution, format: (amount: number) => string): string {
  const who = x.is_anonymous ? "ẩn danh" : (x.public_name ?? "không tên")
  const left = x.refundable_amount < x.received_amount ? `, còn hoàn được ${format(x.refundable_amount)}` : ""
  return `${x.reference_code} · ${who} · đã nhận ${format(x.received_amount)}${left}`
}

/**
 * The organizer's explanation of one outgoing transaction
 * (give.record_disbursement). A refund is the "refund" category together
 * with the contribution it refunds; one without the other is refused here
 * and by the database (disbursements_refund_category, DOS/Give#56), so
 * the public label and the bucket the money counts in never disagree.
 */
export const explainSchema = z
  .object({
    purpose: z.string().trim().min(1, "Ghi mục đích của khoản chi").max(1000, "Mục đích tối đa 1000 ký tự"),
    category: z.string().refine(isDisbursementCategory, "Chọn loại khoản chi"),
    recipient: optionalText(200, "Người nhận tối đa 200 ký tự"),
    refund_contribution_id: z
      .string()
      .trim()
      .refine((v) => v === "" || isUuid(v), "Lượt ủng hộ được hoàn không hợp lệ")
      .transform((v) => (v === "" ? null : v)),
    evidence_kind: z.string().refine(isEvidenceKind, "Chọn loại chứng từ"),
  })
  .refine((v) => v.category !== "refund" || v.refund_contribution_id !== null, {
    message: "Khoản hoàn tiền cần chọn lượt ủng hộ được hoàn",
    path: ["refund_contribution_id"],
  })
  .refine((v) => v.category === "refund" || v.refund_contribution_id === null, {
    message: "Đã chọn lượt ủng hộ được hoàn, hãy chọn loại “Hoàn tiền cho người ủng hộ”",
    path: ["category"],
  })
  .transform((v) => ({
    ...v,
    category: v.category as DisbursementCategory,
    evidence_kind: v.evidence_kind as EvidenceKind,
    is_refund: v.refund_contribution_id !== null,
  }))

export type ExplainInput = z.infer<typeof explainSchema>
