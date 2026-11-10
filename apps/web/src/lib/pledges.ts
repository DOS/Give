import { z } from "zod"

import type { DbErrorLike } from "./errors"
import { giveErrorCode } from "./errors"
import { formatDateTime, formatVnd, parseVnd } from "./format"

/**
 * Pledges to back (reward, all-or-nothing) campaigns: docs/Give-Technical-Design.md
 * section 4.2. The DDL and the functions live in DOS-Me
 * `supabase/migrations/20261105150000_give_rewards.sql` (DOS/Give#30); this
 * file holds what both the server and the browser need.
 *
 * Lifecycle: pledged (open; change or cancel until ends_at) -> payment_due
 * when the campaign reaches its goal -> partially_paid / paid as transfers
 * are matched -> lapsed (nothing paid by payment_due_at) or refund_due (part
 * paid; the creator owes it back) -> refunded. A failed or cancelled
 * campaign cancels its open pledges.
 */

export type PledgeStatus =
  "pledged" | "payment_due" | "partially_paid" | "paid" | "cancelled" | "lapsed" | "refund_due" | "refunded"

export const PLEDGE_STATUS_LABELS: Record<PledgeStatus, string> = {
  pledged: "Đã cam kết",
  payment_due: "Chờ thanh toán",
  partially_paid: "Đã thanh toán một phần",
  paid: "Đã thanh toán",
  cancelled: "Đã hủy",
  lapsed: "Quá hạn thanh toán",
  refund_due: "Chờ hoàn tiền",
  refunded: "Đã hoàn tiền",
}

export function pledgeStatusLabel(status: string): string {
  return PLEDGE_STATUS_LABELS[status as PledgeStatus] ?? status
}

/** What a paid pledge received beyond its amount, which the creator owes back (give.public_campaigns counts it). */
export function overpaid(pledge: { status: string; intended_amount: number; received_amount: number }): number {
  return pledge.status === "paid" ? Math.max(0, pledge.received_amount - pledge.intended_amount) : 0
}

/** True once a pledge waiting for payment is past payment_due_at (the lapse job may not have run yet). */
export function paymentWindowClosed(
  pledge: { status: string; payment_due_at: string | null },
  now = new Date()
): boolean {
  return awaitsPayment(pledge.status) && !!pledge.payment_due_at && new Date(pledge.payment_due_at) <= now
}

/** Statuses that still wait for the backer's transfer (give.pledge_payment answers only for these). */
export function awaitsPayment(status: string): boolean {
  return status === "payment_due" || status === "partially_paid"
}

/**
 * What the payment page of a pledge waiting for payment shows:
 *   stopped      a moderator stopped the campaign's payment requests
 *                (DOS/Give#89): no transfer details, "do not transfer";
 *   closed       the deadline has passed (give.pledge_payment gives no row);
 *   unavailable  no payment details although the deadline has not passed
 *                (a stop committed meanwhile, say): reload later;
 *   nothing_due  nothing left to pay (net of refunds), so no QR for 0 đồng;
 *   no_account   the campaign has no usable account right now;
 *   qr           the VietQR code and the transfer details.
 * The stop wins over everything, so a page never shows an account while
 * payment requests are stopped, even if give.pledge_payment answered.
 */
export type PaymentView = "stopped" | "closed" | "unavailable" | "nothing_due" | "no_account" | "qr"

export function paymentView(
  stopped: boolean,
  windowClosed: boolean,
  payment: { amount_due: number; reference_code: string; account: unknown } | null,
  isCode: (code: string) => boolean
): PaymentView {
  if (stopped) return "stopped"
  if (!payment) return windowClosed ? "closed" : "unavailable"
  if (!(payment.amount_due > 0)) return "nothing_due"
  if (!payment.account || !isCode(payment.reference_code)) return "no_account"
  return "qr"
}

/**
 * One line about a pledge's money for the backer's list of contributions,
 * net of refunds when the balance (give.pledge_balances) is known; without it
 * the amounts that refunds could change are left out.
 */
export function pledgeListSummary(
  pledge: { status: string; intended_amount: number; received_amount: number; payment_due_at: string | null },
  balance: { amount_due: number; refund_owed_amount: number; payments_stopped: boolean } | null,
  now = new Date()
): string {
  switch (pledge.status) {
    case "payment_due":
    case "partially_paid":
      if (balance?.payments_stopped) return "Give đang tạm dừng yêu cầu thanh toán · đừng chuyển tiền"
      if (paymentWindowClosed(pledge, now))
        return `Đã quá hạn thanh toán · đã ghi nhận ${formatVnd(pledge.received_amount)}`
      return `${balance ? `Cần thanh toán ${formatVnd(balance.amount_due)}` : "Chờ thanh toán"}${
        pledge.payment_due_at ? ` trước ${formatDateTime(pledge.payment_due_at)}` : ""
      }`
    case "paid":
      return `Đã thanh toán ${formatVnd(pledge.received_amount)}`
    case "refund_due":
      return balance
        ? `Chờ người tạo dự án hoàn ${formatVnd(balance.refund_owed_amount)}`
        : "Chờ người tạo dự án hoàn tiền"
    default:
      return `Cam kết ${formatVnd(pledge.intended_amount)}`
  }
}

/** Whether the list offers "Thanh toán" for a pledge (still waiting, before the deadline, not stopped). */
export function offersPayment(
  pledge: { status: string; payment_due_at: string | null },
  balance: { payments_stopped: boolean } | null,
  now = new Date()
): boolean {
  return awaitsPayment(pledge.status) && !paymentWindowClosed(pledge, now) && !balance?.payments_stopped
}

// Delivery labels are shared with the creator's fulfillment page (DOS/Give#83).
export { FULFILLMENT_LABELS, fulfillmentLabel, type FulfillmentStatus } from "./fulfillment"

/** "Tháng 3/2027" for a tier's estimated_delivery (always the first day of a month). */
export function deliveryMonth(date: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(date ?? "")
  return match ? `Tháng ${Number(match[2])}/${match[1]}` : null
}

/**
 * A live back campaign inside its dates, as give.create_pledge checks it.
 * Pages use it for wording and to hide the form; the database decides.
 */
export function acceptsPledges(
  campaign: { type: string; status: string; starts_at: string | null; ends_at: string | null },
  now = new Date()
): boolean {
  return (
    campaign.type === "back" &&
    campaign.status === "live" &&
    (!campaign.starts_at || new Date(campaign.starts_at) <= now) &&
    !!campaign.ends_at &&
    new Date(campaign.ends_at) > now
  )
}

/** A reward tier as give.public_reward_tiers shows it. */
export interface PublicRewardTier {
  id: string
  campaign_id: string
  title: string
  description: string | null
  min_amount: number
  quantity_limit: number | null
  quantity_claimed: number
  /** NULL = unlimited. */
  quantity_remaining: number | null
  estimated_delivery: string | null
  requires_shipping: boolean
  shipping_note: string | null
  sort_order: number
}

export const PUBLIC_TIER_COLUMNS =
  "id, campaign_id, title, description, min_amount, quantity_limit, quantity_claimed, quantity_remaining, " +
  "estimated_delivery, requires_shipping, shipping_note, sort_order"

export function isSoldOut(tier: Pick<PublicRewardTier, "quantity_remaining">): boolean {
  return tier.quantity_remaining !== null && tier.quantity_remaining <= 0
}

/** The radio value of "no reward" in the pledge form. */
export const NO_REWARD = "none"

/** What a backer types for a tier that ships something (design P5: address only, no shipping fee). */
export interface ShippingAddress {
  recipient: string
  phone: string
  address: string
}

const PHONE = /^\+?[0-9][0-9 .-]{7,18}[0-9]$/

export const shippingAddressSchema = z.object({
  recipient: z.string().trim().min(2, "Nhập tên người nhận quà").max(80, "Tên người nhận tối đa 80 ký tự"),
  phone: z
    .string()
    .trim()
    .regex(PHONE, "Số điện thoại không hợp lệ")
    .refine((v) => v.replace(/\D/g, "").length >= 9 && v.replace(/\D/g, "").length <= 15, "Số điện thoại không hợp lệ"),
  address: z
    .string()
    .trim()
    .min(10, "Nhập địa chỉ nhận quà đầy đủ (số nhà, đường, phường/xã, tỉnh/thành)")
    .max(300, "Địa chỉ tối đa 300 ký tự"),
})

/** contributions.intended_amount allows at most 13 digits, as does the VietQR amount field. */
export const MAX_PLEDGE = 9_999_999_999_999

export const pledgeSchema = z
  .object({
    tier: z.string().refine((v) => v === NO_REWARD || /^[0-9a-f-]{36}$/i.test(v), "Hãy chọn một phần quà"),
    amount: z.string().transform((value, ctx) => {
      const parsed = parseVnd(value)
      if (parsed === null || parsed > MAX_PLEDGE) {
        ctx.addIssue({ code: "custom", message: "Số tiền không hợp lệ" })
        return z.NEVER
      }
      return parsed
    }),
    anonymous: z.string().transform((v) => v === "on"),
    public_name: z.string().trim().max(80, "Tên hiển thị tối đa 80 ký tự"),
    message: z
      .string()
      .trim()
      .max(500, "Lời nhắn tối đa 500 ký tự")
      .transform((v) => (v === "" ? null : v)),
  })
  .transform((v) => ({
    ...v,
    tier: v.tier === NO_REWARD ? null : v.tier.toLowerCase(),
    // An anonymous backer's name is not needed, so none is stored.
    public_name: v.anonymous || v.public_name === "" ? null : v.public_name,
  }))
  .refine((v) => v.anonymous || v.public_name !== null, {
    message: "Nhập tên hiển thị, hoặc chọn ủng hộ ẩn danh",
    path: ["public_name"],
  })

export type PledgeInput = z.infer<typeof pledgeSchema>

/** The shipping address of a stored pledge, if it has the shape the form writes. */
export function readShippingAddress(value: unknown): ShippingAddress | null {
  const parsed = shippingAddressSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Pledge errors of give.create_pledge, change_pledge and cancel_pledge, for dbErrorMessage overrides. */
export const PLEDGE_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: "Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.",
  GIVE_CAMPAIGN_NOT_FOUND: "Không tìm thấy dự án.",
  GIVE_CONTRIBUTION_TYPE_MISMATCH: "Chiến dịch này nhận ủng hộ trực tiếp, không nhận cam kết.",
  GIVE_CAMPAIGN_NOT_ACCEPTING: "Dự án hiện không nhận cam kết (chưa mở hoặc đã kết thúc).",
  GIVE_OWN_CAMPAIGN: "Bạn không thể ủng hộ dự án của chính mình.",
  GIVE_AMOUNT_BELOW_MINIMUM: "Số tiền thấp hơn mức tối thiểu của dự án hoặc của phần quà.",
  GIVE_AMOUNT_INVALID: "Số tiền không hợp lệ.",
  GIVE_REWARD_TIER_INVALID: "Phần quà không thuộc dự án này.",
  GIVE_REWARD_TIER_UNAVAILABLE: "Phần quà này đã ngừng nhận ủng hộ. Hãy chọn phần quà khác.",
  GIVE_REWARD_TIER_SOLD_OUT: "Phần quà này vừa hết suất. Hãy chọn phần quà khác.",
  GIVE_SHIPPING_ADDRESS_REQUIRED: "Phần quà này cần địa chỉ nhận quà.",
  GIVE_PLEDGE_EXISTS: "Bạn đã có một cam kết cho dự án này. Hãy tải lại trang để đổi cam kết đó.",
  GIVE_PLEDGE_NOT_FOUND: "Không tìm thấy cam kết này.",
  GIVE_PLEDGE_NOT_CHANGEABLE: "Cam kết này không còn đổi được: dự án đã kết thúc hoặc cam kết đã được đổi hay hủy.",
  GIVE_PLEDGE_NOT_CANCELLABLE: "Cam kết này không còn hủy được: dự án đã kết thúc hoặc cam kết đã được đổi.",
  GIVE_CODE_GENERATION_FAILED: "Chưa tạo được mã cam kết. Hãy thử lại.",
}

/** A pledge RPC error worded for the backer, with the minimum or the wait time when the database gives one. */
export function pledgeErrorMessage(error: DbErrorLike | null | undefined): string | null {
  const code = giveErrorCode(error)
  if (code === "GIVE_AMOUNT_BELOW_MINIMUM") {
    const min = Number(/GIVE_AMOUNT_BELOW_MINIMUM: (\d+)/.exec(error?.message ?? "")?.[1])
    if (min > 0) return `Số tiền tối thiểu cho lựa chọn này là ${formatVnd(min)}.`
  }
  if (code === "GIVE_RATE_LIMITED") {
    const seconds = Number(/GIVE_RATE_LIMITED: (\d+)/.exec(error?.message ?? "")?.[1])
    const minutes = Math.max(1, Math.ceil((seconds > 0 ? seconds : 600) / 60))
    return `Bạn vừa tạo hoặc đổi cam kết nhiều lần trong thời gian ngắn. Hãy thử lại sau khoảng ${minutes} phút.`
  }
  return code && Object.hasOwn(PLEDGE_MESSAGES, code) ? PLEDGE_MESSAGES[code] : null
}

/** One of the signed-in user's contributions, as "Ủng hộ của tôi" lists them. */
export interface ListedContribution {
  id: string
  kind: string
  campaign_id: string
  status: string
  created_at: string
}

/**
 * Hides cancelled pledges that a newer pledge of the same backer on the same
 * campaign followed: those change_pledge replaced, and those the backer
 * cancelled before pledging again. The newest cancelled pledge of a campaign
 * (cancelled on its own, or by a failed campaign) stays listed. Expects
 * newest first.
 */
export function withoutReplacedPledges<T extends ListedContribution>(rows: readonly T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (row.kind !== "pledge") return true
    const replaced = row.status === "cancelled" && seen.has(row.campaign_id)
    seen.add(row.campaign_id)
    return !replaced
  })
}
