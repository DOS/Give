import { donationTrackingPath } from "@/lib/contributions"
import { GIVE_CONTACT_EMAIL } from "@/lib/contact"
import { formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { describeNotice } from "@/lib/notices"
import { SLUG_PATTERN } from "@/lib/slug"

/**
 * Vietnamese emails of the outbox (DOS/Give#254). Plain HTML with inline
 * styles and a text part; no images, no tracking pixels, no remote content.
 * Everything that comes from a payload (organizer-written titles above all)
 * is escaped. Pledge emails reuse the in-app notice wording (lib/notices).
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
  const received = amount(p, "received_amount")
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
      return {
        subject: `${capitalize(quoted(p, noun))} cần chỉnh sửa trước khi được duyệt`,
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

/**
 * Subject, text and HTML of one outbox row. `origin` is the site origin the
 * links point to (https://give.vn in Production).
 */
export function renderEmail(email: OutboxEmail, origin: string): RenderedEmail {
  if (!isEmailKind(email.kind)) throw new EmailRenderError(`unknown_kind:${String(email.kind).slice(0, 40)}`)
  const c = content(email)
  const link = c.link ? { href: absolute(origin, c.link.href), label: c.link.label } : null
  const unsubscribeUrl =
    email.category === "notification" && email.unsubscribe_token && isUuid(email.unsubscribe_token)
      ? absolute(origin, unsubscribePath(email.unsubscribe_token))
      : null
  if (email.category === "notification" && !unsubscribeUrl) throw new EmailRenderError("unsubscribe_token_missing")

  const footer =
    email.category === "notification"
      ? "Bạn nhận email này vì bạn tổ chức một chiến dịch trên Give."
      : "Email giao dịch gửi tự động từ Give."
  const help = `Cần hỗ trợ: ${GIVE_CONTACT_EMAIL}.`

  const textParts = [c.heading, "", ...c.paragraphs.flatMap((p) => [p, ""])]
  if (link) textParts.push(`${link.label}: ${link.href}`, "")
  if (c.note) textParts.push(c.note, "")
  textParts.push("--", `${footer} ${help}`)
  if (unsubscribeUrl) textParts.push(`Không muốn nhận email tổng kết như thế này? Hủy đăng ký: ${unsubscribeUrl}`)

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
          `Không muốn nhận email tổng kết như thế này? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#57534e">Hủy đăng ký</a>.`,
          "margin:8px 0 0;font-size:13px;line-height:20px;color:#57534e"
        )
      : "",
    "</div></body></html>",
  ].join("")

  const oneClickUnsubscribeUrl =
    unsubscribeUrl && email.unsubscribe_token
      ? absolute(origin, oneClickUnsubscribePath(email.unsubscribe_token))
      : null
  return {
    subject: headerSafe(c.subject).slice(0, 200),
    text: textParts.join("\n"),
    html,
    unsubscribeUrl,
    oneClickUnsubscribeUrl,
  }
}
