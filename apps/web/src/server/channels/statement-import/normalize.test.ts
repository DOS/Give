import { describe, expect, it } from "vitest"

import type { NormalizedTx } from "@/server/channels/types"
import type { ParsedStatement, StatementFormat } from "@/server/statement-parsers/types"
import { CSV_COLUMNS, parseCsvStatement } from "@/test/csv-statement-parser"

import { StatementImportError } from "./errors"
import { jsonbTextBytes, MAX_ROWS, maskAccount, normalizeStatement, vnDay } from "./normalize"

const NOW = new Date("2026-10-05T03:00:00Z") // 10:00 on 5 Oct in Hanoi
const IDS: StatementFormat = { name: "test-csv", hasStableRowId: true, hasRunningBalance: true }
const NO_IDS: StatementFormat = { name: "test-csv-noid", hasStableRowId: false, hasRunningBalance: true }

function tx(overrides: Partial<NormalizedTx> = {}): NormalizedTx {
  return {
    providerTxId: "FT001",
    direction: "in",
    asset: "VND",
    amount: BigInt(50000),
    bookedAt: new Date("2026-10-01T09:15:00+07:00"),
    bookedDateOnly: false,
    description: "GVABCDEF",
    balanceAfter: BigInt(150000),
    ...overrides,
  }
}

function statement(rows: NormalizedTx[], overrides: Partial<ParsedStatement> = {}): ParsedStatement {
  return { periodFrom: "2026-10-01", periodTo: "2026-10-02", rows, ...overrides }
}

function refusal(fn: () => unknown): { code: string; row?: number } {
  try {
    fn()
  } catch (err) {
    if (err instanceof StatementImportError) return { code: err.code, row: err.row }
    throw err
  }
  throw new Error("expected a refusal")
}

describe("normalizeStatement", () => {
  it("turns a parsed CSV statement into the staging RPC's rows", () => {
    const parsed = parseCsvStatement(
      [
        "period_from,2026-10-01",
        "period_to,2026-10-02",
        "opening_balance,100000",
        "closing_balance,148900",
        "exported_at,2026-10-03T08:00:00+07:00",
        CSV_COLUMNS,
        "2026-10-01T09:15:00+07:00,in,50000,150000,FT001,MBVCB.123.GVABCDEF.CT,NGUYEN VAN A,0123456789",
        "2026-10-02,out,1100,148900,FT002,PHI SMS,,",
      ].join("\n")
    )
    expect(normalizeStatement(IDS, parsed, NOW)).toEqual({
      parser: "test-csv",
      has_stable_row_id: true,
      has_running_balance: true,
      period_from: "2026-10-01",
      period_to: "2026-10-02",
      opening_balance: "100000",
      closing_balance: "148900",
      exported_at: "2026-10-03T01:00:00.000Z",
      rows: [
        {
          booked_at: "2026-10-01T02:15:00.000Z",
          booked_date_only: false,
          direction: "in",
          amount: "50000",
          description: "MBVCB.123.GVABCDEF.CT",
          counterparty_name: "NGUYEN VAN A",
          counterparty_account: "****6789",
          balance_after: "150000",
          provider_tx_id: "FT001",
          // The account number is masked in the raw cells too.
          raw: {
            line: "2026-10-01T09:15:00+07:00,in,50000,150000,FT001,MBVCB.123.GVABCDEF.CT,NGUYEN VAN A,****6789",
          },
        },
        {
          booked_at: "2026-10-02",
          booked_date_only: true,
          direction: "out",
          amount: "1100",
          description: "PHI SMS",
          counterparty_name: null,
          counterparty_account: null,
          balance_after: "148900",
          provider_tx_id: "FT002",
          raw: { line: "2026-10-02,out,1100,148900,FT002,PHI SMS,," },
        },
      ],
    })
  })

  it("takes the upload time as the export time when the file states none", () => {
    expect(normalizeStatement(IDS, statement([tx()]), NOW).exported_at).toBe(NOW.toISOString())
  })

  it("masks the counterparty account wherever it appears in the raw cells", () => {
    const raw = { cells: ["9704 3612 3456", "970436123456"], note: { text: "from 970436123456" }, n: 1 }
    const rows = normalizeStatement(IDS, statement([tx({ counterpartyAccount: "9704 3612 3456", raw })]), NOW).rows
    expect(rows[0].raw).toEqual({ cells: ["****3456", "****3456"], note: { text: "from ****3456" }, n: 1 })
    expect(raw.cells[0]).toBe("9704 3612 3456") // the parser's object is not changed
  })

  it("masks only the whole account number, also when written with separators", () => {
    const raw = { amount: "1000000", ref: "X100000", acct: "100.000", other: "10000 0" }
    const rows = normalizeStatement(IDS, statement([tx({ counterpartyAccount: "100000", raw })]), NOW).rows
    expect(rows[0].raw).toEqual({ amount: "1000000", ref: "X100000", acct: "****0000", other: "****0000" })
  })

  it("sends the largest amounts and balances as exact digits", () => {
    const big = BigInt("-999999999999999")
    const rows = normalizeStatement(
      IDS,
      statement([tx({ amount: BigInt("9999999999999"), balanceAfter: big })]),
      NOW
    ).rows
    expect(rows[0].amount).toBe("9999999999999")
    expect(rows[0].balance_after).toBe("-999999999999999")
  })

  it("dates a date-only row by its local day, whatever instant of the day the parser gave", () => {
    // 23:30 on 1 Oct in Hanoi is 16:30 UTC: still 1 Oct locally.
    const rows = normalizeStatement(
      IDS,
      statement([tx({ bookedAt: new Date("2026-10-01T16:30:00Z"), bookedDateOnly: true })]),
      NOW
    ).rows
    expect(rows[0].booked_at).toBe("2026-10-01")
    expect(vnDay(new Date("2026-10-01T17:00:00Z"))).toBe("2026-10-02")
  })

  it("trims ids, drops blank text and sends no id for a format without ids", () => {
    const rows = normalizeStatement(
      NO_IDS,
      statement([tx({ providerTxId: null, description: "  ", counterpartyName: "", counterpartyAccount: "  " })]),
      NOW
    ).rows
    expect(rows[0]).toMatchObject({
      provider_tx_id: null,
      description: null,
      counterparty_name: null,
      counterparty_account: null,
    })
    expect(normalizeStatement(IDS, statement([tx({ providerTxId: "  FT9  " })]), NOW).rows[0].provider_tx_id).toBe(
      "FT9"
    )
  })

  it("lets a date-only row such as a fee sit among the timed rows of its day", () => {
    const rows = [
      tx({ bookedAt: new Date("2026-10-01T15:00:00+07:00") }),
      tx({ providerTxId: "FEE", bookedAt: new Date("2026-10-01T00:00:00+07:00"), bookedDateOnly: true }),
      tx({ providerTxId: "FT002", bookedAt: new Date("2026-10-01T16:00:00+07:00") }),
    ]
    expect(normalizeStatement(IDS, statement(rows), NOW).rows).toHaveLength(3)
  })

  it("leaves a missing balance in a running-balance format to the database (it goes to staff)", () => {
    expect(normalizeStatement(IDS, statement([tx({ balanceAfter: null })]), NOW).rows[0].balance_after).toBeNull()
  })

  describe("refuses", () => {
    it("a format with neither a stable row id nor a running balance", () => {
      const format = { name: "bare", hasStableRowId: false, hasRunningBalance: false }
      expect(refusal(() => normalizeStatement(format, statement([tx({ providerTxId: null })]), NOW))).toEqual({
        code: "STATEMENT_FORMAT_UNSUPPORTED",
        row: undefined,
      })
    })

    it("a format without ids that states no period", () => {
      const parsed = statement([tx({ providerTxId: null })], { periodTo: null })
      expect(refusal(() => normalizeStatement(NO_IDS, parsed, NOW)).code).toBe("STATEMENT_PERIOD_REQUIRED")
    })

    it.each<[string, Partial<ParsedStatement>]>([
      ["a period that ends before it starts", { periodFrom: "2026-10-03", periodTo: "2026-10-01" }],
      ["a period that ends after today", { periodTo: "2026-10-06" }],
      ["a period longer than 400 days", { periodFrom: "2025-08-29", periodTo: "2026-10-04" }],
      ["a date that does not exist", { periodTo: "2026-02-30" }],
      ["a date with a time", { periodTo: "2026-10-02T00:00" }],
      ["a file produced before its last day began", { exportedAt: new Date("2026-10-01T23:00:00+07:00") }],
      ["a file produced more than a day from now", { exportedAt: new Date("2026-10-06T04:00:00Z") }],
      ["an invalid production time", { exportedAt: new Date("nope") }],
    ])("%s", (_name, overrides) => {
      expect(refusal(() => normalizeStatement(IDS, statement([tx()], overrides), NOW)).code).toBe(
        "STATEMENT_PERIOD_INVALID"
      )
    })

    it("an opening balance beyond 15 digits", () => {
      const parsed = statement([tx()], { openingBalance: BigInt("1000000000000000") })
      expect(refusal(() => normalizeStatement(IDS, parsed, NOW)).code).toBe("STATEMENT_BALANCE_INVALID")
    })

    it.each([0, MAX_ROWS + 1])("a statement with %i rows", (count) => {
      const rows = Array.from({ length: count }, (_, i) => tx({ providerTxId: `FT${i}` }))
      expect(refusal(() => normalizeStatement(IDS, statement(rows), NOW)).code).toBe("STATEMENT_ROWS_INVALID")
    })

    it.each<[string, Partial<NormalizedTx>]>([
      ["a zero amount", { amount: BigInt(0) }],
      ["a negative amount", { amount: BigInt(-5) }],
      ["an amount beyond 13 digits", { amount: BigInt("10000000000000") }],
      ["a number amount", { amount: 5000 as unknown as bigint }],
      ["another direction", { direction: "both" as "in" }],
      ["another asset", { asset: "USD" }],
      ["an invalid date", { bookedAt: new Date("nope") }],
      ["a booking more than a day ahead", { bookedAt: new Date("2026-10-06T04:00:00Z") }],
      ["a missing id in an id format", { providerTxId: null }],
      ["a blank id in an id format", { providerTxId: "   " }],
      ["an id longer than 200", { providerTxId: "F".repeat(201) }],
      ["an id that looks made up", { providerTxId: "stmt:abc" }],
      ["an id that looks made up for a resolved row", { providerTxId: "STMTROW:abc" }],
      ["a balance beyond 15 digits", { balanceAfter: BigInt("-1000000000000000") }],
      ["a description that is not text", { description: 5 as unknown as string }],
      ["raw that is not an object", { raw: ["a"] as unknown as Record<string, unknown> }],
      ["raw over 60 000 bytes", { raw: { cell: "x".repeat(60001) } }],
      ["raw under 60 000 bytes compact but over as jsonb text", { raw: { cells: Array(25000).fill(0) } }],
      ["a booking before 2000", { bookedAt: new Date("1999-12-31T23:00:00+07:00") }],
      ["a booking in a year that toISOString cannot print plainly", { bookedAt: new Date("-000026-10-01T00:00:00Z") }],
      ["raw that is not JSON", { raw: { n: BigInt(1) } }],
      ["a NUL in the description", { description: "GV\u0000X" }],
      ["an unpaired surrogate in the counterparty name", { counterpartyName: "A\ud800" }],
      ["a NUL in the raw cells", { raw: { cell: "a\u0000" } }],
      ["a NUL in the id", { providerTxId: "FT\u0000" }],
    ])("%s, naming the row", (_name, overrides) => {
      const rows = [tx({ providerTxId: "FT000" }), tx(overrides)]
      expect(refusal(() => normalizeStatement(IDS, statement(rows, { periodTo: "2026-10-05" }), NOW))).toEqual({
        code: "STATEMENT_ROW_INVALID",
        row: 2,
      })
    })

    it("an id in a format without ids", () => {
      expect(refusal(() => normalizeStatement(NO_IDS, statement([tx()]), NOW))).toEqual({
        code: "STATEMENT_ROW_INVALID",
        row: 1,
      })
    })

    it("a day that goes back", () => {
      const rows = [
        tx({ bookedAt: new Date("2026-10-02T08:00:00+07:00") }),
        tx({ providerTxId: "FEE", bookedAt: new Date("2026-10-01T00:00:00+07:00"), bookedDateOnly: true }),
      ]
      expect(refusal(() => normalizeStatement(IDS, statement(rows), NOW))).toEqual({
        code: "STATEMENT_ROWS_NOT_CHRONOLOGICAL",
        row: 2,
      })
    })

    it("a timed row earlier than the timed row before it", () => {
      const rows = [
        tx({ bookedAt: new Date("2026-10-01T10:00:00+07:00") }),
        tx({ providerTxId: "FT002", bookedAt: new Date("2026-10-01T09:59:59+07:00") }),
      ]
      expect(refusal(() => normalizeStatement(IDS, statement(rows), NOW))).toEqual({
        code: "STATEMENT_ROWS_NOT_CHRONOLOGICAL",
        row: 2,
      })
    })

    it("a row outside the stated period", () => {
      const rows = [tx(), tx({ providerTxId: "FT002", bookedAt: new Date("2026-10-03T00:05:00+07:00") })]
      expect(refusal(() => normalizeStatement(IDS, statement(rows), NOW))).toEqual({
        code: "STATEMENT_ROW_OUTSIDE_PERIOD",
        row: 2,
      })
    })
  })
})

describe("jsonbTextBytes", () => {
  it.each<[unknown, string]>([
    [{ a: 1, b: [true, null, "x"] }, '{"a": 1, "b": [true, null, "x"]}'],
    [[], "[]"],
    [{}, "{}"],
    ["Đồng", '"Đồng"'],
  ])("counts %j as Postgres prints it", (value, text) => {
    expect(jsonbTextBytes(value)).toBe(Buffer.byteLength(text, "utf8"))
  })
})

describe("maskAccount", () => {
  it.each([
    ["0123456789", "****6789"],
    ["12", "****12"],
    ["  9704 3612 3456  ", "****3456"],
    ["123-", "****"],
    ["****6789", "****6789"],
    ["", null],
    [null, null],
  ])("masks %j as give.mask_account does", (input, expected) => {
    expect(maskAccount(input)).toBe(expected)
  })
})
