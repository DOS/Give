import { z } from "zod"

import type { CampaignType, Db } from "./campaigns"
import { isUuid } from "./ids"

/**
 * Money transparency (docs/Give-Technical-Design.md sections 2.4 and 4.1
 * steps 10-12). The DDL lives in DOS-Me
 * `supabase/migrations/20261101110000_give_money_core_ledger.sql`.
 *
 * Public pages read only the views give.public_campaigns and
 * give.public_statement, always with explicit column lists. Those views
 * already hide anonymous donors' names, guest details, transfer descriptions
 * and full account numbers; nothing here adds any of that back.
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
  /** Money that reached the receiving account: SUM(received) + SUM(unmatched_in). */
  paid_amount: number
  /** Equal to paid_amount: the money is already the organizer's. Published, not enforced. */
  disbursable_amount: number
  /** Every outgoing transaction that is not a refund, explained or not. */
  disbursed_amount: number
  refunded_amount: number
  /** The part of disbursed_amount with no explanation yet. */
  unexplained_out_amount: number
  unexplained_out_count: number
  supporters_count: number
}

const TOTALS_COLUMNS =
  "id, type, asset, goal_amount, pledged_amount, paid_amount, disbursable_amount, disbursed_amount, " +
  "refunded_amount, unexplained_out_amount, unexplained_out_count, supporters_count"

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
  }
}

/** Totals of one public campaign, or null when the campaign is not public. */
export async function getMoneyTotals(db: Db, campaignId: string): Promise<MoneyTotals | null> {
  const { data, error } = await db.from("public_campaigns").select(TOTALS_COLUMNS).eq("id", campaignId).maybeSingle()
  if (error) throw error
  return data ? toTotals(data as unknown as TotalsRow) : null
}

/** Totals of several public campaigns, by campaign id (for discovery cards). */
export async function listMoneyTotals(db: Db, campaignIds: readonly string[]): Promise<Map<string, MoneyTotals>> {
  if (campaignIds.length === 0) return new Map()
  const { data, error } = await db
    .from("public_campaigns")
    .select(TOTALS_COLUMNS)
    .in("id", [...campaignIds])
  if (error) throw error
  return new Map(((data ?? []) as unknown as TotalsRow[]).map((row) => [row.id, toTotals(row)]))
}

/**
 * The headline amount: what a give campaign has received, or what a back
 * campaign has been pledged (payment only follows success).
 */
export function raisedAmount(totals: MoneyTotals | null | undefined, type: CampaignType): number {
  if (!totals) return 0
  return type === "back" ? totals.pledged_amount : totals.paid_amount
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
  /** Only for a row matched to (or refunding) a non-anonymous contribution. */
  counterparty_name: string | null
  counterparty_account_masked: string | null
  /** null for incoming rows. */
  explained: boolean | null
  purpose: string | null
  category: string | null
  recipient: string | null
  is_refund: boolean | null
  explained_at: string | null
}

const STATEMENT_COLUMNS =
  "id, direction, asset, amount, booked_at, booked_date_only, after_close, matched, counterparty_name, " +
  "counterparty_account_masked, explained, purpose, category, recipient, is_refund, explained_at"

export const STATEMENT_FILTERS = ["all", "in", "out", "unexplained"] as const
export type StatementFilter = (typeof STATEMENT_FILTERS)[number]

export const STATEMENT_FILTER_LABELS: Record<StatementFilter, string> = {
  all: "Tất cả",
  in: "Tiền vào",
  out: "Tiền ra",
  unexplained: "Chưa giải trình",
}

export const STATEMENT_PAGE_SIZE = 50
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
  const rows = ((data ?? []) as unknown as StatementRow[]).map((row) => ({ ...row, amount: num(row.amount) }))
  return { rows, total: count ?? rows.length }
}

/**
 * Who is on the other side of a statement row, as far as the public may
 * know. The view returns a name only when it may be shown, so a missing name
 * never reveals why it is missing.
 */
export function counterpartyLabel(
  row: Pick<StatementRow, "direction" | "matched" | "counterparty_name" | "recipient" | "explained">
): string {
  if (row.direction === "out") {
    if (!row.explained) return "Chưa rõ người nhận"
    return row.recipient ?? row.counterparty_name ?? "Không công khai"
  }
  if (row.counterparty_name) return row.counterparty_name
  return row.matched ? "Người ủng hộ (không hiện tên)" : "Chưa khớp với lượt ủng hộ nào"
}

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

/** Where the organizer's pages load an evidence image (app/media/evidence). */
export function evidenceUrl(storagePath: string): string {
  return `/media/evidence/${storagePath.replace(/^disbursements\//, "")}`
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

export interface ExplainedTransaction extends OutgoingTransaction {
  disbursement: Disbursement
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

/**
 * Every unexplained outgoing transaction of a campaign, oldest first, so none
 * can hide behind a page limit while it counts publicly as unexplained.
 */
export async function listPendingOutgoing(db: Db, campaignId: string): Promise<OutgoingTransaction[]> {
  const { data, error } = await db
    .from("bank_transactions")
    .select(`${OUTGOING_COLUMNS}, disbursements(bank_transaction_id)`)
    .eq("campaign_id", campaignId)
    .eq("direction", "out")
    .is("disbursements", null)
    .order("booked_at", { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as (OutgoingTransaction & { disbursements?: unknown })[]).map((row) => {
    const { disbursements: _embed, ...tx } = row
    return toOutgoing(tx)
  })
}

/** Explained outgoing transactions with their explanation and evidence, newest first. */
export async function listExplainedOutgoing(
  db: Db,
  campaignId: string,
  limit = EXPLAINED_PAGE_LIMIT
): Promise<ExplainedTransaction[]> {
  const { data, error } = await db
    .from("bank_transactions")
    .select(`${OUTGOING_COLUMNS}, disbursement:disbursements!inner(${DISBURSEMENT_COLUMNS})`)
    .eq("campaign_id", campaignId)
    .eq("direction", "out")
    .order("booked_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as ExplainedTransaction[]).map(toOutgoing)
}

/** One outgoing transaction of the campaign with its explanation (null until explained), or null. */
export async function getOutgoing(
  db: Db,
  campaignId: string,
  transactionId: string
): Promise<(OutgoingTransaction & { disbursement: Disbursement | null }) | null> {
  const { data, error } = await db
    .from("bank_transactions")
    .select(`${OUTGOING_COLUMNS}, disbursement:disbursements(${DISBURSEMENT_COLUMNS})`)
    .eq("id", transactionId)
    .eq("campaign_id", campaignId)
    .eq("direction", "out")
    .maybeSingle()
  if (error) throw error
  const tx = data as unknown as (OutgoingTransaction & { disbursement: Disbursement | null }) | null
  return tx ? toOutgoing(tx) : null
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

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v))

/**
 * The organizer's explanation of one outgoing transaction
 * (give.record_disbursement). A refund is the "refund" category together
 * with the contribution it refunds; one without the other is refused, so
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
