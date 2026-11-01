import { assertSupportedFormat, PARSER_NAME } from "@/server/statement-parsers/registry"
import type { ParsedStatement, StatementFormat } from "@/server/statement-parsers/types"

import { StatementImportError } from "./errors"

/**
 * Turns a parsed statement into the row format of give.stage_statement_import
 * (DOS-Me migration 20261101170000_give_statement_import). The checks mirror
 * the RPC's, so a file the RPC would refuse is refused here, before its
 * inbound event is recorded: a recorded event that can never be staged would
 * be retried by the reprocess cron forever. The database stays the
 * authority; it checks everything again.
 */

/** Rows per batch, as give.statement_import_batches.row_count allows. */
export const MAX_ROWS = 5000
const MAX_AMOUNT = BigInt("9999999999999") // 13 digits, bank_transactions.amount
const MAX_BALANCE = BigInt("999999999999999") // 15 digits, the RPC's balance_after pattern
const MAX_PROVIDER_ID = 200
const MAX_RAW_BYTES = 60000
// A parser that misreads a year must not record a row decades away.
const EARLIEST_BOOKING = Date.parse("2000-01-01T00:00:00+07:00")
const MAX_PERIOD_DAYS = 400
const DAY_MS = 24 * 60 * 60 * 1000
// Asia/Ho_Chi_Minh is UTC+7 all year (no daylight saving).
const VN_OFFSET_MS = 7 * 60 * 60 * 1000
const DATE = /^\d{4}-\d{2}-\d{2}$/
// Ids the database makes up for rows without one; a bank id may not look like them.
const MADE_UP_ID = /^stmt(row)?:/i

export interface StagedRow {
  /** ISO instant, or the local date "YYYY-MM-DD" when booked_date_only. */
  booked_at: string
  booked_date_only: boolean
  direction: "in" | "out"
  /** Whole VND as digits (bigint does not survive JSON). */
  amount: string
  description: string | null
  counterparty_name: string | null
  /** Already masked ("****" and the last four characters), as give.mask_account stores it. */
  counterparty_account: string | null
  balance_after: string | null
  provider_tx_id: string | null
  /** The parser's raw cells, with the counterparty account number masked wherever it appears. */
  raw: Record<string, unknown> | null
}

/** The arguments of give.stage_statement_import, apart from the account, actor and event. */
export interface StagedStatement {
  parser: string
  has_stable_row_id: boolean
  has_running_balance: boolean
  period_from: string | null
  period_to: string | null
  opening_balance: string | null
  closing_balance: string | null
  /** When the bank produced the file, or else when it was uploaded. */
  exported_at: string
  rows: StagedRow[]
}

/** The local (Asia/Ho_Chi_Minh) date of an instant. */
export function vnDay(instant: Date): string {
  return new Date(instant.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10)
}

/** Midnight Asia/Ho_Chi_Minh at the start of a local date, in epoch ms. */
function vnMidnight(day: string): number {
  return Date.parse(`${day}T00:00:00+07:00`)
}

function isDay(value: string): boolean {
  return DATE.test(value) && Number.isFinite(vnMidnight(value)) && vnDay(new Date(vnMidnight(value))) === value
}

/** give.mask_account: "****" and the last 1-4 letters or digits; null for a blank value. */
export function maskAccount(account: string | null | undefined): string | null {
  const trimmed = (account ?? "").trim()
  if (trimmed === "") return null
  return `****${/[0-9A-Za-z]{1,4}$/.exec(trimmed)?.[0] ?? ""}`
}

function optionalText(value: unknown, row: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") throw new StatementImportError("STATEMENT_ROW_INVALID", row)
  return value.trim() === "" ? null : value
}

function balance(value: bigint | null | undefined, row?: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "bigint" || value > MAX_BALANCE || value < -MAX_BALANCE) {
    throw new StatementImportError(row === undefined ? "STATEMENT_BALANCE_INVALID" : "STATEMENT_ROW_INVALID", row)
  }
  return value.toString()
}

/**
 * Bytes of a JSON value as Postgres prints jsonb (`value::text`), which the
 * size CHECKs measure: a space after every colon and comma. A number in
 * exponent form prints in full there, so it counts as its widest form.
 */
export function jsonbTextBytes(value: unknown): number {
  if (value === null || typeof value === "boolean") return String(value).length
  if (typeof value === "number") return /e/i.test(String(value)) ? 330 : String(value).length
  if (typeof value === "string") return Buffer.byteLength(JSON.stringify(value), "utf8")
  if (Array.isArray(value)) {
    return 2 + value.reduce<number>((sum, item) => sum + jsonbTextBytes(item), 0) + 2 * Math.max(0, value.length - 1)
  }
  const entries = Object.entries(value as Record<string, unknown>)
  return (
    2 +
    entries.reduce((sum, [key, item]) => sum + jsonbTextBytes(key) + 2 + jsonbTextBytes(item), 0) +
    2 * Math.max(0, entries.length - 1)
  )
}

/** Replaces every occurrence of the account number in the raw cells with its mask. */
function scrubAccount(value: unknown, account: string | null): unknown {
  const forms = account === null ? [] : [account.trim(), account.replace(/\s+/g, "")].filter((f) => f.length >= 5)
  if (forms.length === 0) return value
  const masked = maskAccount(account)!
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return forms.reduce((text, form) => text.split(form).join(masked), node)
    if (Array.isArray(node)) return node.map(walk)
    if (node !== null && typeof node === "object") {
      return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, walk(item)]))
    }
    return node
  }
  return walk(value)
}

function rawObject(value: unknown, account: string | null, row: number): Record<string, unknown> | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "object" || Array.isArray(value)) throw new StatementImportError("STATEMENT_ROW_INVALID", row)
  let copy: Record<string, unknown>
  try {
    copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  } catch {
    throw new StatementImportError("STATEMENT_ROW_INVALID", row)
  }
  copy = scrubAccount(copy, account) as Record<string, unknown>
  if (jsonbTextBytes(copy) > MAX_RAW_BYTES) throw new StatementImportError("STATEMENT_ROW_INVALID", row)
  return copy
}

function period(parsed: ParsedStatement, now: Date) {
  const from = parsed.periodFrom ?? null
  const to = parsed.periodTo ?? null
  const exportedAt = parsed.exportedAt ?? null
  if ((from !== null && !isDay(from)) || (to !== null && !isDay(to))) {
    throw new StatementImportError("STATEMENT_PERIOD_INVALID")
  }
  if (exportedAt !== null && !(exportedAt instanceof Date && Number.isFinite(exportedAt.getTime()))) {
    throw new StatementImportError("STATEMENT_PERIOD_INVALID")
  }
  const today = vnDay(now)
  if (
    (from !== null && to !== null && (from > to || (vnMidnight(to) - vnMidnight(from)) / DAY_MS > MAX_PERIOD_DAYS)) ||
    (to !== null && to > today) ||
    (exportedAt !== null && exportedAt.getTime() > now.getTime() + DAY_MS) ||
    (exportedAt !== null && to !== null && exportedAt.getTime() < vnMidnight(to))
  ) {
    throw new StatementImportError("STATEMENT_PERIOD_INVALID")
  }
  return { from, to, exportedAt }
}

/**
 * Validates a parsed statement against its format and the staging rules and
 * returns the RPC arguments. Throws StatementImportError (with the row number
 * when one row is at fault).
 */
export function normalizeStatement(
  format: StatementFormat,
  parsed: ParsedStatement,
  now = new Date()
): StagedStatement {
  if (!PARSER_NAME.test(format.name)) throw new StatementImportError("STATEMENT_PARSER_UNKNOWN")
  assertSupportedFormat(format)
  const stable = format.hasStableRowId
  const { from, to, exportedAt } = period(parsed, now)
  if (!stable && (from === null || to === null)) throw new StatementImportError("STATEMENT_PERIOD_REQUIRED")
  if (!Array.isArray(parsed.rows) || parsed.rows.length === 0 || parsed.rows.length > MAX_ROWS) {
    throw new StatementImportError("STATEMENT_ROWS_INVALID")
  }

  const latest = now.getTime() + DAY_MS
  let previousTimed: number | null = null
  let previousDateOnly = false
  let previousDay: string | null = null
  const rows = parsed.rows.map((tx, index): StagedRow => {
    const row = index + 1
    if (
      typeof tx !== "object" ||
      tx === null ||
      (tx.direction !== "in" && tx.direction !== "out") ||
      tx.asset !== "VND" ||
      typeof tx.amount !== "bigint" ||
      tx.amount <= BigInt(0) ||
      tx.amount > MAX_AMOUNT ||
      typeof tx.bookedDateOnly !== "boolean" ||
      !(tx.bookedAt instanceof Date) ||
      !Number.isFinite(tx.bookedAt.getTime())
    ) {
      throw new StatementImportError("STATEMENT_ROW_INVALID", row)
    }

    const providerId = typeof tx.providerTxId === "string" ? tx.providerTxId.trim() : ""
    if (tx.providerTxId !== null && typeof tx.providerTxId !== "string") {
      throw new StatementImportError("STATEMENT_ROW_INVALID", row)
    }
    if (stable !== (providerId !== "") || providerId.length > MAX_PROVIDER_ID || MADE_UP_ID.test(providerId)) {
      throw new StatementImportError("STATEMENT_ROW_INVALID", row)
    }

    const day = vnDay(tx.bookedAt)
    const booked = tx.bookedDateOnly ? vnMidnight(day) : tx.bookedAt.getTime()
    if (booked > latest || booked < EARLIEST_BOOKING) throw new StatementImportError("STATEMENT_ROW_INVALID", row)
    // Oldest first, as give.stage_statement_import checks it: days never go
    // back, and timed rows never go back in time (a date-only row, such as a
    // fee, may sit anywhere in its day).
    if (
      (previousDay !== null && day < previousDay) ||
      (previousTimed !== null && booked < previousTimed && !tx.bookedDateOnly && !previousDateOnly)
    ) {
      throw new StatementImportError("STATEMENT_ROWS_NOT_CHRONOLOGICAL", row)
    }
    if (!tx.bookedDateOnly) previousTimed = booked
    previousDateOnly = tx.bookedDateOnly
    previousDay = day
    if ((from !== null && day < from) || (to !== null && day > to)) {
      throw new StatementImportError("STATEMENT_ROW_OUTSIDE_PERIOD", row)
    }

    const account = optionalText(tx.counterpartyAccount, row)
    return {
      booked_at: tx.bookedDateOnly ? day : tx.bookedAt.toISOString(),
      booked_date_only: tx.bookedDateOnly,
      direction: tx.direction,
      amount: tx.amount.toString(),
      description: optionalText(tx.description, row),
      counterparty_name: optionalText(tx.counterpartyName, row),
      counterparty_account: maskAccount(account),
      balance_after: balance(tx.balanceAfter, row),
      provider_tx_id: stable ? providerId : null,
      raw: rawObject(tx.raw, account, row),
    }
  })

  return {
    parser: format.name,
    has_stable_row_id: format.hasStableRowId,
    has_running_balance: format.hasRunningBalance,
    period_from: from,
    period_to: to,
    opening_balance: balance(parsed.openingBalance),
    closing_balance: balance(parsed.closingBalance),
    // Without an export time the database takes the time of staging, which
    // can be a cron retry a day later, and would then count a day the file
    // cut off as complete. The upload time is the latest the file can be from.
    exported_at: (exportedAt ?? now).toISOString(),
    rows,
  }
}
