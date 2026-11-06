import { z } from "zod"

import { parseVnd } from "./format"

/**
 * Donations (docs/Give-Technical-Design.md sections 2.3 and 4.1). The DDL and
 * the money functions live in DOS-Me
 * `supabase/migrations/20261101100000_give_money_core_accounts.sql`; this file
 * holds what both the server and the browser need.
 */

export type DonationStatus = "awaiting_transfer" | "received" | "expired"

export const DONATION_STATUS_LABELS: Record<DonationStatus, string> = {
  awaiting_transfer: "Chờ chuyển khoản",
  received: "Đã nhận",
  expired: "Mã QR đã hết hạn",
}

export function donationStatusLabel(status: string): string {
  return DONATION_STATUS_LABELS[status as DonationStatus] ?? status
}

/** What GET /api/contributions/status returns. */
export interface ContributionStatus {
  status: string
  received_amount: number
}

/** The VietQR code is shown for 24 hours (section 2.3); money that arrives later still matches. */
export const QR_DISPLAY_MS = 24 * 60 * 60 * 1000
/** The waiting page asks for the status every 5 seconds for up to 30 minutes (section 4.1 step 9). */
export const POLL_INTERVAL_MS = 5_000
export const POLL_WINDOW_MS = 30 * 60 * 1000

/** Header that carries a guest's status token to the status route, so it never sits in a URL. */
export const STATUS_TOKEN_HEADER = "x-give-status-token"

/** create_donation returns the guest status token as 64 lowercase hex characters (32 random bytes). */
export function isStatusToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

export function qrExpiresAt(createdAt: string): Date {
  return new Date(new Date(createdAt).getTime() + QR_DISPLAY_MS)
}

/** contributions.intended_amount allows at most 13 digits, as does the VietQR amount field. */
export const MAX_DONATION = 9_999_999_999_999

export const donationSchema = z
  .object({
    amount: z.string().transform((value, ctx) => {
      const parsed = parseVnd(value)
      if (parsed === null || parsed > MAX_DONATION) {
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
  // An anonymous donor's name is not needed, so none is stored.
  .transform((v) => ({ ...v, public_name: v.anonymous || v.public_name === "" ? null : v.public_name }))
  .refine((v) => v.anonymous || v.public_name !== null, {
    message: "Nhập tên hiển thị, hoặc chọn ủng hộ ẩn danh",
    path: ["public_name"],
  })

export type DonationInput = z.infer<typeof donationSchema>
