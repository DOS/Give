import type { Db } from "@/lib/campaigns"
import { isUploadCode, uploadErrorMessage, type AuditEntry } from "@/lib/statement-import"

/**
 * Parked inbound events for finance/admin staff (DOS/Give#73): events whose
 * automatic attempts are used up (DOS-Me migration 20261103180000). Staff
 * send one back to the reprocess cron (give.retry_inbound_event) or end it
 * with a note (give.dismiss_inbound_event, 20261104090000). Both are written
 * to give.audit_log.
 */

export interface ParkedInboundEvent {
  id: string
  channel: string
  dedupe_key: string
  received_at: string
  attempts: number
  last_attempt_at: string | null
  last_error: string | null
  parked_at: string
}

/** Events shown at once, oldest parked first. */
export const PARKED_PAGE = 100
/** give.dismiss_inbound_event keeps notes up to this many characters. */
export const MAX_DISMISS_NOTE_LENGTH = 1000

export const INBOUND_CHANNEL_LABELS: Record<string, string> = {
  statement_import: "Sao kê tải lên",
  bank_api: "API ngân hàng",
  payos: "PayOS",
  crypto: "Tiền mã hóa",
}

export const INBOUND_AUDIT_ACTIONS = ["inbound_event.retry", "inbound_event.dismiss"] as const

export const INBOUND_AUDIT_LABELS: Record<string, string> = {
  "inbound_event.retry": "Gửi lại để xử lý tự động",
  "inbound_event.dismiss": "Bỏ qua sự kiện",
}

/**
 * Parked events, oldest first. give.parked_inbound_events runs with the
 * caller's rights, so inbound_events RLS shows them to finance/admin staff
 * only; it carries no payloads.
 */
export async function listParkedInbound(db: Db): Promise<{ events: ParkedInboundEvent[]; total: number }> {
  const { data, error, count } = await db
    .from("parked_inbound_events")
    .select("id, channel, dedupe_key, received_at, attempts, last_attempt_at, last_error, parked_at", {
      count: "exact",
    })
    .order("parked_at", { ascending: true })
    .limit(PARKED_PAGE)
  if (error) throw error
  const events = (data ?? []) as ParkedInboundEvent[]
  return { events, total: count ?? events.length }
}

/** One parked event as the caller sees it, or null when it is not parked (or not visible). */
export async function getParkedInbound(db: Db, id: string): Promise<ParkedInboundEvent | null> {
  const { data, error } = await db
    .from("parked_inbound_events")
    .select("id, channel, dedupe_key, received_at, attempts, last_attempt_at, last_error, parked_at")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  return (data as ParkedInboundEvent | null) ?? null
}

const STATEMENT_KEY =
  /^v1:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):[0-9a-f]{64}(?::part(\d{1,4})of(\d{1,4}))?$/

/**
 * The receiving account and part of a statement upload's event, read from its
 * dedupe key (v1:<account>:<file sha256>[:part<i>of<n>], see
 * statementPartDedupeKey). Null for keys of other shapes.
 */
export function statementEventRef(
  dedupeKey: string
): { accountId: string; part: { number: number; count: number } | null } | null {
  const match = STATEMENT_KEY.exec(dedupeKey)
  if (!match) return null
  const part = match[2] ? { number: Number(match[2]), count: Number(match[3]) } : null
  return { accountId: match[1], part }
}

/** Why an event was parked, in words for staff. The stored code is shown next to it. */
export function parkedReasonLabel(code: string | null): string {
  if (!code) return "Không có mã lỗi."
  if (code === "processing_timeout") return "Lần nào xử lý cũng quá thời gian cho phép."
  if (code === "processing_failed")
    return "Lỗi khi xử lý, không có mã lỗi cụ thể (có thể do mất kết nối cơ sở dữ liệu)."
  if (code.startsWith("processing_unfinished")) {
    return "Lần xử lý cuối không kết thúc (máy chủ dừng giữa chừng) và đã hết lượt thử."
  }
  if (code === "STATEMENT_PAYLOAD_INVALID") {
    return "Phiên bản Give hiện tại không đọc được dữ liệu đã lưu của sự kiện này. Tải lại đúng file sao kê sẽ xử lý lại nó."
  }
  if (code === "GIVE_NOT_ALLOWED") {
    return "Người tải sao kê lên không còn quyền với tài khoản nhận này. Người có quyền tải lại đúng file sẽ xử lý tiếp."
  }
  if (code === "GIVE_ACCOUNT_NOT_FOUND") return "Không tìm thấy tài khoản nhận của sao kê."
  if (isUploadCode(code) || code.startsWith("GIVE_")) return uploadErrorMessage(code)
  return "Lỗi khác."
}

/** The latest retries and dismissals. give.audit_log is readable by admins only; others get none. */
export async function listInboundAudit(db: Db, limit = 50): Promise<AuditEntry[]> {
  const { data, error } = await db
    .from("audit_log")
    .select("id, actor_id, action, entity, entity_id, before, after, created_at")
    .in("action", [...INBOUND_AUDIT_ACTIONS])
    .order("id", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AuditEntry[]
}
