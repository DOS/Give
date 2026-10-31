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
 * "1500000 đ") into whole đồng. Returns null for anything that is not a
 * positive whole number.
 */
export function parseVnd(input: string): number | null {
  const digits = input.replace(/[.,\s₫đĐ]/g, "")
  if (!/^[0-9]+$/.test(digits)) return null
  const value = Number(digits)
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

/** Whole days left until `iso`, never negative. */
export function daysLeft(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - now.getTime()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}
