import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { StatementImportError } from "@/server/channels/statement-import/errors"
import { normalizeStatement } from "@/server/channels/statement-import/normalize"
import { findReferenceCodes } from "@/test/reference-codes"
import { xlsxFile, type XlsxCell } from "@/test/xlsx-file"

import { tcbBusinessParser } from "."
import { CLOSING, CODES, OPENING, PERIOD, ROWS, syntheticCsv, syntheticXlsx } from "./fixtures/synthetic"

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
const NOW = new Date("2026-11-18T03:00:00Z")

const FILES = {
  "tcb-business-synthetic.xlsx": syntheticXlsx,
  "tcb-business-synthetic.csv": syntheticCsv,
}

async function failure(file: Uint8Array): Promise<StatementImportError> {
  try {
    await tcbBusinessParser.parse(file)
  } catch (err) {
    if (err instanceof StatementImportError) return err
    throw err
  }
  throw new Error("expected the parser to refuse the file")
}

describe("Techcombank Business synthetic fixtures", () => {
  it.each(Object.entries(FILES))("%s matches its source in fixtures/synthetic.ts", (name, build) => {
    if (process.env.UPDATE_FIXTURES === "1") writeFileSync(fixture(name), build())
    expect(new Uint8Array(readFileSync(fixture(name)))).toEqual(build())
  })
})

describe.each(Object.keys(FILES))("tcbBusinessParser on %s", (name) => {
  const read = () => tcbBusinessParser.parse(new Uint8Array(readFileSync(fixture(name))))

  it("reads every row with its amount, direction and balance, oldest first", async () => {
    const parsed = await read()
    expect(parsed.rows).toHaveLength(ROWS.length)
    expect(parsed.rows.map((r) => [r.direction, r.amount, r.balanceAfter])).toEqual(
      ROWS.map((row) => [
        row.credit === undefined ? "out" : "in",
        BigInt(row.credit ?? (row.debit ?? 0) + (row.fee ?? 0) + (row.vat ?? 0)),
        BigInt(row.balance),
      ])
    )
    expect(parsed.rows.every((r) => r.asset === "VND" && r.providerTxId === null)).toBe(true)
  })

  it("reads the period and balances of the header block", async () => {
    expect(await read()).toMatchObject({
      periodFrom: PERIOD.from,
      periodTo: PERIOD.to,
      openingBalance: BigInt(OPENING),
      closingBalance: BigInt(CLOSING),
      exportedAt: null,
    })
  })

  it("keeps each transfer's content whole, so the matcher finds the code", async () => {
    const codes = (await read()).rows.map((r) => findReferenceCodes(r.description))
    expect(codes).toEqual([
      [CODES.sameBank],
      [CODES.napas],
      [],
      [CODES.duplicate],
      [CODES.duplicate],
      [],
      [],
      [CODES.diacritics],
      [CODES.long],
    ])
  })

  it("keeps the VietQR test code GIVETEST01 intact", async () => {
    expect((await read()).rows[2].description).toBe("QR - GIVETEST01")
  })

  it("keeps two same-day transfers of the same amount and content as two rows", async () => {
    const [a, b] = (await read()).rows.slice(3, 5)
    expect([a.description, a.amount, a.bookedAt]).toEqual([b.description, b.amount, b.bookedAt])
    expect([a.balanceAfter, b.balanceAfter]).toEqual([BigInt(10_810_000), BigInt(10_910_000)])
    expect([a.raw?.ref, b.raw?.ref]).toEqual(["FT26309000000004", "FT26309000000005"])
  })

  it("counts an outgoing transfer's fee and VAT in the money out", async () => {
    const out = (await read()).rows[5]
    expect(out).toMatchObject({ direction: "out", amount: BigInt(3_011_000), description: "CHI MUA GAO CUU TRO DOT 1" })
    expect(out.raw).toMatchObject({ cells: { "Nợ/Debit": expect.any(String), "Phí/Fee": expect.any(String) } })
  })

  it("reads the bank's fee row as money out booked without a time", async () => {
    expect((await read()).rows[6]).toMatchObject({
      direction: "out",
      amount: BigInt(22_000),
      bookedDateOnly: true,
      bookedAt: new Date("2026-11-07T00:00:00+07:00"),
      counterpartyName: null,
    })
  })

  it("keeps Vietnamese diacritics and content longer than 100 characters", async () => {
    const rows = (await read()).rows
    expect(rows[7].description).toBe(ROWS[7].description)
    expect(rows[7].counterpartyName).toBe("VÕ THỊ ĐÀO")
    expect(rows[8].description!.length).toBeGreaterThan(100)
    expect(rows[8].description).toBe(ROWS[8].description)
  })

  it("reads transaction times as Asia/Ho_Chi_Minh", async () => {
    expect((await read()).rows[0]).toMatchObject({
      bookedAt: new Date("2026-11-02T09:15:02+07:00"),
      bookedDateOnly: false,
    })
  })

  it("passes the import pipeline's checks, with counterparty accounts masked", async () => {
    const staged = normalizeStatement(tcbBusinessParser, await read(), NOW)
    expect(staged).toMatchObject({
      parser: "tcb-business",
      has_stable_row_id: false,
      has_running_balance: true,
      period_from: PERIOD.from,
      period_to: PERIOD.to,
    })
    expect(staged.rows).toHaveLength(ROWS.length)
    expect(staged.rows[0].counterparty_account).toBe("****0011")
    expect(JSON.stringify(staged.rows[0].raw)).not.toContain("1900000000011")
  })
})

/** A small XLSX in the fixture layout, to vary one thing at a time. */
function statement({
  top = [["Từ ngày/From", "2026-11-01", "Đến ngày/To", "2026-11-15"]] as XlsxCell[][],
  header = [
    "Ngày giao dịch/Transaction date",
    "Diễn giải/Description",
    "Nợ/Debit",
    "Có/Credit",
    "Phí/Fee",
    "Số dư/Running balance",
  ] as XlsxCell[],
  rows = [["02/11/2026", "UNG HO", null, "1,000", null, "11,000"]] as XlsxCell[][],
  bottom = [] as XlsxCell[][],
} = {}): Uint8Array {
  return xlsxFile([...top, ["Số dư đầu ngày/Opening balance", "10,000"], [], header, ...rows, ...bottom])
}

describe("tcbBusinessParser refuses what it does not recognise", () => {
  it("reads the small statement it varies", async () => {
    expect((await tcbBusinessParser.parse(statement())).rows).toHaveLength(1)
  })

  it.each([
    ["an unknown table header", statement({ header: ["Ngày", "Nội dung", "Số tiền", "x", "y", "Số dư"] })],
    [
      "the PDF statement's stacked header",
      statement({ header: ["Ngày giao dịch / Ngày hiệu lực", "Diễn giải", "Nợ", "Có", "Phí", "Số dư"] }),
    ],
    [
      "a non-VND account",
      statement({
        top: [
          ["Loại tiền/Currency", "USD"],
          ["Từ ngày/From", "2026-11-01", "Đến ngày/To", "2026-11-15"],
        ],
      }),
    ],
    [
      "a transaction row after the table ended",
      statement({ bottom: [["Cộng"], ["03/11/2026", "X", null, "1,000", null, "12,000"]] }),
    ],
    [
      "a closing balance other than the last row's",
      statement({ bottom: [["Số dư cuối ngày/ Closing balance", "11,001"]] }),
    ],
    ["an old binary .xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
  ])("refuses %s", async (_, file) => {
    expect((await failure(file)).code).toBe("STATEMENT_PARSE_FAILED")
  })

  it.each([
    ["a credit with a fee on the same row", ["02/11/2026", "X", null, "1,000", "100", "10,900"]],
    ["a row with no balance", ["02/11/2026", "X", null, "1,000", null, null]],
    ["a fractional amount", ["02/11/2026", "X", null, "1,000.50", null, "11,000"]],
    ["a balance that does not add up", ["02/11/2026", "X", null, "1,000", null, "11,500"]],
  ])("refuses %s, naming the row", async (_, row) => {
    const err = await failure(statement({ rows: [row as XlsxCell[]] }))
    expect([err.code, err.row]).toEqual(["STATEMENT_ROW_INVALID", 1])
  })

  it("leaves the period empty when the file does not state it, which the pipeline then refuses", async () => {
    const parsed = await tcbBusinessParser.parse(statement({ top: [] }))
    expect([parsed.periodFrom, parsed.periodTo]).toEqual([null, null])
    expect(() => normalizeStatement(tcbBusinessParser, parsed, NOW)).toThrow("STATEMENT_PERIOD_REQUIRED")
  })

  it("never puts file contents in its errors", async () => {
    const err = await failure(statement({ rows: [["02/11/2026", "NGUYEN VAN A 0123456789", null, "x", null, "1"]] }))
    expect(`${err.message} ${err.code}`).not.toMatch(/NGUYEN|0123456789/)
  })
})
