import type { Db } from "@/lib/campaigns"
import { formatDate, formatVnd } from "@/lib/format"

/**
 * In-app notices (give.notices, DOS/Give#52): reminders and status changes
 * for organizers and backers until the M4 email outbox. The server creates
 * them (give.create_notice, cron jobs and money RPCs); a user reads and marks
 * as read only their own, under RLS.
 */

export const NOTICE_COLUMNS = "id, kind, campaign_id, payload, created_at, read_at"

/** How many notices /me/notices shows, newest first. */
export const NOTICE_PAGE_SIZE = 100

export interface Notice {
  id: string
  kind: string
  campaign_id: string | null
  payload: Record<string, unknown> | null
  created_at: string
  read_at: string | null
}

export interface NoticeView {
  title: string
  body: string
  href: string | null
  linkLabel: string | null
}

function text(payload: Notice["payload"], key: string): string | null {
  const value = payload?.[key]
  return typeof value === "string" && value.trim() !== "" ? value : null
}

function count(payload: Notice["payload"], key: string): number | null {
  const value = payload?.[key]
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
}

function campaignName(payload: Notice["payload"]): string {
  const title = text(payload, "campaign_title")
  return title ? `chiến dịch “${title}”` : "chiến dịch của bạn"
}

/** Vietnamese title, body and link of a notice, from its kind and payload. */
export function describeNotice(notice: Notice): NoticeView {
  const p = notice.payload
  switch (notice.kind) {
    case "explain_spending": {
      const n = count(p, "unexplained_count")
      const amount = count(p, "unexplained_amount")
      const overdue = count(p, "overdue_count")
      let body = `${n ? `${n} khoản chi` : "Có khoản chi"} của ${campaignName(p)} chưa được giải trình`
      body += amount ? `, tổng ${formatVnd(amount)}.` : "."
      if (overdue) body += ` ${overdue} khoản đã quá 7 ngày.`
      body += " Hãy ghi mục đích và người nhận cho từng khoản để người ủng hộ thấy tiền đã dùng vào việc gì."
      return {
        title: "Cần giải trình khoản chi",
        body,
        href: notice.campaign_id ? `/me/campaigns/${notice.campaign_id}/disbursements` : null,
        linkLabel: notice.campaign_id ? "Giải trình ngay" : null,
      }
    }
    case "payment_due":
    case "payment_reminder": {
      const amount = count(p, "amount")
      const due = text(p, "due_at")
      const code = text(p, "reference_code")
      let body = `Cam kết ủng hộ ${campaignName(p)}`
      if (amount) body += ` (${formatVnd(amount)})`
      body += due ? ` cần được thanh toán trước ngày ${formatDate(due)}.` : " đã đến lúc thanh toán."
      return {
        title: notice.kind === "payment_due" ? "Đến hạn thanh toán cam kết" : "Nhắc thanh toán cam kết",
        body,
        href: code ? `/donations/${encodeURIComponent(code)}` : null,
        linkLabel: code ? "Xem cách chuyển khoản" : null,
      }
    }
    case "account_verified":
      return {
        title: "Tài khoản nhận đã được xác minh",
        body: "Bạn có thể gắn tài khoản này vào chiến dịch để nhận tiền ủng hộ.",
        href: "/me/accounts",
        linkLabel: "Xem tài khoản nhận",
      }
    case "account_rejected": {
      const reason = text(p, "reason")
      return {
        title: "Tài khoản nhận chưa được xác minh",
        body: reason
          ? `Tài khoản nhận của bạn chưa được xác minh. Lý do: ${reason}`
          : "Tài khoản nhận của bạn chưa được xác minh. Hãy xem lại thông tin tài khoản.",
        href: "/me/accounts",
        linkLabel: "Xem tài khoản nhận",
      }
    }
    default:
      return { title: "Thông báo", body: "Bạn có một thông báo mới.", href: null, linkLabel: null }
  }
}

/** The user's notices, newest first. Throws on a database error. */
export async function listNotices(db: Db, userId: string): Promise<Notice[]> {
  const { data, error } = await db
    .from("notices")
    .select(NOTICE_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(NOTICE_PAGE_SIZE)
  if (error) throw error
  return (data ?? []) as Notice[]
}

/**
 * Unread notices of the user for the header badge. Returns 0 on any error, so
 * a missing table or an expired token never breaks a page.
 */
export async function countUnreadNotices(db: Db, userId: string): Promise<number> {
  try {
    const { count, error } = await db
      .from("notices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null)
    if (error) return 0
    return typeof count === "number" ? count : 0
  } catch {
    return 0
  }
}

/** "9+" past nine, so the header badge stays small. */
export function unreadBadge(n: number): string | null {
  if (!(n > 0)) return null
  return n > 9 ? "9+" : String(n)
}
