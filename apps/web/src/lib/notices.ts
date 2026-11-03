import type { Db } from "@/lib/campaigns"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"

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

function campaignName(payload: Notice["payload"], noun = "chiến dịch"): string {
  const title = text(payload, "campaign_title")
  return title ? `${noun} “${title}”` : `${noun} của bạn`
}

function capitalize(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

/** The backer's pledge page, by the reference code in the payload. */
function pledgeLink(payload: Notice["payload"], label: string): Pick<NoticeView, "href" | "linkLabel"> {
  const code = text(payload, "reference_code")
  return code && /^GV[0-9A-Z]{6,7}$/.test(code)
    ? { href: `/me/pledges/${code}`, linkLabel: label }
    : { href: null, linkLabel: null }
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
      // Payload of give.pledge_notice_payload (DOS/Give#30); reminders add amount_due and day.
      const intended = count(p, "intended_amount")
      const received = count(p, "received_amount") ?? 0
      const due = count(p, "amount_due") ?? (intended !== null ? Math.max(0, intended - received) : null)
      const dueAt = text(p, "payment_due_at")
      let body =
        notice.kind === "payment_due"
          ? `${campaignName(p, "dự án")} đã đạt mục tiêu. Hãy thanh toán`
          : `Cam kết ủng hộ ${campaignName(p, "dự án")} chưa được ghi nhận thanh toán đủ. Hãy thanh toán`
      if (due) body += ` ${formatVnd(due)}`
      body += " cho cam kết của bạn"
      body += dueAt ? ` trước ${formatDateTime(dueAt)}.` : "."
      if (notice.kind === "payment_reminder") {
        body += " Nếu bạn đã chuyển khoản, đừng chuyển lại: Give cập nhật khi đối soát sao kê."
      }
      body += " Quá hạn mà chưa trả đủ, cam kết hết hiệu lực và suất quà được nhả."
      return {
        title: notice.kind === "payment_due" ? "Đến hạn thanh toán cam kết" : "Nhắc thanh toán cam kết",
        body: capitalize(body),
        ...pledgeLink(p, "Thanh toán ngay"),
      }
    }
    case "pledge_cancelled": {
      const reason = text(p, "reason")
      const why =
        reason === "campaign_failed"
          ? "không đạt mục tiêu khi kết thúc"
          : reason === "campaign_cancelled"
            ? "đã bị hủy"
            : "đã dừng"
      return {
        title: "Cam kết đã được hủy",
        body: capitalize(`${campaignName(p, "dự án")} ${why}, nên cam kết của bạn được hủy. Bạn không phải trả tiền.`),
        ...pledgeLink(p, "Xem cam kết"),
      }
    }
    case "pledge_lapsed":
      return {
        title: "Cam kết đã quá hạn thanh toán",
        body: capitalize(
          `Cam kết ủng hộ ${campaignName(p, "dự án")} chưa được thanh toán trước hạn nên đã hết hiệu lực, và suất quà được nhả cho người khác.`
        ),
        ...pledgeLink(p, "Xem cam kết"),
      }
    case "refund_due": {
      const received = count(p, "received_amount")
      const by = text(p, "refund_due_at")
      let body = `Cam kết ủng hộ ${campaignName(p, "dự án")} không còn hiệu lực (chưa được thanh toán đủ trước hạn, hoặc tiền đến sau khi cam kết đã hết hiệu lực). Người tạo dự án phải hoàn lại`
      body += received ? ` ${formatVnd(received)} bạn đã chuyển` : " số tiền bạn đã chuyển"
      body += by ? ` trước ${formatDate(by)}.` : "."
      return { title: "Bạn sẽ được hoàn tiền", body: capitalize(body), ...pledgeLink(p, "Xem cam kết") }
    }
    case "refund_owed": {
      const received = count(p, "received_amount")
      const by = text(p, "refund_due_at")
      const code = text(p, "reference_code")
      let body = `Một người ủng hộ ${campaignName(p, "dự án")}`
      if (code) body += ` (mã ${code})`
      body += " có khoản đã chuyển cho một cam kết không còn hiệu lực. Bạn cần hoàn lại"
      body += received ? ` ${formatVnd(received)}` : " số tiền họ đã chuyển"
      body += by ? ` trước ${formatDate(by)}` : ""
      body +=
        ", rồi giải trình khoản chuyển đó là hoàn tiền. Trang dự án công khai số tiền hoàn còn nợ cho tới khi hoàn xong."
      return {
        title: "Cần hoàn tiền cho người ủng hộ",
        body: capitalize(body),
        href: notice.campaign_id ? `/me/campaigns/${notice.campaign_id}/disbursements` : null,
        linkLabel: notice.campaign_id ? "Giải trình hoàn tiền" : null,
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
