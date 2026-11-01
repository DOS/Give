import { bankByBin } from "./banks"
import type { Db } from "./campaigns"
import { dbErrorMessage } from "./errors"
import { formatVnd } from "./format"
import { isUuid } from "./ids"

/**
 * Statement uploads and the staff queue of ambiguous rows (design sections
 * 2.4 and 5.2; DDL in DOS-Me
 * `supabase/migrations/20261101170000_give_statement_import.sql`).
 *
 * Reads run with the caller's token: RLS shows a batch and its rows to the
 * account's owner and to finance/admin staff, and the column grants leave
 * out the raw bank row, the uploader and the resolver. Every select names its
 * columns. Writes go through the import pipeline (src/server/channels) and
 * give.resolve_statement_import_row, both as the service role.
 */

export type RowStatus = "ready" | "duplicate" | "ambiguous" | "imported"
export type AmbiguousReason =
  | "provider_id_repeated"
  | "provider_id_conflict"
  | "overlap_mismatch"
  | "group_without_balance"
  | "format_without_identity"
  | "balance_break"
  | "file_mismatch"
  | "possible_recorded"
export type Resolution = "import" | "duplicate"

export const ROW_STATUS_LABELS: Record<RowStatus, string> = {
  ready: "Chờ nhập",
  duplicate: "Trùng, đã bỏ qua",
  ambiguous: "Chờ nhân viên tài chính",
  imported: "Đã nhập",
}

/** Why a row went to staff, in the words a finance reviewer needs. */
export const AMBIGUOUS_REASON_LABELS: Record<AmbiguousReason, string> = {
  provider_id_repeated: "Mã giao dịch ngân hàng xuất hiện hai lần trong cùng file.",
  provider_id_conflict: "Mã giao dịch ngân hàng đã được ghi trước đó, nhưng chiều, số tiền hoặc ngày khác.",
  overlap_mismatch: "Các dòng của ngày này không khớp với lần tải sao kê trước của cùng ngày.",
  group_without_balance:
    "Có nhiều dòng giống hệt nhau mà file không ghi số dư sau giao dịch, nên không phân biệt được.",
  format_without_identity: "Định dạng sao kê không có mã giao dịch lẫn số dư chạy, nên không tự nhập được.",
  balance_break:
    "Số dư chạy không liền mạch ở dòng này (có thể thiếu dòng, hoặc ngân hàng đã chuyển dòng sang ngày khác).",
  file_mismatch:
    "Một ngày khác trong file không khớp với lần tải trước (ngân hàng có thể đã chuyển dòng sang ngày khác).",
  possible_recorded: "Có thể đã được ghi nhận: đã có giao dịch cùng chiều, cùng số tiền vào khoảng ngày này.",
}

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  import: "Nhập thành giao dịch mới",
  duplicate: "Là giao dịch đã ghi",
}

export function rowStatusLabel(status: string): string {
  return Object.hasOwn(ROW_STATUS_LABELS, status) ? ROW_STATUS_LABELS[status as RowStatus] : status
}

export function ambiguousReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "—"
  return Object.hasOwn(AMBIGUOUS_REASON_LABELS, reason) ? AMBIGUOUS_REASON_LABELS[reason as AmbiguousReason] : reason
}

// ---------------------------------------------------------------------------
// Upload outcome
// ---------------------------------------------------------------------------

/** The largest file the upload form takes: the server action body limit is 4.5 MB (next.config.ts). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

const UPLOAD_MESSAGES: Record<string, string> = {
  STATEMENT_FILE_INVALID: "File trống hoặc quá lớn (tối đa 4 MB).",
  STATEMENT_ACCOUNT_NOT_FOUND: dbErrorMessage({ message: "GIVE_ACCOUNT_NOT_FOUND" }),
  STATEMENT_CHANNEL_NOT_SUPPORTED: "Tài khoản này không nhận tiền qua sao kê tải lên.",
  STATEMENT_PARSER_UNKNOWN: "Định dạng sao kê này chưa được hỗ trợ.",
  STATEMENT_FORMAT_UNSUPPORTED: "Định dạng sao kê này chưa được hỗ trợ.",
  STATEMENT_PARSER_WRONG_BANK: "Định dạng sao kê này không phải của ngân hàng của tài khoản đã chọn.",
  STATEMENT_PARSER_FLAGS_CHANGED:
    "Định dạng sao kê này đã đổi cách ghi so với các lần tải trước của tài khoản. Hãy báo đội ngũ Give.",
  STATEMENT_PARSE_FAILED:
    "Không đọc được file. Hãy tải đúng file sao kê xuất từ ngân hàng, đúng định dạng đã chọn, chưa chỉnh sửa.",
  STATEMENT_ROWS_INVALID:
    "File không có dòng giao dịch nào, hoặc có hơn 5.000 dòng. Hãy xuất sao kê theo khoảng thời gian ngắn hơn.",
  STATEMENT_ROW_INVALID: "Có một dòng giao dịch không hợp lệ (thiếu ngày, số tiền hoặc mã giao dịch).",
  STATEMENT_ROWS_NOT_CHRONOLOGICAL: "Các dòng giao dịch không theo thứ tự thời gian.",
  STATEMENT_ROW_OUTSIDE_PERIOD: "Có dòng giao dịch nằm ngoài khoảng thời gian ghi trên sao kê.",
  STATEMENT_PERIOD_INVALID: "Khoảng thời gian của sao kê không hợp lệ (ngày kết thúc không được sau hôm nay).",
  STATEMENT_PERIOD_REQUIRED: "Sao kê của định dạng này cần ghi rõ từ ngày, đến ngày.",
  STATEMENT_BALANCE_INVALID: "Số dư ghi trên sao kê không hợp lệ.",
  STATEMENT_TOO_LARGE: "Sao kê quá lớn. Hãy xuất thành nhiều file theo khoảng thời gian ngắn hơn.",
  GIVE_IMPORT_CHANNEL_NOT_SUPPORTED: "Tài khoản này không nhận tiền qua sao kê tải lên.",
  GIVE_IMPORT_PARSER_INVALID: "Định dạng sao kê này chưa được hỗ trợ.",
  GIVE_IMPORT_PARSER_FLAGS_CHANGED:
    "Định dạng sao kê này đã đổi cách ghi so với các lần tải trước của tài khoản. Hãy báo đội ngũ Give.",
  GIVE_IMPORT_PERIOD_INVALID: "Khoảng thời gian của sao kê không hợp lệ (ngày kết thúc không được sau hôm nay).",
  GIVE_IMPORT_PERIOD_REQUIRED: "Sao kê của định dạng này cần ghi rõ từ ngày, đến ngày.",
  GIVE_IMPORT_ROWS_INVALID:
    "File không có dòng giao dịch nào, hoặc có hơn 5.000 dòng. Hãy xuất sao kê theo khoảng thời gian ngắn hơn.",
  GIVE_IMPORT_ROW_INVALID: "Có một dòng giao dịch không hợp lệ (số tiền, ngày hoặc mã giao dịch).",
  GIVE_IMPORT_ROWS_NOT_CHRONOLOGICAL: "Các dòng giao dịch không theo thứ tự thời gian.",
  GIVE_IMPORT_ROW_OUTSIDE_PERIOD: "Có dòng giao dịch nằm ngoài khoảng thời gian ghi trên sao kê.",
}

/** A refused upload in words, with the file's row number when one row is at fault. */
export function uploadErrorMessage(code: string, row?: number): string {
  const text = Object.hasOwn(UPLOAD_MESSAGES, code) ? UPLOAD_MESSAGES[code] : dbErrorMessage({ message: code })
  if (row === undefined) return text
  return text.endsWith(".") ? `${text.slice(0, -1)} (dòng ${row} của file).` : `${text} (dòng ${row} của file)`
}

export interface ImportCounts {
  imported: number
  duplicate: number
  ambiguous: number
  ready: number
}

/** One line summing up an imported batch, e.g. "3 giao dịch mới, 1 dòng trùng đã bỏ qua". */
export function importSummary(counts: ImportCounts): string {
  const parts = [`${counts.imported} giao dịch được ghi`, `${counts.duplicate} dòng trùng đã bỏ qua`]
  if (counts.ambiguous > 0) parts.push(`${counts.ambiguous} dòng chờ nhân viên tài chính xem`)
  if (counts.ready > 0) parts.push(`${counts.ready} dòng chưa nhập xong`)
  return parts.join(", ")
}

// ---------------------------------------------------------------------------
// Accounts a statement can be uploaded for
// ---------------------------------------------------------------------------

export interface UploadAccount {
  id: string
  owner_user_id: string
  bank_bin: string | null
  account_number: string | null
  account_name: string | null
  verification_status: string
}

/**
 * statement_import accounts the caller may upload for: their own, plus every
 * verified one for finance/admin staff. Rejected accounts never received
 * money.
 */
export async function listUploadAccounts(db: Db, userId: string, staff: boolean): Promise<UploadAccount[]> {
  if (!isUuid(userId)) return []
  let query = db
    .from("receiving_accounts")
    .select("id, owner_user_id, bank_bin, account_number, account_name, verification_status")
    .eq("channel", "statement_import")
    .neq("verification_status", "rejected")
  query = staff
    ? query.or(`owner_user_id.eq.${userId},verification_status.eq.verified`)
    : query.eq("owner_user_id", userId)
  const { data, error } = await query.order("created_at", { ascending: false }).limit(200)
  if (error) throw error
  const accounts = (data ?? []) as UploadAccount[]
  // Own accounts first.
  return [...accounts.filter((a) => a.owner_user_id === userId), ...accounts.filter((a) => a.owner_user_id !== userId)]
}

/** "VCB · ****6789 · NGUYEN VAN A" */
export function accountLabel(account: Pick<UploadAccount, "bank_bin" | "account_number" | "account_name">): string {
  const bank = bankByBin(account.bank_bin)?.shortName ?? account.bank_bin ?? "?"
  const number = account.account_number ? `****${account.account_number.slice(-4)}` : "—"
  return [bank, number, account.account_name].filter(Boolean).join(" · ")
}

/** Labels of the accounts batches belong to, by id (accounts the caller may read). */
export async function accountLabels(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const { data, error } = await db
    .from("receiving_accounts")
    .select("id, bank_bin, account_number, account_name")
    .in("id", unique)
  if (error) throw error
  return new Map(((data ?? []) as (UploadAccount & { id: string })[]).map((a) => [a.id, accountLabel(a)]))
}

// ---------------------------------------------------------------------------
// Batches and rows
// ---------------------------------------------------------------------------

export interface StatementBatch {
  id: string
  batch_no: number
  receiving_account_id: string
  parser: string
  period_from: string | null
  period_to: string | null
  row_count: number
  staged_at: string
  imported_at: string | null
}

const BATCH_COLUMNS =
  "id, batch_no, receiving_account_id, parser, period_from, period_to, row_count, staged_at, imported_at"

export interface StatementRowView {
  id: string
  import_batch_id: string
  row_no: number
  booked_at: string
  booked_date_only: boolean
  direction: "in" | "out"
  amount: number
  description: string | null
  counterparty_name: string | null
  counterparty_account_masked: string | null
  balance_after: number | null
  provider_tx_id: string | null
  status: RowStatus
  ambiguous_reason: AmbiguousReason | null
  bank_transaction_id: string | null
  duplicate_of_row_id: string | null
  candidate_row_id: string | null
  resolution: Resolution | null
  resolved_at: string | null
  resolution_note: string | null
}

const ROW_COLUMNS =
  "id, import_batch_id, row_no, booked_at, booked_date_only, direction, amount, description, counterparty_name, " +
  "counterparty_account_masked, balance_after, provider_tx_id, status, ambiguous_reason, bank_transaction_id, " +
  "duplicate_of_row_id, candidate_row_id, resolution, resolved_at, resolution_note"

/** bigint columns may arrive as strings, depending on the PostgREST setup. */
function toRow(row: StatementRowView): StatementRowView {
  return {
    ...row,
    amount: Number(row.amount),
    balance_after: row.balance_after === null ? null : Number(row.balance_after),
  }
}

/** The latest batches the caller may read (their accounts', or all for finance/admin staff). */
export async function listBatches(db: Db, limit = 30): Promise<StatementBatch[]> {
  const { data, error } = await db
    .from("statement_import_batches")
    .select(BATCH_COLUMNS)
    .order("batch_no", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as StatementBatch[]
}

export async function getBatch(db: Db, id: string): Promise<StatementBatch | null> {
  const { data, error } = await db.from("statement_import_batches").select(BATCH_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw error
  return data as StatementBatch | null
}

/** PostgREST returns at most this many rows per request on Supabase. */
const PAGE = 1000

/** Every row of a batch (at most 5 000), in file order. */
export async function listBatchRows(db: Db, batchId: string): Promise<StatementRowView[]> {
  const rows: StatementRowView[] = []
  for (let from = 0; from < 5000; from += PAGE) {
    const { data, error } = await db
      .from("statement_import_rows")
      .select(ROW_COLUMNS)
      .eq("import_batch_id", batchId)
      .order("row_no", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as StatementRowView[]
    rows.push(...page.map(toRow))
    if (page.length < PAGE) break
  }
  return rows
}

/** How many rows of each batch still wait for staff. */
export async function countWaitingRows(db: Db, batchIds: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (batchIds.length === 0) return counts
  const { data, error } = await db
    .from("statement_import_rows")
    .select("import_batch_id")
    .in("import_batch_id", [...batchIds])
    .eq("status", "ambiguous")
    .limit(5000)
  if (error) throw error
  for (const row of (data ?? []) as { import_batch_id: string }[]) {
    counts.set(row.import_batch_id, (counts.get(row.import_batch_id) ?? 0) + 1)
  }
  return counts
}

export interface QueueRow extends StatementRowView {
  batch: StatementBatch
}

const QUEUE_COLUMNS = `${ROW_COLUMNS}, batch:statement_import_batches(${BATCH_COLUMNS})`

/** Rows waiting for staff, oldest batch first (finance/admin; owners see their own). */
export async function listAmbiguousRows(db: Db, limit = 50): Promise<QueueRow[]> {
  const { data, error } = await db
    .from("statement_import_rows")
    .select(QUEUE_COLUMNS)
    .eq("status", "ambiguous")
    .order("created_at", { ascending: true })
    .order("row_no", { ascending: true })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as QueueRow[]).map((row) => ({ ...toRow(row), batch: row.batch }))
}

/** Rows staff resolved, most recent first. */
export async function listResolvedRows(db: Db, limit = 30): Promise<QueueRow[]> {
  const { data, error } = await db
    .from("statement_import_rows")
    .select(QUEUE_COLUMNS)
    .not("resolved_at", "is", null)
    .order("resolved_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as QueueRow[]).map((row) => ({ ...toRow(row), batch: row.batch }))
}

/** Rows by id (the earlier rows that queued rows line up with). */
export async function getRows(db: Db, ids: readonly string[]): Promise<Map<string, StatementRowView>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const { data, error } = await db.from("statement_import_rows").select(ROW_COLUMNS).in("id", unique)
  if (error) throw error
  return new Map(((data ?? []) as unknown as StatementRowView[]).map((row) => [row.id, toRow(row)]))
}

// ---------------------------------------------------------------------------
// Recorded transactions a queued row may repeat
// ---------------------------------------------------------------------------

export interface RecordedTransaction {
  id: string
  provider_tx_id: string
  booked_at: string
  booked_date_only: boolean
  amount: number
  description: string | null
  counterparty_name: string | null
  source: string
}

/** How far around a queued row to look for the transaction it may repeat (the database's orphan window). */
export const DUPLICATE_WINDOW_DAYS = 31

/**
 * Transactions of the row's account with its direction and amount, booked
 * within DUPLICATE_WINDOW_DAYS of it: what give.resolve_statement_import_row
 * accepts as the transaction a duplicate repeats (it checks again).
 */
export async function listDuplicateTargets(
  db: Db,
  row: Pick<StatementRowView, "direction" | "amount" | "booked_at">,
  accountId: string
): Promise<RecordedTransaction[]> {
  const day = 86_400_000
  const at = new Date(row.booked_at).getTime()
  const { data, error } = await db
    .from("bank_transactions")
    .select("id, provider_tx_id, booked_at, booked_date_only, amount, description, counterparty_name, source")
    .eq("receiving_account_id", accountId)
    .eq("direction", row.direction)
    .eq("amount", row.amount)
    .gte("booked_at", new Date(at - DUPLICATE_WINDOW_DAYS * day).toISOString())
    .lte("booked_at", new Date(at + DUPLICATE_WINDOW_DAYS * day).toISOString())
    .order("booked_at", { ascending: true })
    .limit(20)
  if (error) throw error
  return ((data ?? []) as RecordedTransaction[]).map((tx) => ({ ...tx, amount: Number(tx.amount) }))
}

/** "+200.000 ₫" or "−50.000 ₫" */
export function signedAmount(direction: "in" | "out", amount: number): string {
  return `${direction === "in" ? "+" : "−"}${formatVnd(amount)}`
}

// ---------------------------------------------------------------------------
// Audit trail (admin only under RLS)
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: number
  actor_id: string | null
  action: string
  entity: string
  entity_id: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}

export const RECONCILIATION_AUDIT_ACTIONS = ["statement_import_row.resolve", "bank_transaction.manual_match"] as const

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "statement_import_row.resolve": "Xử lý dòng sao kê",
  "bank_transaction.manual_match": "Khớp tay giao dịch",
}

/** The latest reconciliation audit entries. give.audit_log is readable by admins only; others get none. */
export async function listReconciliationAudit(db: Db, limit = 50): Promise<AuditEntry[]> {
  const { data, error } = await db
    .from("audit_log")
    .select("id, actor_id, action, entity, entity_id, before, after, created_at")
    .in("action", [...RECONCILIATION_AUDIT_ACTIONS])
    .order("id", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AuditEntry[]
}
