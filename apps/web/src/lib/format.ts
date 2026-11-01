const vnd = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
})

/** Formats an amount in đồng, e.g. 1500000 -> "1.500.000 ₫". */
export function formatVnd(amount: number | bigint | string): string {
  return vnd.format(Number(amount))
}

/**
 * Parses what a person types into a money field ("1.500.000", "1,500,000",
 * "1 500 000", "1500000 đ") into whole đồng. Separators must split groups of
 * exactly three digits, so a decimal such as "1,5" (triệu) is rejected rather
 * than read as 15. Returns null for anything that is not a positive whole
 * number.
 */
export function parseVnd(input: string): number | null {
  const text = input.trim().replace(/\s*[₫đĐ]$/, "")
  if (!/^\d+$/.test(text) && !/^\d{1,3}([.,\s]\d{3})+$/.test(text)) return null
  const value = Number(text.replace(/[.,\s]/g, ""))
  if (!Number.isSafeInteger(value) || value <= 0) return null
  return value
}

const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
})

export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFormat.format(new Date(iso)) : "—"
}

const dateTimeFormat = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
})

/** Date and time in Vietnam time, e.g. "09:05 01/11/2026". */
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : "—"
}

/** Whole days left until `iso`, never negative. */
export function daysLeft(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - now.getTime()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * The value a datetime-local input needs ("2026-11-01T09:00") for an ISO
 * time, shown in Vietnam time (UTC+7, no daylight saving). Inverse of the
 * form parser in validation.ts.
 */
export function toVietnamLocalInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return ""
  return new Date(ms + VIETNAM_OFFSET_MS).toISOString().slice(0, 16)
}

/** Percent of goal reached, rounded down and capped at 100. */
export function progressPercent(raised: number, goal: number): number {
  if (!(goal > 0) || !(raised > 0)) return 0
  return Math.min(100, Math.floor((raised / goal) * 100))
}
