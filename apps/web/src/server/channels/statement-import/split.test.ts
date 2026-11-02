import { describe, expect, it } from "vitest"

import { CSV_COLUMNS, csvFile, csvStatementParser } from "@/test/csv-statement-parser"
import { largeStatementFile } from "@/test/statement-fixture"

import { StatementImportError } from "./errors"
import { jsonbTextBytes, normalizeStatement, type StagedStatement } from "./normalize"
import { MAX_PAYLOAD_BYTES, statementPayload } from "./pipeline"
import { PART_ROWS, splitStatement } from "./split"

const NOW = new Date("2026-10-05T03:00:00Z")
const ACCOUNT = "11111111-1111-4111-8111-111111111111"
const ACTOR = "22222222-2222-4222-8222-222222222222"
const parser = csvStatementParser()

const bytes = (statement: StagedStatement) => jsonbTextBytes(statementPayload(ACCOUNT, ACTOR, statement))

async function staged(file: Uint8Array, format = parser): Promise<StagedStatement> {
  return normalizeStatement(format, await format.parse(file), NOW)
}

function row(bookedAt: string, n: number, extra = "") {
  return `${bookedAt},in,1000,${1000 * n},FT${n},ROW ${n}${extra},,`
}

describe("splitStatement", () => {
  it("keeps a statement that fits as one part, unchanged", async () => {
    const statement = await staged(
      csvFile("period_from,2026-10-01", "period_to,2026-10-02", CSV_COLUMNS, row("2026-10-01T09:00:00+07:00", 1))
    )
    const parts = splitStatement(statement, bytes, MAX_PAYLOAD_BYTES)
    expect(parts).toEqual([{ index: 0, count: 1, firstRow: 1, statement }])
    expect(parts[0].statement).toBe(statement)
  })

  it("splits a realistic 5000-row statement into whole-day parts under the payload cap", async () => {
    const statement = await staged(largeStatementFile())
    expect(statement.rows).toHaveLength(5000)
    // The reason for the split: one event could not hold this statement.
    expect(bytes(statement)).toBeGreaterThan(MAX_PAYLOAD_BYTES)

    const parts = splitStatement(statement, bytes, MAX_PAYLOAD_BYTES)
    expect(parts.map((p) => [p.index, p.count, p.firstRow, p.statement.rows.length])).toEqual([
      [0, 5, 1, 1000],
      [1, 5, 1001, 1000],
      [2, 5, 2001, 1000],
      [3, 5, 3001, 1000],
      [4, 5, 4001, 1000],
    ])
    for (const part of parts) expect(bytes(part.statement)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES)
    // Every row once, in file order.
    expect(parts.flatMap((p) => p.statement.rows)).toEqual(statement.rows)
    // The period is tiled without gaps or overlaps, two days of 500 rows a part.
    expect(parts.map((p) => [p.statement.period_from, p.statement.period_to])).toEqual([
      ["2026-09-20", "2026-09-21"],
      ["2026-09-22", "2026-09-23"],
      ["2026-09-24", "2026-09-25"],
      ["2026-09-26", "2026-09-27"],
      ["2026-09-28", "2026-09-29"],
    ])
    // The bank's stated balances stay at the statement's two ends only.
    expect(parts.map((p) => [p.statement.opening_balance, p.statement.closing_balance])).toEqual([
      ["0", null],
      [null, null],
      [null, null],
      [null, null],
      [null, statement.closing_balance],
    ])
    for (const part of parts) {
      expect(part.statement).toMatchObject({
        parser: statement.parser,
        has_stable_row_id: true,
        has_running_balance: true,
        exported_at: statement.exported_at,
      })
    }
  })

  it("keeps empty days of the period in exactly one part", async () => {
    const lines = [
      ...Array.from({ length: 600 }, (_, i) => row("2026-10-01T09:00:00+07:00", i + 1)),
      ...Array.from({ length: 600 }, (_, i) => row("2026-10-04T09:00:00+07:00", i + 601)),
    ]
    const statement = await staged(csvFile("period_from,2026-09-28", "period_to,2026-10-05", CSV_COLUMNS, ...lines))
    const parts = splitStatement(statement, bytes, MAX_PAYLOAD_BYTES)
    expect(parts.map((p) => [p.statement.period_from, p.statement.period_to, p.statement.rows.length])).toEqual([
      ["2026-09-28", "2026-10-03", 600],
      ["2026-10-04", "2026-10-05", 600],
    ])
  })

  it("groups rows by local day, date-only rows included", async () => {
    // 17:30 UTC on 1 October is 00:30 on 2 October in Vietnam.
    const lines = [
      ...Array.from({ length: PART_ROWS }, (_, i) => row("2026-10-01T09:00:00+07:00", i + 1)),
      row("2026-10-01T23:59:00+07:00", PART_ROWS + 1),
      `2026-10-01T17:30:00Z,in,1000,${1000 * (PART_ROWS + 2)},FT${PART_ROWS + 2},LATE,,`,
      `2026-10-02,out,1,${1000 * (PART_ROWS + 2) - 1},FT${PART_ROWS + 3},PHI,,`,
    ]
    const statement = await staged(csvFile("period_from,2026-10-01", "period_to,2026-10-02", CSV_COLUMNS, ...lines))
    const parts = splitStatement(statement, bytes, MAX_PAYLOAD_BYTES)
    expect(parts.map((p) => p.statement.rows.length)).toEqual([PART_ROWS + 1, 2])
    expect(parts[1].firstRow).toBe(PART_ROWS + 2)
    expect(parts[1].statement.period_from).toBe("2026-10-02")
  })

  it("never cuts a day, even one longer than PART_ROWS", async () => {
    const lines = [
      ...Array.from({ length: 1500 }, (_, i) => row("2026-10-01T09:00:00+07:00", i + 1)),
      ...Array.from({ length: 10 }, (_, i) => row("2026-10-02T09:00:00+07:00", i + 1501)),
    ]
    const statement = await staged(csvFile("period_from,2026-10-01", "period_to,2026-10-02", CSV_COLUMNS, ...lines))
    expect(splitStatement(statement, bytes, MAX_PAYLOAD_BYTES).map((p) => p.statement.rows.length)).toEqual([1500, 10])
  })

  it("splits by bytes as well as by rows", async () => {
    const lines = Array.from({ length: 40 }, (_, i) =>
      row(`2026-10-${String(1 + Math.floor(i / 10)).padStart(2, "0")}T09:00:00+07:00`, i + 1, "x".repeat(200))
    )
    const statement = await staged(csvFile("period_from,2026-10-01", "period_to,2026-10-04", CSV_COLUMNS, ...lines))
    const cap = Math.ceil(bytes(statement) / 2)
    const parts = splitStatement(statement, bytes, cap)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(bytes(part.statement)).toBeLessThanOrEqual(cap)
    expect(parts.flatMap((p) => p.statement.rows)).toEqual(statement.rows)
  })

  it("leaves the period unstated when the file states none", async () => {
    const lines = [
      ...Array.from({ length: 800 }, (_, i) => row("2026-10-01T09:00:00+07:00", i + 1)),
      ...Array.from({ length: 800 }, (_, i) => row("2026-10-02T09:00:00+07:00", i + 801)),
    ]
    const statement = await staged(csvFile(CSV_COLUMNS, ...lines))
    const parts = splitStatement(statement, bytes, MAX_PAYLOAD_BYTES)
    expect(parts.map((p) => [p.statement.period_from, p.statement.period_to])).toEqual([
      [null, null],
      [null, null],
    ])
  })

  it("refuses a statement with one day too large for an inbound event", async () => {
    const lines = Array.from({ length: 50 }, (_, i) => row("2026-10-01T09:00:00+07:00", i + 1, "x".repeat(200)))
    const statement = await staged(csvFile("period_from,2026-10-01", "period_to,2026-10-01", CSV_COLUMNS, ...lines))
    const err = (() => {
      try {
        splitStatement(statement, bytes, Math.ceil(bytes(statement) / 2))
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(StatementImportError)
    expect((err as StatementImportError).code).toBe("STATEMENT_TOO_LARGE")
  })
})
