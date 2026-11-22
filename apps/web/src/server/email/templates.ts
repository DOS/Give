import { donationTrackingPath } from "@/lib/contributions"
import { GIVE_CONTACT_EMAIL } from "@/lib/contact"
import { formatDateTime, formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import {
  describeNotice,
  planCampaign,
  planEndedParagraphs,
  swapDateLabel,
  swappedNewAccountLine,
  swappedOldAccountTarget,
} from "@/lib/notices"
import { NEW_CODE_EVERY_MONTH, periodLabel, planStopOneClickPath, planStopPath } from "@/lib/plans"
import { SLUG_PATTERN } from "@/lib/slug"

/**
 * Vietnamese emails of the outbox (DOS/Give#254). Plain HTML with inline
 * styles and a text part; no images, no tracking pixels, no remote content.
 * Everything that comes from a payload (organizer-written titles above all)
 * is escaped. Pledge emails reuse the in-app notice wording (lib/notices).
 *
 * A campaign title appears in a subject only once it passed review: an
 * organizer can edit the title only in draft or changes_requested
 * (give.is_editable_status), so from approval on it is the approved one.
 *
 * Monthly plan emails (DOS/Give#276, design 4.3.4): a month's code
 * (plan_reminder, plan_followup) and the end of a plan (plan_ended). Nothing
 * is ever charged and a month without a transfer is not a debt, so no copy
 * says "quá hạn", "nợ" or "còn thiếu". A reminder carries the plan's stop
 * link, signed by the sender (server/plans/stop-link) and passed in already
 * signed, so this module stays pure.
 */

export const EMAIL_KINDS = [
  "donation_received",
  "pledge_payment_due",
  "pledge_payment_reminder",
  "pledge_lapsed",
  "campaign_approved",
  "campaign_changes_requested",
  "campaign_suspended",
  "campaign_ended",
  "plan_reminder",
  "plan_followup",
  "plan_ended",
  "plan_account_swapped",
  "pledge_account_swapped",
] as const
export type EmailKind = (typeof EMAIL_KINDS)[number]

export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === "string" && (EMAIL_KINDS as readonly string[]).includes(value)
}

/** One leased outbox row, as give.claim_outbox returns it. */
export interface OutboxEmail {
  id: string
  kind: string
  category: "transactional" | "notification"
  to_email: string
  payload: Record<string, unknown> | null
  attempt: number
  idempotency_key: string
  unsubscribe_token: string | null
  reference_code: string | null
  tracking_token: string | null
  /** The plan's stop token (64 hex), minted by claim_outbox for plan reminders and swap notices. */
  stop_token: string | null
}

/** Kinds whose email carries the plan's stop link and must not go out without it. */
export const STOP_LINK_KINDS: readonly EmailKind[] = ["plan_reminder", "plan_followup", "plan_account_swapped"]

export function carriesStopLink(kind: string): boolean {
  return (STOP_LINK_KINDS as readonly string[]).includes(kind)
}

export interface RenderOptions {
  /** The stop token already signed (`<token>.<signature>`, server/plans/stop-link), for plan reminders. */
  signedStopToken?: string | null
}

export interface RenderedEmail {
  subject: string
  text: string
  html: string
  /** Absolute unsubscribe page URL, linked in the body (notification emails only). */
  unsubscribeUrl: string | null
  /** Absolute one-click endpoint (RFC 8058) for the List-Unsubscribe header. */
  oneClickUnsubscribeUrl: string | null
}

/** Thrown when a row cannot become an email; the sender marks it dead at once. */
export class EmailRenderError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = "EmailRenderError"
  }
}

interface Content {
  subject: string
  heading: string
  paragraphs: string[]
  link: { href: string; label: string } | null
  note?: string
  /** Replaces the default footer line (why the recipient gets this email). */
  footer?: string
}

function text(payload: OutboxEmail["payload"], key: string): string | null {
  const value = payload?.[key]
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null
}

function amount(payload: OutboxEmail["payload"], key: string): number | null {
  const value = payload?.[key]
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null
}

function quoted(payload: OutboxEmail["payload"], noun: string): string {
  const title = text(payload, "campaign_title")
  return title ? `${noun} “${title}”` : `${noun} của bạn`
}

function campaignPath(payload: OutboxEmail["payload"]): string | null {
  const slug = text(payload, "campaign_slug")
  return slug && SLUG_PATTERN.test(slug) ? `/campaigns/${slug}` : null
}

function organizerPath(payload: OutboxEmail["payload"]): string {
  const id = text(payload, "campaign_id")
  return id && isUuid(id) ? `/me/campaigns/${id}` : "/me/campaigns"
}

function isBack(payload: OutboxEmail["payload"]): boolean {
  return text(payload, "campaign_type") === "back"
}

const DONATION_CODE = /^GV[0-9A-Z]{6,7}$/

function donationReceived(email: OutboxEmail): Content {
  const p = email.payload
  // The amount is shown only for a transfer in đồng; any other asset (closed
  // for now, design G2) gets the generic wording rather than a wrong unit.
  const received = text(p, "asset") === "VND" ? amount(p, "received_amount") : null
  const code = email.reference_code ?? text(p, "reference_code")
  const guest = p?.guest === true
  const paragraphs = [
    `Cảm ơn bạn đã ủng hộ ${quoted(p, "chiến dịch")}.`,
    `Give đã ghi nhận ${received !== null ? formatVnd(received) : "khoản chuyển của bạn"} vào tài khoản nhận của chiến dịch` +
      (code ? ` (mã ủng hộ ${code}).` : "."),
    "Tiền đi thẳng vào tài khoản của người tổ chức; Give không giữ tiền. Sao kê công khai của chiến dịch cho thấy mọi khoản vào và cách tiền được chi.",
  ]
  let link: Content["link"] = null
  let note: string | undefined
  if (guest) {
    if (code && DONATION_CODE.test(code) && email.tracking_token && /^[0-9a-f]{64}$/.test(email.tracking_token)) {
      link = { href: donationTrackingPath(code, email.tracking_token), label: "Xem khoản ủng hộ" }
      note = "Đường dẫn này dành riêng cho bạn và hết hạn sau 7 ngày; đừng chuyển tiếp email này cho người khác."
    } else {
      const path = campaignPath(p)
      link = path ? { href: `${path}/statement`, label: "Xem sao kê công khai" } : null
    }
  } else {
    link = { href: "/me/contributions", label: "Xem các khoản ủng hộ của bạn" }
  }
  return {
    subject: `Give đã nhận khoản ủng hộ của bạn cho ${quoted(p, "chiến dịch")}`,
    heading: "Give đã nhận khoản ủng hộ của bạn",
    paragraphs: [
      ...paragraphs,
      "Email này xác nhận Give đã ghi nhận khoản chuyển, không phải hóa đơn hay chứng từ thuế.",
    ],
    link,
    note,
  }
}

const NOTICE_KIND: Record<string, string> = {
  pledge_payment_due: "payment_due",
  pledge_payment_reminder: "payment_reminder",
  pledge_lapsed: "pledge_lapsed",
}

function pledgeEmail(email: OutboxEmail): Content {
  const view = describeNotice({
    id: email.id,
    kind: NOTICE_KIND[email.kind],
    campaign_id: text(email.payload, "campaign_id"),
    payload: email.payload,
    created_at: new Date().toISOString(),
    read_at: null,
  })
  return {
    subject: view.title,
    heading: view.title,
    paragraphs: [view.body],
    link: view.href && view.linkLabel ? { href: view.href, label: view.linkLabel } : null,
  }
}

function campaignEnded(email: OutboxEmail): Content {
  const p = email.payload
  const goal = amount(p, "goal_amount")
  const raised = amount(p, "raised_amount")
  const pledged = amount(p, "pledged_amount")
  const supporters = amount(p, "supporter_count")
  const toStatus = text(p, "to_status")
  const link = { href: organizerPath(p), label: "Mở trang quản lý chiến dịch" }
  if (isBack(p)) {
    if (toStatus === "succeeded") {
      return {
        subject: `${capitalize(quoted(p, "dự án"))} đã đạt mục tiêu`,
        heading: "Dự án đã đạt mục tiêu",
        paragraphs: [
          `${capitalize(quoted(p, "dự án"))} đã kết thúc với tổng cam kết ${pledged !== null ? formatVnd(pledged) : "đạt mục tiêu"}` +
            (goal !== null ? ` (mục tiêu ${formatVnd(goal)}).` : "."),
          "Give đã gửi yêu cầu thanh toán cho người ủng hộ. Tiền được chuyển thẳng vào tài khoản nhận của dự án; hãy theo dõi các khoản đã nhận và giao quà như đã hứa.",
        ],
        link,
      }
    }
    return {
      subject: `${capitalize(quoted(p, "dự án"))} đã kết thúc và không đạt mục tiêu`,
      heading: "Dự án không đạt mục tiêu",
      paragraphs: [
        `${capitalize(quoted(p, "dự án"))} đã kết thúc` +
          (pledged !== null ? ` với tổng cam kết ${formatVnd(pledged)}` : "") +
          (goal !== null ? `, chưa đạt mục tiêu ${formatVnd(goal)}.` : ", chưa đạt mục tiêu."),
        "Các cam kết đã được hủy, người ủng hộ không phải trả tiền.",
      ],
      link,
    }
  }
  let summary = `${capitalize(quoted(p, "chiến dịch"))} đã kết thúc`
  if (raised !== null) {
    summary += ` và gây quỹ được ${formatVnd(raised)}`
    if (supporters) summary += ` từ ${supporters} người ủng hộ`
    if (goal !== null) summary += ` (mục tiêu ${formatVnd(goal)})`
  }
  return {
    subject: `${capitalize(quoted(p, "chiến dịch"))} đã kết thúc`,
    heading: "Chiến dịch đã kết thúc",
    paragraphs: [
      `${summary}.`,
      "Hãy tiếp tục giải trình các khoản chi để người ủng hộ thấy tiền đã được dùng vào việc gì.",
    ],
    link,
  }
}

function capitalize(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

const PLAN_PERIOD = /^\d{4}-\d{2}-01$/
const PLAN_FOOTER = "Bạn nhận email này vì bạn đã đăng ký ủng hộ hằng tháng trên Give."

function planMonth(payload: OutboxEmail["payload"]): string | null {
  const period = text(payload, "plan_period")
  return period && PLAN_PERIOD.test(period) ? periodLabel(period) : null
}

/** plan_reminder (first: the donation issued at sign-up) and plan_followup. */
function planReminder(email: OutboxEmail): Content {
  const p = email.payload
  const followup = email.kind === "plan_followup"
  const first = !followup && p?.first === true
  const month = planMonth(p)
  const monthly = amount(p, "amount")
  const due = amount(p, "intended_amount") ?? monthly
  const rawCode = email.reference_code ?? text(p, "reference_code")
  const code = rawCode && DONATION_CODE.test(rawCode) ? rawCode : null
  const campaign = planCampaign(p)
  const thisMonth = month ? `tháng ${month}` : "tháng này"

  const intro = first
    ? `Cảm ơn bạn đã đăng ký ủng hộ ${monthly !== null ? `${formatVnd(monthly)} ` : ""}mỗi tháng cho ${campaign}.`
    : followup
      ? `Give nhắc lại mã ủng hộ ${thisMonth} cho ${campaign}.`
      : `Give đã tạo mã ủng hộ ${thisMonth} cho ${campaign}.`
  const codeLine = code
    ? `Mã ủng hộ ${thisMonth} của bạn là ${code}` +
      (due !== null ? `, số tiền ${formatVnd(due)}.` : ".") +
      ` Mã QR của ${thisMonth} có trên trang Ủng hộ của tôi.`
    : `Mã ủng hộ và mã QR của ${thisMonth} có trên trang Ủng hộ của tôi.`
  const subject = first
    ? `Bạn đã bắt đầu ủng hộ hằng tháng cho ${campaign}`
    : followup
      ? `Nhắc lại: mã ủng hộ ${thisMonth} cho ${campaign}`
      : `Mã ủng hộ ${thisMonth} cho ${campaign}`
  return {
    subject,
    heading: first
      ? "Kế hoạch ủng hộ hằng tháng đã bắt đầu"
      : followup
        ? `Nhắc lại mã ủng hộ ${thisMonth}`
        : `Mã ủng hộ ${thisMonth}`,
    paragraphs: [
      intro,
      codeLine,
      NEW_CODE_EVERY_MONTH,
      "Tiền đi thẳng vào tài khoản của người tổ chức; Give không giữ tiền và không tự trừ tiền của bạn. Ủng hộ tháng nào là do bạn chọn.",
      followup
        ? "Nếu bạn đã chuyển thì bỏ qua email này: Give có thể chưa kịp ghi nhận khoản chuyển."
        : "Nếu bạn đã chuyển thì bỏ qua email này.",
    ],
    link: { href: "/me/contributions", label: "Xem mã QR tháng này" },
    footer: PLAN_FOOTER,
  }
}

function planEnded(email: OutboxEmail): Content {
  const p = email.payload
  const path = campaignPath(p)
  return {
    subject: `Kế hoạch ủng hộ hằng tháng cho ${planCampaign(p)} đã dừng`,
    heading: "Kế hoạch ủng hộ hằng tháng đã dừng",
    paragraphs: planEndedParagraphs(p),
    link: path
      ? { href: path, label: "Xem trang chiến dịch" }
      : { href: "/me/contributions", label: "Xem các khoản ủng hộ của bạn" },
    footer: PLAN_FOOTER,
  }
}

/** Receiving-account swap notice for active monthly plan donors (DOS/Give#291). */
function planAccountSwapped(email: OutboxEmail): Content {
  const p = email.payload
  const campaign = planCampaign(p)
  const path = campaignPath(p)
  const date = swapDateLabel(p)
  const newAccountLine = swappedNewAccountLine(p, "Bạn có thể xem thông tin tài khoản nhận mới trên trang chiến dịch.")
  const oldTarget = swappedOldAccountTarget(p, "chiến dịch")

  return {
    subject: `Tài khoản nhận của ${campaign} đã thay đổi`,
    heading: "Tài khoản nhận của chiến dịch đã thay đổi",
    paragraphs: [
      date
        ? `Ngày ${date}, Give đã duyệt thay đổi tài khoản nhận cho ${campaign}.`
        : `Give đã duyệt thay đổi tài khoản nhận cho ${campaign}.`,
      newAccountLine,
      "Email này chỉ để thông báo thay đổi tài khoản và không yêu cầu bạn chuyển tiền. Các lời nhắc ủng hộ hằng tháng tiếp theo của bạn sẽ tự động hiển thị mã QR cho tài khoản mới.",
      `Nếu bạn đã lưu mẫu chuyển tiền tới ${oldTarget} trong app ngân hàng, hãy xóa mẫu đó: tiền chuyển vào tài khoản cũ sau ngày đổi sẽ không còn được ghi nhận cho chiến dịch này.`,
      "Tiền đi thẳng vào tài khoản của người tổ chức; Give không giữ tiền và không tự trừ tiền của bạn.",
    ],
    link: path
      ? { href: path, label: "Xem trang chiến dịch" }
      : { href: "/me/contributions", label: "Xem các khoản ủng hộ của bạn" },
    footer: PLAN_FOOTER,
  }
}

/** Receiving-account swap notice for backers with pledges still awaiting payment (DOS/Give#92). */
function pledgeAccountSwapped(email: OutboxEmail): Content {
  const p = email.payload
  const project = quoted(p, "dự án")
  const date = swapDateLabel(p)
  const rawCode = email.reference_code ?? text(p, "reference_code")
  const code = rawCode && DONATION_CODE.test(rawCode) ? rawCode : null
  const intended = amount(p, "intended_amount")
  const received = amount(p, "received_amount") ?? 0
  const refunded = amount(p, "refunded_amount") ?? 0
  const due =
    amount(p, "amount_due") ?? (intended !== null ? Math.max(0, intended - Math.max(0, received - refunded)) : null)
  const rawDueAt = text(p, "payment_due_at")
  const dueAt = rawDueAt && !Number.isNaN(Date.parse(rawDueAt)) ? formatDateTime(rawDueAt) : null
  const publicNote = text(p, "public_note")
  const newAccountLine = swappedNewAccountLine(
    p,
    "Bạn có thể xem thông tin tài khoản nhận mới và mã VietQR trên trang cam kết."
  )
  const oldTarget = swappedOldAccountTarget(p, "dự án")

  const paymentLine =
    `Hãy thanh toán${due ? ` ${formatVnd(due)}` : ""} cho cam kết của bạn${dueAt ? ` trước ${dueAt}` : ""} vào tài khoản nhận mới` +
    (code ? ` (mã chuyển khoản giữ nguyên: ${code}).` : ".") +
    " Mở trang cam kết để lấy số tài khoản đầy đủ và mã VietQR mới."

  const paragraphs = [
    date
      ? `Ngày ${date}, Give đã duyệt thay đổi tài khoản nhận tiền cho ${project}.`
      : `Give đã duyệt thay đổi tài khoản nhận tiền cho ${project}.`,
    newAccountLine,
    ...(publicNote ? [`Ghi chú công khai: ${publicNote}`] : []),
    paymentLine,
    `Đừng chuyển tiền vào ${oldTarget}: tiền chuyển vào tài khoản cũ sau ngày đổi sẽ không còn được ghi nhận cho cam kết của bạn.`,
    "Tiền đi thẳng vào tài khoản của người tổ chức; Give không giữ tiền. Nếu bạn đã chuyển khoản trước khi đổi tài khoản, đừng chuyển lại: Give vẫn ghi nhận theo thời điểm ngân hàng hạch toán.",
  ]

  return {
    subject: `Tài khoản nhận thanh toán của ${project} đã thay đổi`,
    heading: "Tài khoản nhận thanh toán đã thay đổi",
    paragraphs,
    link: code
      ? { href: `/me/pledges/${code}`, label: "Xem thông tin thanh toán mới" }
      : { href: "/me/contributions", label: "Xem các khoản ủng hộ của bạn" },
  }
}

function content(email: OutboxEmail): Content {
  const p = email.payload
  switch (email.kind) {
    case "donation_received":
      return donationReceived(email)
    case "pledge_payment_due":
    case "pledge_payment_reminder":
    case "pledge_lapsed":
      return pledgeEmail(email)
    case "campaign_approved": {
      const noun = isBack(p) ? "dự án" : "chiến dịch"
      return {
        subject: `${capitalize(quoted(p, noun))} đã được duyệt`,
        heading: `${capitalize(noun)} đã được duyệt`,
        paragraphs: [
          `Đội ngũ Give đã duyệt ${quoted(p, noun)}. Give mở ${noun} công khai vào thời điểm bắt đầu bạn đã đặt, hoặc trong vài phút nếu bạn không đặt.`,
        ],
        link: { href: organizerPath(p), label: "Mở trang quản lý" },
      }
    }
    case "campaign_changes_requested": {
      const noun = isBack(p) ? "dự án" : "chiến dịch"
      // The title has not passed review yet (that is what this email is
      // about), so it stays out of the subject Give signs.
      return {
        subject: `${capitalize(noun)} của bạn cần chỉnh sửa trước khi được duyệt`,
        heading: "Cần chỉnh sửa trước khi duyệt",
        paragraphs: [
          `Người kiểm duyệt của Give đã yêu cầu chỉnh sửa ${quoted(p, noun)}. Xem ghi chú của người kiểm duyệt, sửa ${noun} rồi gửi duyệt lại.`,
        ],
        link: { href: organizerPath(p), label: "Xem ghi chú và chỉnh sửa" },
      }
    }
    case "campaign_suspended": {
      const noun = isBack(p) ? "dự án" : "chiến dịch"
      return {
        subject: `${capitalize(quoted(p, noun))} đang bị tạm dừng`,
        heading: `${capitalize(noun)} đang bị tạm dừng`,
        paragraphs: [
          `Give đã tạm dừng ${quoted(p, noun)}. Đăng nhập Give để xem chi tiết và các bước tiếp theo.`,
          `Nếu cần trao đổi, hãy gửi email tới ${GIVE_CONTACT_EMAIL}.`,
        ],
        link: { href: organizerPath(p), label: "Mở trang quản lý" },
      }
    }
    case "campaign_ended":
      return campaignEnded(email)
    case "plan_reminder":
    case "plan_followup":
      return planReminder(email)
    case "plan_ended":
      return planEnded(email)
    case "plan_account_swapped":
      return planAccountSwapped(email)
    case "pledge_account_swapped":
      return pledgeAccountSwapped(email)
    default:
      throw new EmailRenderError(`unknown_kind:${String(email.kind).slice(0, 40)}`)
  }
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c])
}

/** Removes characters a mail header must not carry (CR, LF and other controls). */
function headerSafe(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim()
}

function absolute(origin: string, path: string): string {
  return new URL(path, origin).toString()
}

/** The page a person opens from the email body; it asks before unsubscribing. */
export function unsubscribePath(token: string): string {
  return `/email/unsubscribe?t=${encodeURIComponent(token)}`
}

/** The endpoint mail clients POST to for one-click unsubscribe (RFC 8058). */
export function oneClickUnsubscribePath(token: string): string {
  return `/api/email/unsubscribe?t=${encodeURIComponent(token)}`
}

/** A signed stop token as server/plans/stop-link makes it: `<64 hex>.<22 base64url>`. */
const SIGNED_STOP_TOKEN = /^[0-9a-f]{64}\.[A-Za-z0-9_-]{22}$/

/**
 * Subject, text and HTML of one outbox row. `origin` is the site origin the
 * links point to (https://give.vn in Production). A plan reminder needs
 * `options.signedStopToken`; without a well-formed one it is refused
 * (stop_token_missing), so no reminder goes out without its stop link.
 */
export function renderEmail(email: OutboxEmail, origin: string, options: RenderOptions = {}): RenderedEmail {
  if (!isEmailKind(email.kind)) throw new EmailRenderError(`unknown_kind:${String(email.kind).slice(0, 40)}`)
  let stopUrl: string | null = null
  let stopOneClickUrl: string | null = null
  if (carriesStopLink(email.kind)) {
    const signed = options.signedStopToken
    if (!signed || !SIGNED_STOP_TOKEN.test(signed)) throw new EmailRenderError("stop_token_missing")
    stopUrl = absolute(origin, planStopPath(signed))
    stopOneClickUrl = absolute(origin, planStopOneClickPath(signed))
  }
  const c = content(email)
  const link = c.link ? { href: absolute(origin, c.link.href), label: c.link.label } : null
  const unsubscribeUrl =
    email.category === "notification" && email.unsubscribe_token && isUuid(email.unsubscribe_token)
      ? absolute(origin, unsubscribePath(email.unsubscribe_token))
      : null
  if (email.category === "notification" && !unsubscribeUrl) throw new EmailRenderError("unsubscribe_token_missing")

  const footer =
    c.footer ??
    (email.category === "notification"
      ? "Bạn nhận email này vì bạn tổ chức một chiến dịch trên Give."
      : "Email giao dịch gửi tự động từ Give.")
  const help = `Cần hỗ trợ: ${GIVE_CONTACT_EMAIL}.`

  const unsubscribePrompt =
    email.kind === "campaign_ended"
      ? "Không muốn nhận email tổng kết như thế này?"
      : "Không muốn nhận các email thông báo như thế này?"

  const textParts = [c.heading, "", ...c.paragraphs.flatMap((p) => [p, ""])]
  if (link) textParts.push(`${link.label}: ${link.href}`, "")
  if (c.note) textParts.push(c.note, "")
  textParts.push("--", `${footer} ${help}`)
  if (unsubscribeUrl) textParts.push(`${unsubscribePrompt} Hủy đăng ký: ${unsubscribeUrl}`)
  if (stopUrl) textParts.push(`Không muốn nhận lời nhắc nữa? Dừng ủng hộ hằng tháng: ${stopUrl}`)

  const p = (body: string, style = "margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937") =>
    `<p style="${style}">${body}</p>`
  const html = [
    "<!DOCTYPE html>",
    '<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(c.subject)}</title></head>`,
    '<body style="margin:0;padding:0;background:#f5f5f4">',
    '<div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:Arial,Helvetica,sans-serif">',
    '<p style="margin:0 0 24px;font-size:20px;font-weight:700;color:#111827">Give</p>',
    '<div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;padding:24px">',
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:28px;color:#111827">${escapeHtml(c.heading)}</h1>`,
    ...c.paragraphs.map((body) => p(escapeHtml(body))),
    link
      ? p(
          `<a href="${escapeHtml(link.href)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-weight:700">${escapeHtml(link.label)}</a>`,
          "margin:24px 0 16px"
        )
      : "",
    c.note ? p(escapeHtml(c.note), "margin:0 0 16px;font-size:14px;line-height:20px;color:#57534e") : "",
    "</div>",
    p(`${escapeHtml(footer)} ${escapeHtml(help)}`, "margin:16px 0 0;font-size:13px;line-height:20px;color:#57534e"),
    unsubscribeUrl
      ? p(
          `${escapeHtml(unsubscribePrompt)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#57534e">Hủy đăng ký</a>.`,
          "margin:8px 0 0;font-size:13px;line-height:20px;color:#57534e"
        )
      : "",
    stopUrl
      ? p(
          `Không muốn nhận lời nhắc nữa? <a href="${escapeHtml(stopUrl)}" style="color:#57534e">Dừng ủng hộ hằng tháng</a>.`,
          "margin:8px 0 0;font-size:13px;line-height:20px;color:#57534e"
        )
      : "",
    "</div></body></html>",
  ].join("")

  // A plan reminder's one-click target stops the plan (RFC 8058, the same
  // signed token as the link in the body).
  const oneClickUnsubscribeUrl =
    stopOneClickUrl ??
    (unsubscribeUrl && email.unsubscribe_token
      ? absolute(origin, oneClickUnsubscribePath(email.unsubscribe_token))
      : null)
  return {
    subject: headerSafe(c.subject).slice(0, 200),
    text: textParts.join("\n"),
    html,
    unsubscribeUrl,
    oneClickUnsubscribeUrl,
  }
}
