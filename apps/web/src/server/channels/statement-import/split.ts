import { StatementImportError } from "./errors"
import { jsonbTextBytes, vnDay, type StagedRow, type StagedStatement } from "./normalize"

/**
 * Splits a normalized statement into parts that are each staged as their own
 * inbound event and import batch, as if the uploader had exported the period
 * as several shorter statements (design section 5.2). Each part:
 *
 * - holds whole local days, so it keeps the parser contract of
 *   give.stage_statement_import (every row of each day of its period); a day
 *   is never cut, so a part may hold more than PART_ROWS rows when one day
 *   does;
 * - fits the payload cap of give.inbound_events (1 MiB of jsonb text);
 * - covers its share of the stated period without gaps: part i runs from its
 *   first day (the statement's period_from for the first part) to the day
 *   before part i+1's first day (the statement's period_to for the last), so
 *   empty days stay in exactly one part;
 * - keeps the statement's opening balance (first part) and closing balance
 *   (last part) only: those are what the bank printed. Between parts the
 *   database compares the running balances across the edge as it does for
 *   any two adjacent uploads.
 */

/**
 * Rows a part aims at. Each part is one processor attempt (stage + import)
 * within PROCESSOR_TIMEOUT_MS (15 s). Measured on PostgreSQL 17.11 for
 * DOS/Give#73, with staging run without JIT (DOS-Me migration
 * 20261104100000): a realistic 1000-row part takes 1.4 to 3.0 s, a re-upload
 * of one (all duplicates) 0.4 to 1.3 s, against 10 to 13 s for 5000 rows in
 * one batch. 1000 rows also keep a part's payload near 0.5 MB, half the cap.
 */
export const PART_ROWS = 1000

export interface StatementPart {
  /** 0-based position among the parts. */
  index: number
  /** Number of parts of the file. */
  count: number
  /** File row number (1-based) of the part's first row. */
  firstRow: number
  /** Local days of the part's first and last rows. */
  firstDay: string
  lastDay: string
  statement: StagedStatement
}

/** Local day (Asia/Ho_Chi_Minh) of a staged row. */
function rowDay(row: StagedRow): string {
  return row.booked_date_only ? row.booked_at : vnDay(new Date(row.booked_at))
}

function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

/**
 * Splits `staged` into parts of whole days, each under PART_ROWS rows where
 * days allow and each with `payloadBytes(part) <= maxBytes`. A statement that
 * already fits is one part, unchanged. Throws STATEMENT_TOO_LARGE when one day
 * alone is over the payload cap.
 */
export function splitStatement(
  staged: StagedStatement,
  payloadBytes: (statement: StagedStatement) => number,
  maxBytes: number
): StatementPart[] {
  if (staged.rows.length <= PART_ROWS && payloadBytes(staged) <= maxBytes) {
    return [
      {
        index: 0,
        count: 1,
        firstRow: 1,
        firstDay: rowDay(staged.rows[0]),
        lastDay: rowDay(staged.rows[staged.rows.length - 1]),
        statement: staged,
      },
    ]
  }

  // Days in file order (normalizeStatement checked that days never go back).
  const days: { day: string; rows: StagedRow[] }[] = []
  for (const row of staged.rows) {
    const day = rowDay(row)
    const last = days.at(-1)
    if (last?.day === day) last.rows.push(row)
    else days.push({ day, rows: [row] })
  }

  // A part's payload is the statement's with fewer rows and other period and
  // balance values: the envelope is measured once with the widest of those,
  // and each row adds its jsonb text and a ", " separator (an upper bound by
  // the last row's separator).
  const envelope = payloadBytes({
    ...staged,
    period_from: staged.period_from ?? "0000-00-00",
    period_to: staged.period_to ?? "0000-00-00",
    opening_balance: "-999999999999999",
    closing_balance: "-999999999999999",
    rows: [],
  })
  const dayBytes = days.map((d) => d.rows.reduce((sum, row) => sum + jsonbTextBytes(row) + 2, 0))

  const groups: { from: number; to: number }[] = []
  let start = 0
  let rows = 0
  let bytes = envelope
  for (let i = 0; i < days.length; i++) {
    const n = days[i].rows.length
    if (envelope + dayBytes[i] > maxBytes) throw new StatementImportError("STATEMENT_TOO_LARGE")
    if (i > start && (rows + n > PART_ROWS || bytes + dayBytes[i] > maxBytes)) {
      groups.push({ from: start, to: i - 1 })
      start = i
      rows = 0
      bytes = envelope
    }
    rows += n
    bytes += dayBytes[i]
  }
  groups.push({ from: start, to: days.length - 1 })

  const stated = staged.period_from !== null || staged.period_to !== null
  let firstRow = 1
  return groups.map((group, index) => {
    const first = index === 0
    const last = index === groups.length - 1
    const partRows = days.slice(group.from, group.to + 1).flatMap((d) => d.rows)
    const statement: StagedStatement = {
      ...staged,
      period_from: !stated || first ? staged.period_from : days[group.from].day,
      period_to: !stated || last ? staged.period_to : dayBefore(days[group.to + 1].day),
      opening_balance: first ? staged.opening_balance : null,
      closing_balance: last ? staged.closing_balance : null,
      rows: partRows,
    }
    if (payloadBytes(statement) > maxBytes) throw new StatementImportError("STATEMENT_TOO_LARGE")
    const part = {
      index,
      count: groups.length,
      firstRow,
      firstDay: days[group.from].day,
      lastDay: days[group.to].day,
      statement,
    }
    firstRow += partRows.length
    return part
  })
}
