import { z } from "zod"

import { formatVnd, parseVnd } from "./format"

/**
 * Monthly donations, plan A (DOS/Give#276, design section 4.3.4): a signed-in
 * donor's intention to give an amount every month to one give campaign that
 * has an end date. Each month Give issues an ordinary donation with its own
 * code and VietQR and reminds the donor; nothing is ever charged, and a month
 * without a transfer is not a debt (D93 Art. 4.3), so no copy here says
 * "overdue" or "owed". The DDL and functions live in DOS-Me
 * `supabase/migrations/20261125120000_give_donation_plans.sql`; this file
 * holds what both the server and the browser need.
 */

/** give.plan_min_amount(): the platform's technical floor, not the campaign's min_contribution. */
export const PLAN_MIN_AMOUNT = 10_000
/** contributions.intended_amount allows at most 13 digits. */
export const PLAN_MAX_AMOUNT = 9_999_999_999_999

export type PlanStatus = "active" | "ended"
export type PlanEndedReason =
  "donor_cancelled" | "campaign_closed" | "campaign_cancelled" | "organizer_disabled" | "donor_deleted"

/** Why a plan stopped, as the donor reads it. */
export const PLAN_ENDED_REASON_LABELS: Record<PlanEndedReason, string> = {
  donor_cancelled: "Bạn đã dừng kế hoạch",
  campaign_closed: "Chiến dịch đã kết thúc nhận ủng hộ",
  campaign_cancelled: "Chiến dịch đã bị hủy",
  organizer_disabled: "Người tổ chức đã tắt ủng hộ hằng tháng",
  donor_deleted: "Tài khoản đã bị xóa",
}

export function planEndedReasonLabel(reason: string | null | undefined): string {
  return (reason && PLAN_ENDED_REASON_LABELS[reason as PlanEndedReason]) || "Kế hoạch đã dừng"
}

/** "Ngày 5 hằng tháng". */
export function planDayLabel(day: number): string {
  return `Ngày ${day} hằng tháng`
}

/** "200.000 ₫ mỗi tháng". */
export function planAmountLabel(amount: number): string {
  return `${formatVnd(amount)} mỗi tháng`
}

/** "11/2026" for a plan period (the first day of a month, YYYY-MM-DD). */
export function periodLabel(period: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(period)
  return match ? `${match[2]}/${match[1]}` : period
}

/** The first day of the current month in Vietnam time (UTC+7), as YYYY-MM-DD. */
export function vnMonthStart(now = new Date()): string {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}-01`
}

/** The first moment after a plan period's month ends, in Vietnam time (UTC+7, no DST). */
export function periodEnd(period: string): Date | null {
  const match = /^(\d{4})-(\d{2})-01$/.exec(period)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  // Midnight of the next month's first day in Vietnam is 17:00 UTC the day before.
  return new Date(Date.UTC(year, month, 1) - 7 * 60 * 60 * 1000)
}

export interface PlanPayableInput {
  status: string
  plan_period: string | null
  /** usable_account: false when the campaign has no account the money can reach (unknown when absent). */
  campaign: { status: string; ends_at: string | null; usable_account?: boolean }
}

/**
 * Whether a plan donation's QR shows now (give.plan_donation_payable): still
 * awaiting transfer, the campaign live, before its end and with a usable
 * account, and still inside the donation's month. Computed at display time,
 * never stored. The account is checked only when the caller knows it
 * (`usable_account`); the donation page shows a QR only with an account.
 */
export function planDonationPayable(donation: PlanPayableInput, now = new Date()): boolean {
  if (donation.status !== "awaiting_transfer" || !donation.plan_period) return false
  if (donation.campaign.status !== "live" || !donation.campaign.ends_at) return false
  if (donation.campaign.usable_account === false) return false
  if (new Date(donation.campaign.ends_at) <= now) return false
  const end = periodEnd(donation.plan_period)
  return end !== null && now < end
}

/** When a payable plan donation's QR stops showing: the end of its month or the campaign's end, whichever is first. */
export function planQrUntil(plan_period: string, endsAt: string | null): Date | null {
  const end = periodEnd(plan_period)
  if (!end) return null
  if (!endsAt) return end
  const campaignEnd = new Date(endsAt)
  return campaignEnd < end ? campaignEnd : end
}

const amountField = z.string().transform((value, ctx) => {
  const parsed = parseVnd(value)
  if (parsed === null || parsed > PLAN_MAX_AMOUNT) {
    ctx.addIssue({ code: "custom", message: "Số tiền không hợp lệ" })
    return z.NEVER
  }
  if (parsed < PLAN_MIN_AMOUNT) {
    ctx.addIssue({ code: "custom", message: `Số tiền mỗi tháng tối thiểu ${formatVnd(PLAN_MIN_AMOUNT)}` })
    return z.NEVER
  }
  return parsed
})

const dayField = z.string().transform((value, ctx) => {
  const day = /^\d{1,2}$/.test(value.trim()) ? Number(value.trim()) : NaN
  if (!Number.isInteger(day) || day < 1 || day > 28) {
    ctx.addIssue({ code: "custom", message: "Chọn một ngày từ 1 đến 28" })
    return z.NEVER
  }
  return day
})

/** The sign-up form (signed-in donors only). */
export const planSignupSchema = z
  .object({
    amount: amountField,
    day_of_month: dayField,
    anonymous: z.string().transform((v) => v === "on"),
    public_name: z.string().trim().max(80, "Tên hiển thị tối đa 80 ký tự"),
    message: z
      .string()
      .trim()
      .max(500, "Lời nhắn tối đa 500 ký tự")
      .transform((v) => (v === "" ? null : v)),
    consent: z.string().refine((v) => v === "on", {
      message: "Hãy đồng ý nhận lời nhắc hằng tháng để Give gửi mã ủng hộ mỗi tháng",
    }),
  })
  .transform((v) => ({ ...v, public_name: v.anonymous || v.public_name === "" ? null : v.public_name }))
  .refine((v) => v.anonymous || v.public_name !== null, {
    message: "Nhập tên hiển thị, hoặc chọn ủng hộ ẩn danh",
    path: ["public_name"],
  })

export type PlanSignupInput = z.infer<typeof planSignupSchema>

/** Changing an active plan: the amount and the day, from next month on. */
export const planUpdateSchema = z.object({ amount: amountField, day_of_month: dayField })

/** A plan donation's period label and the "new code every month" rule, shown wherever a plan donation is. */
export const NEW_CODE_EVERY_MONTH =
  "Mỗi tháng Give tạo một mã ủng hộ mới. Đừng dùng lại mã hay mẫu chuyển tiền của tháng trước: tiền chuyển bằng mã cũ được tính cho tháng cũ."

/**
 * The anonymity warning of section 2.4, for a monthly plan: Give hides the
 * name, but a transparent account's public bank statement shows the sender
 * every month.
 */
export const PLAN_ANONYMITY_WARNING =
  "Give sẽ không hiện tên bạn trên Give. Nhưng nếu tài khoản nhận là tài khoản minh bạch, trang sao kê công khai của ngân hàng vẫn hiện tên người chuyển, và với ủng hộ hằng tháng là mỗi tháng một lần."

/** Stop links in reminder emails (signed token, see server/plans/stop-link). */
export const STOP_TOKEN_PARAM = "t"
export function planStopPath(signedToken: string): string {
  return `/plans/stop?${STOP_TOKEN_PARAM}=${encodeURIComponent(signedToken)}`
}
export function planStopOneClickPath(signedToken: string): string {
  return `/api/plans/stop?${STOP_TOKEN_PARAM}=${encodeURIComponent(signedToken)}`
}
