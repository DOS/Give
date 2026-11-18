/**
 * Text helpers for reading the cells of a bank statement spreadsheet. Pure
 * functions, no I/O.
 */

/**
 * A label as it is compared: diacritics dropped, "đ" -> "d", lower case,
 * whitespace collapsed, a trailing colon and a "(VND)" unit removed.
 * "Số dư đầu kỳ (VND):" -> "so du dau ky".
 */
export function label(text: string): string {
  const folded = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\(\s*vn[dđ]\s*\)/g, "")
  // Trailing spaces and colons, stripped by hand: /[\s:]+$/ is quadratic on
  // a long run of colons that does not end the string.
  let end = folded.length
  while (end > 0 && (folded[end - 1] === " " || folded[end - 1] === ":")) end--
  return folded.slice(0, end).trim()
}

/**
 * Whole VND from a cell: a number, or digits with "." or "," as thousands
 * separators ("1.500.000", "1,500,000"), optionally followed by zero
 * decimals ("1,500,000.00"). VND has no minor unit, so a non-zero fraction
 * is refused rather than rounded. Null for an empty cell; throws on anything
 * else. A leading "-" is kept (balances can be negative on overdraft).
 */
export function vnd(cell: string | number | null): bigint | null {
  if (cell === null) return null
  if (typeof cell === "number") {
    if (!Number.isSafeInteger(cell)) throw new Error("amount is not whole VND")
    return BigInt(cell)
  }
  const text = cell.replace(/\s+/g, "")
  if (text === "" || text === "-") return null
  const match = /^(-?)(\d{1,3}(?:([.,])\d{3})?(?:\3\d{3})*|\d+)(?:[.,]0{1,2})?$/.exec(text)
  if (!match) throw new Error("amount is not whole VND")
  return BigInt(`${match[1]}${match[2].replace(/[.,]/g, "")}`)
}

/**
 * Whole VND from a spreadsheet number cell, as the file stores the number:
 * plain digits with an optional fraction and exponent ("1500000",
 * "500.000", "1.05E7"). Never read with thousands separators, since a
 * number cell has none. Throws unless the value is a whole number.
 */
export function wholeNumber(text: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(text.trim())
  if (!match) throw new Error("not a number")
  const [, sign, whole, fraction = "", exponent = "0"] = match
  let digits = whole + fraction
  let point = whole.length + Number(exponent)
  if (point < 0) {
    digits = "0".repeat(-point) + digits
    point = 0
  }
  if (point > 30) throw new Error("number too large")
  const integer = digits.slice(0, point).padEnd(point, "0") || "0"
  if (/[1-9]/.test(digits.slice(point))) throw new Error("amount is not whole VND")
  const value = BigInt(integer)
  return sign === "-" ? -value : value
}

export interface LocalDate {
  /** "YYYY-MM-DD", Asia/Ho_Chi_Minh. */
  day: string
  /** "HH:MM:SS", or null when the cell has no time of day. */
  time: string | null
}

const DAY_FIRST = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function checked(y: number, m: number, d: number, h?: number, mi?: number, s?: number): LocalDate {
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new Error("not a calendar date")
  }
  if (h === undefined) return { day: `${y}-${pad(m)}-${pad(d)}`, time: null }
  if (h > 23 || (mi ?? 0) > 59 || (s ?? 0) > 59) throw new Error("not a time of day")
  return { day: `${y}-${pad(m)}-${pad(d)}`, time: `${pad(h)}:${pad(mi ?? 0)}:${pad(s ?? 0)}` }
}

/**
 * A date written day first, as Vietnamese banks do: "17/11/2026",
 * "17/11/2026 08:05", "17/11/2026 08:05:09", or with a two-digit year
 * ("17-11-26", read as 2026: statements are never older than 2000). Never
 * read month first: "03/04/2026" is 3 April.
 */
export function dayFirstDate(text: string): LocalDate {
  const match = DAY_FIRST.exec(text.trim())
  if (!match) throw new Error("not a day-first date")
  const [, d, , m, yy, h, mi, s] = match
  const y = yy.length === 2 ? 2000 + +yy : +yy
  return h === undefined ? checked(y, +m, +d) : checked(y, +m, +d, +h, +mi, s === undefined ? undefined : +s)
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/

/**
 * A bank date: day first (see `dayFirstDate`), or year first in ISO form
 * ("2025-09-01", "2025-09-01 08:05:09"), which cannot be misread either.
 */
export function bankDate(text: string): LocalDate {
  const match = ISO.exec(text.trim())
  if (!match) return dayFirstDate(text)
  const [, y, m, d, h, mi, s] = match
  return h === undefined ? checked(+y, +m, +d) : checked(+y, +m, +d, +h, +mi, s === undefined ? undefined : +s)
}

/** The instant of a local Asia/Ho_Chi_Minh date (UTC+7 all year), at midnight when it has no time. */
export function vnInstant(date: LocalDate): Date {
  return new Date(`${date.day}T${date.time ?? "00:00:00"}+07:00`)
}
