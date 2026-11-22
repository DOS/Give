import type { Db } from "@/lib/campaigns"
import { bankByBin } from "@/lib/banks"
import { VIA_CONTACT_EMAIL } from "@/lib/contact"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { paymentRequestsStopped } from "@/lib/payment-requests"
import { NEW_CODE_EVERY_MONTH, PLAN_ENDED_REASON_LABELS, periodLabel, type PlanEndedReason } from "@/lib/plans"
import { SLUG_PATTERN } from "@/lib/slug"

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

export interface NoticeRenderOptions {
  /** True while a moderator has stopped the campaign's payment requests (DOS/Give#93). */
  paymentRequestsStopped?: boolean
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

/**
 * Monthly plans (DOS/Give#276, design 4.3.4). A month without a transfer is
 * not a debt, so nothing here says "quá hạn", "nợ" or "còn thiếu". The
 * payloads (give.plan_notice_payload, and give.outbox_campaign_payload for the
 * email) carry the campaign title and slug; both are still treated as
 * optional, for notices written before they did.
 */

/** "chiến dịch “…”", or a donor's neutral wording when the payload has no title. */
export function planCampaign(payload: Notice["payload"]): string {
  const title = text(payload, "campaign_title")
  return title ? `chiến dịch “${title.trim()}”` : "chiến dịch bạn ủng hộ hằng tháng"
}

/** "11/2026" from plan_period, or null. */
function planMonth(payload: Notice["payload"]): string | null {
  const period = text(payload, "plan_period")
  return period && /^\d{4}-\d{2}-01$/.test(period) ? periodLabel(period) : null
}

/** The campaign account the donor may have saved a transfer template for, masked: "Vietcombank •••• 1234". */
export function planTemplateAccount(payload: Notice["payload"]): string | null {
  const last4 = text(payload, "account_last4")
  if (!last4 || !/^[0-9A-Za-z]{1,4}$/.test(last4)) return null
  const bank = bankByBin(text(payload, "bank_bin"))?.shortName
  return bank ? `${bank} •••• ${last4}` : `•••• ${last4}`
}

function isPlanEndedReason(value: string | null): value is PlanEndedReason {
  return value !== null && Object.prototype.hasOwnProperty.call(PLAN_ENDED_REASON_LABELS, value)
}

/**
 * Why a plan stopped, that Give will not issue codes or remind any more, and
 * to delete a saved transfer template: the email and the in-app notice of
 * plan_ended say the same.
 */
export function planEndedParagraphs(payload: Notice["payload"]): string[] {
  const monthly = count(payload, "amount")
  const reason = text(payload, "ended_reason")
  let stopped = `Kế hoạch ủng hộ ${monthly ? `${formatVnd(monthly)} ` : ""}mỗi tháng cho ${planCampaign(payload)} đã dừng.`
  if (isPlanEndedReason(reason)) {
    const label = PLAN_ENDED_REASON_LABELS[reason]
    stopped += ` Lý do: ${label.charAt(0).toLowerCase()}${label.slice(1)}.`
  }
  const account = planTemplateAccount(payload)
  const target = account ? `tài khoản ${account}` : "tài khoản nhận của chiến dịch"
  return [
    stopped,
    "Give sẽ không tạo mã ủng hộ mới và không nhắc bạn cho kế hoạch này nữa.",
    `Nếu bạn đã lưu mẫu chuyển tiền tới ${target} trong app ngân hàng, hãy xóa mẫu đó: tiền chuyển theo mẫu, kể cả sau khi chiến dịch kết thúc, vẫn vào tài khoản của người tổ chức.`,
  ]
}

function asksForPayment(notice: Pick<Notice, "kind" | "payload">): boolean {
  if (notice.kind === "payment_due" || notice.kind === "payment_reminder") return true
  return notice.kind === "payment_requests_resumed" && text(notice.payload, "reference_code") !== null
}

/** Vietnamese title, body and link of a notice, from its kind and payload. */
export function describeNotice(notice: Notice, options?: NoticeRenderOptions): NoticeView {
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
      if (options?.paymentRequestsStopped) {
        const which = notice.kind === "payment_due" ? "đến hạn thanh toán" : "nhắc thanh toán"
        return {
          title: "Yêu cầu thanh toán đang tạm dừng",
          body: `Give đang tạm dừng yêu cầu thanh toán của ${campaignName(p, "dự án")}. Thông báo ${which} này được gửi trước khi tạm dừng; đừng chuyển tiền cho cam kết của bạn trong lúc tạm dừng.`,
          ...pledgeLink(p, "Xem cam kết"),
        }
      }
      // Payload of give.pledge_notice_payload (DOS/Give#30); reminders add amount_due and day.
      // Net of refunds (DOS/Give#89): older payloads have no refunded_amount.
      const intended = count(p, "intended_amount")
      const received = count(p, "received_amount") ?? 0
      const refunded = count(p, "refunded_amount") ?? 0
      const due = count(p, "amount_due") ?? (intended !== null ? Math.max(0, intended - (received - refunded)) : null)
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
      // refund_amount: what is still owed, net of refunds (DOS/Give#89); older payloads only have received_amount.
      const received = count(p, "refund_amount") ?? count(p, "received_amount")
      const by = text(p, "refund_due_at")
      // A refund the bank sent back (DOS/Give#72): the pledge is owed a refund again.
      const returned = text(p, "reason") === "refund_returned"
      let body = returned
        ? `Khoản hoàn tiền cho cam kết ủng hộ ${campaignName(p, "dự án")} chưa đến được tài khoản của bạn: ngân hàng đã trả lại. Nếu số tài khoản nhận tiền của bạn đã đổi, hãy báo người tạo dự án. Người tạo dự án phải hoàn lại`
        : `Cam kết ủng hộ ${campaignName(p, "dự án")} không còn hiệu lực (chưa được thanh toán đủ trước hạn, hoặc tiền đến sau khi cam kết đã hết hiệu lực). Người tạo dự án phải hoàn lại`
      if (returned) body += received ? ` ${formatVnd(received)}` : " số tiền còn nợ bạn"
      else body += received ? ` ${formatVnd(received)} bạn đã chuyển` : " số tiền bạn đã chuyển"
      body += by ? ` trước ${formatDate(by)}.` : "."
      // The fee the bank kept is the organizer's to bear (DOS/Give#195): refund_amount already includes it.
      const fee = returned ? count(p, "bank_fee") : null
      if (fee) body += ` Ngân hàng đã giữ ${formatVnd(fee)} phí; người tạo dự án chịu phí này, bạn vẫn được hoàn đủ.`
      return { title: "Bạn sẽ được hoàn tiền", body: capitalize(body), ...pledgeLink(p, "Xem cam kết") }
    }
    case "refund_owed": {
      const owed = count(p, "refund_amount") ?? count(p, "received_amount")
      const by = text(p, "refund_due_at")
      const code = text(p, "reference_code")
      let body = `Một người ủng hộ ${campaignName(p, "dự án")}`
      if (code) body += ` (mã ${code})`
      if (text(p, "reason") === "refund_returned") {
        // The refund was explained, but the bank sent it back (DOS/Give#72).
        // A fee the bank kept is the organizer's (DOS/Give#195): the earlier
        // refund counts zero, fee included, and refund_amount already holds
        // the full amount owed, so nothing is added or taken off here.
        const fee = count(p, "bank_fee")
        body += fee
          ? ` chưa nhận được khoản hoàn tiền bạn đã chuyển: ngân hàng đã trả lại nhưng giữ ${formatVnd(fee)} phí. Cả khoản bạn đã chuyển trước đó, kể cả phần phí, không còn được tính là đã hoàn; phí này do bạn chịu, không trừ vào tiền hoàn. Hãy kiểm tra lại số tài khoản với người ủng hộ và chuyển lại đủ`
          : " chưa nhận được khoản hoàn tiền bạn đã chuyển: ngân hàng đã trả lại. Hãy kiểm tra lại số tài khoản với người ủng hộ và hoàn lại"
        body += owed ? ` ${formatVnd(owed)}` : " số tiền còn nợ họ"
        body += by ? ` trước ${formatDate(by)}` : ""
      } else if (text(p, "reason") === "overpaid") {
        // A paid pledge that received more than it pledged (DOS/Give#89).
        body += " đã chuyển nhiều hơn số cam kết. Bạn cần hoàn lại phần thừa"
        body += owed ? ` ${formatVnd(owed)}` : ""
      } else {
        body += " có khoản đã chuyển cho một cam kết không còn hiệu lực. Bạn cần hoàn lại"
        body += owed ? ` ${formatVnd(owed)}` : " số tiền họ đã chuyển"
        body += by ? ` trước ${formatDate(by)}` : ""
      }
      body +=
        ", rồi giải trình khoản chuyển đó là hoàn tiền. Trang dự án công khai số tiền hoàn còn nợ cho tới khi hoàn xong."
      return {
        title: "Cần hoàn tiền cho người ủng hộ",
        body: capitalize(body),
        href: notice.campaign_id ? `/me/campaigns/${notice.campaign_id}/disbursements` : null,
        linkLabel: notice.campaign_id ? "Giải trình hoàn tiền" : null,
      }
    }
    case "payment_requests_stopped": {
      // To each backer still asked to pay (their pledge in the payload) and to the creator (DOS/Give#89).
      const note = text(p, "public_note")
      const backer = text(p, "reference_code") !== null
      let body = `Give đã tạm dừng yêu cầu thanh toán của ${campaignName(p, "dự án")}.`
      body += backer
        ? " Đừng chuyển tiền cho cam kết của bạn, kể cả theo thông tin chuyển khoản đã nhận trước đó, cho tới khi Give thông báo tiếp."
        : " Người ủng hộ không còn được nhắc thanh toán và trang thanh toán đã ẩn. Trang dự án công khai thông báo này."
      if (note) body += ` Ghi chú của Give: ${note}`
      if (backer) {
        body +=
          " Thời gian tạm dừng không tính vào hạn thanh toán: cam kết không hết hiệu lực trong lúc tạm dừng, và khi mở lại, hạn được lùi thêm đúng số ngày đã tạm dừng."
      }
      const slug = text(p, "campaign_slug")
      return {
        title: "Tạm dừng yêu cầu thanh toán",
        body,
        ...(backer
          ? pledgeLink(p, "Xem cam kết")
          : slug && SLUG_PATTERN.test(slug)
            ? { href: `/campaigns/${slug}`, linkLabel: "Xem dự án" }
            : { href: null, linkLabel: null }),
      }
    }
    case "payment_requests_resumed": {
      const dueAt = text(p, "payment_due_at")
      const slug = text(p, "campaign_slug")
      if (text(p, "reference_code") === null) {
        // The creator's copy: no pledge in the payload.
        return {
          title: "Mở lại yêu cầu thanh toán",
          body: `Give đã mở lại yêu cầu thanh toán của ${campaignName(p, "dự án")}: người ủng hộ đang chờ thanh toán thấy lại thông tin chuyển khoản và được nhắc như trước.`,
          ...(slug && SLUG_PATTERN.test(slug)
            ? { href: `/campaigns/${slug}`, linkLabel: "Xem dự án" }
            : { href: null, linkLabel: null }),
        }
      }
      if (options?.paymentRequestsStopped) {
        return {
          title: "Yêu cầu thanh toán đang tạm dừng",
          body: `Give đang tạm dừng yêu cầu thanh toán của ${campaignName(p, "dự án")}. Thông báo mở lại thanh toán này được gửi trước đợt tạm dừng hiện tại; đừng chuyển tiền cho cam kết của bạn trong lúc tạm dừng.`,
          ...pledgeLink(p, "Xem cam kết"),
        }
      }
      let body = `Give đã mở lại yêu cầu thanh toán của ${campaignName(p, "dự án")}. Hãy thanh toán cam kết của bạn`
      body += dueAt ? ` trước ${formatDateTime(dueAt)} (hạn đã được lùi thêm đúng thời gian tạm dừng).` : "."
      body += " Quá hạn mà chưa trả đủ, cam kết hết hiệu lực."
      return { title: "Mở lại yêu cầu thanh toán", body, ...pledgeLink(p, "Thanh toán ngay") }
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
    case "moderator_inquiry": {
      const note = text(p, "note")
      const slug = text(p, "campaign_slug")
      let body = `Đội kiểm duyệt Give cần bạn làm rõ thêm về ${campaignName(p)}.`
      if (note) body += ` Nội dung: ${note}`
      body += ` Bạn có thể bổ sung cập nhật hoặc chứng từ trên trang quản lý chiến dịch, hoặc phản hồi đội ngũ Give ${VIA_CONTACT_EMAIL}.`
      const link =
        notice.campaign_id && isUuid(notice.campaign_id)
          ? { href: `/me/campaigns/${notice.campaign_id}`, linkLabel: "Quản lý chiến dịch" }
          : slug && SLUG_PATTERN.test(slug)
            ? { href: `/campaigns/${slug}`, linkLabel: "Xem chiến dịch" }
            : { href: null, linkLabel: null }
      return {
        title: "Cần làm rõ thông tin chiến dịch",
        body,
        ...link,
      }
    }
    case "plan_reminder":
    case "plan_followup": {
      // A month's donation of a monthly plan (first: issued at sign-up).
      const followup = notice.kind === "plan_followup"
      const month = planMonth(p)
      const thisMonth = month ? `tháng ${month}` : "tháng này"
      const code = text(p, "reference_code")
      const due = count(p, "intended_amount") ?? count(p, "amount")
      let body =
        !followup && p?.first === true
          ? `Bạn đã bắt đầu ủng hộ hằng tháng cho ${planCampaign(p)}.`
          : `${followup ? "Nhắc lại mã" : "Mã"} ủng hộ ${thisMonth} cho ${planCampaign(p)}.`
      if (code && /^GV[0-9A-Z]{6,7}$/.test(code)) {
        body += ` Mã ${thisMonth} của bạn là ${code}${due ? `, số tiền ${formatVnd(due)}` : ""}.`
      }
      body += ` ${NEW_CODE_EVERY_MONTH} Nếu bạn đã chuyển thì bỏ qua thông báo này.`
      return {
        title:
          !followup && p?.first === true
            ? "Đã bắt đầu ủng hộ hằng tháng"
            : followup
              ? `Nhắc lại mã ủng hộ ${thisMonth}`
              : `Mã ủng hộ ${thisMonth}`,
        body,
        href: "/me/contributions",
        linkLabel: "Xem mã QR tháng này",
      }
    }
    case "plan_ended": {
      const slug = text(p, "campaign_slug")
      return {
        title: "Kế hoạch ủng hộ hằng tháng đã dừng",
        body: planEndedParagraphs(p).join(" "),
        ...(slug && SLUG_PATTERN.test(slug)
          ? { href: `/campaigns/${slug}`, linkLabel: "Xem trang chiến dịch" }
          : { href: "/me/contributions", linkLabel: "Xem các khoản ủng hộ" }),
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

const CAMPAIGNS_PER_REQUEST = 100

/**
 * Campaign ids among the user's payment notices whose payment requests a
 * moderator currently has stopped (campaigns.payments_stopped_at non-null,
 * public on give.campaigns since DOS/Give#89). Skips the query when no notice
 * asks the user to pay; throws on a database error so an older payment notice
 * never falls back to "Hãy thanh toán" when the check fails (DOS/Give#93).
 */
export async function stoppedNoticeCampaigns(
  db: Db,
  notices: readonly Pick<Notice, "kind" | "campaign_id" | "payload">[]
): Promise<Set<string>> {
  const ids = [
    ...new Set(
      notices
        .filter(
          (n): n is Pick<Notice, "kind" | "payload"> & { campaign_id: string } =>
            Boolean(n.campaign_id && isUuid(n.campaign_id)) && asksForPayment(n)
        )
        .map((n) => n.campaign_id)
    ),
  ]
  if (ids.length === 0) return new Set()
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += CAMPAIGNS_PER_REQUEST) chunks.push(ids.slice(i, i + CAMPAIGNS_PER_REQUEST))
  const reads = await Promise.all(
    chunks.map((chunk) => db.from("campaigns").select("id, payments_stopped_at").in("id", chunk))
  )
  const stopped = new Set<string>()
  for (const { data, error } of reads) {
    if (error) throw error
    for (const row of (data ?? []) as { id: string; payments_stopped_at: string | null }[]) {
      if (paymentRequestsStopped(row)) stopped.add(row.id)
    }
  }
  return stopped
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
