import type { Db } from "@/lib/campaigns"

/**
 * The email outbox in the admin section (DOS/Give#254). give.outbox is
 * service-role only: pages check the admin role with the user's own token
 * first, then read with the service client.
 */

export const OUTBOX_LIST_LIMIT = 50

export const OUTBOX_KIND_LABELS: Record<string, string> = {
  donation_received: "Biên nhận ủng hộ",
  pledge_payment_due: "Đến hạn thanh toán cam kết",
  pledge_payment_reminder: "Nhắc thanh toán cam kết",
  pledge_lapsed: "Cam kết quá hạn",
  campaign_approved: "Chiến dịch được duyệt",
  campaign_changes_requested: "Yêu cầu chỉnh sửa",
  campaign_suspended: "Chiến dịch bị tạm dừng",
  campaign_ended: "Tổng kết chiến dịch",
}

export const OUTBOX_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ gửi",
  sending: "Đang gửi",
  sent: "Đã gửi",
  dead: "Không gửi được",
  skipped: "Bỏ qua",
}

export const OUTBOX_SKIP_LABELS: Record<string, string> = {
  no_recipient: "không còn địa chỉ nhận (tài khoản đã xóa)",
  unsubscribed: "người nhận đã hủy đăng ký",
  payment_requests_stopped: "yêu cầu thanh toán của dự án đang tạm dừng; gửi lại khi được mở lại",
  expired: "đã quá lâu nên không còn đúng lúc",
  not_received: "khoản ủng hộ không còn ở trạng thái đã nhận",
  not_due: "cam kết không còn đến hạn thanh toán",
}

/**
 * Prefix of last_error when the provider refused every email for now (its
 * account disabled or not yet activated; server/email/smtp.ts). Such a row
 * is held: pending again every hour, the attempt not counted, so it never
 * ends dead, but it is skipped once past its kind's maximum age.
 */
export const ACCOUNT_HOLD_PREFIX = "ACCOUNT:"

export function isAccountHold(error: string | null | undefined): boolean {
  return typeof error === "string" && error.startsWith(ACCOUNT_HOLD_PREFIX)
}

/** Days before an email is too late to send; mirrors give.outbox_max_age (DOS.Me). */
export function outboxMaxAgeDays(kind: string): number {
  if (kind === "pledge_payment_reminder") return 2
  if (kind === "pledge_payment_due" || kind === "campaign_ended") return 14
  return 7
}

/** When claim_outbox will skip the row as expired: max age after it was queued, or after its last deferral. */
export function outboxExpiresAt(row: Pick<OutboxRow, "kind" | "created_at" | "deferred_at">): Date {
  const from = Math.max(Date.parse(row.created_at), row.deferred_at ? Date.parse(row.deferred_at) : 0)
  return new Date(from + outboxMaxAgeDays(row.kind) * 24 * 60 * 60 * 1000)
}

export interface OutboxRow {
  id: string
  kind: string
  status: string
  attempts: number
  max_attempts: number
  last_error: string | null
  recipient_email: string | null
  recipient_user_id: string | null
  campaign_id: string | null
  next_attempt_at: string
  created_at: string
  updated_at: string
  dead_at: string | null
  deferred_at: string | null
}

const COLUMNS =
  "id, kind, status, attempts, max_attempts, last_error, recipient_email, recipient_user_id, campaign_id, next_attempt_at, created_at, updated_at, dead_at, deferred_at"

/** Dead rows, newest first, and how many there are. */
export async function listDeadEmails(service: Db): Promise<{ rows: OutboxRow[]; total: number }> {
  const { data, error, count } = await service
    .from("outbox")
    .select(COLUMNS, { count: "exact" })
    .eq("status", "dead")
    .order("dead_at", { ascending: false })
    .limit(OUTBOX_LIST_LIMIT)
  if (error) throw error
  return { rows: (data ?? []) as OutboxRow[], total: count ?? 0 }
}

/** Rows waiting for a retry after a counted failed attempt, oldest first (held rows are listed apart). */
export async function listRetryingEmails(service: Db): Promise<{ rows: OutboxRow[]; total: number }> {
  const { data, error, count } = await service
    .from("outbox")
    .select(COLUMNS, { count: "exact" })
    .eq("status", "pending")
    .gt("attempts", 0)
    // NOT LIKE alone would drop rows with no last_error (a lease that ran out).
    .or(`last_error.is.null,last_error.not.like.${ACCOUNT_HOLD_PREFIX}*`)
    .order("next_attempt_at", { ascending: true })
    .limit(OUTBOX_LIST_LIMIT)
  if (error) throw error
  return { rows: (data ?? []) as OutboxRow[], total: count ?? 0 }
}

/**
 * Rows held because the provider refused every email (ACCOUNT_HOLD_PREFIX),
 * oldest first: the soonest to expire, give or take their kind. Each is
 * sent once the account works again, unless it expires first.
 */
export async function listHeldEmails(service: Db): Promise<{ rows: OutboxRow[]; total: number }> {
  const { data, error, count } = await service
    .from("outbox")
    .select(COLUMNS, { count: "exact" })
    .eq("status", "pending")
    .like("last_error", `${ACCOUNT_HOLD_PREFIX}%`)
    .order("created_at", { ascending: true })
    .limit(OUTBOX_LIST_LIMIT)
  if (error) throw error
  return { rows: (data ?? []) as OutboxRow[], total: count ?? 0 }
}

/** How many rows are in each status. */
export async function countEmailsByStatus(service: Db): Promise<Record<string, number>> {
  const statuses = Object.keys(OUTBOX_STATUS_LABELS)
  const counts = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await service
        .from("outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", status)
      if (error) throw error
      return [status, count ?? 0] as const
    })
  )
  return Object.fromEntries(counts)
}

/** "m•••@example.com": enough for staff to recognise an address without showing it whole. */
export function maskEmail(email: string | null): string {
  if (!email) return "—"
  const at = email.lastIndexOf("@")
  if (at < 1) return "•••"
  return `${email[0]}•••${email.slice(at)}`
}
