import { referenceCode } from "@/test/reference-codes"
import { xlsxFile, type XlsxCell } from "@/test/xlsx-file"

/**
 * SYNTHETIC Techcombank Business statement fixtures (DOS/Give#17). Every
 * name, account number and transfer below is made up; none belongs to a real
 * person or account. The layout follows Techcombank's public guides (docs/
 * research/bank-statements.md, section 6.2), not a real export: the table
 * header in particular is unconfirmed. Replace these with JOY's anonymized
 * samples when they arrive (research section 7).
 *
 * The committed files `tcb-business-synthetic.xlsx` and
 * `tcb-business-synthetic.csv` are built from this module; the parser test
 * checks they still match it, and `UPDATE_FIXTURES=1` rewrites them.
 */

/** Valid donation codes (prefix, body, check character), as give.find_reference_codes finds them. */
export const CODES = {
  sameBank: referenceCode("7K2M9Q"),
  napas: referenceCode("3HT8WX"),
  duplicate: referenceCode("5PZ4NC"),
  diacritics: referenceCode("8RD2KM"),
  long: referenceCode("4VJ6TE"),
}

export interface FixtureRow {
  /** Local wall-clock time; date only for a row the bank books without a time. */
  at: string
  valueDate: string
  ref: string
  counterparty: string
  counterpartyAccount: string
  counterpartyBank: string
  description: string
  debit?: number
  credit?: number
  fee?: number
  vat?: number
  balance: number
  /** Which case of research section 7.1 the row covers. */
  covers: string
}

export const PERIOD = { from: "2026-11-01", to: "2026-11-15" }
export const OPENING = 10_000_000

/** Oldest first. */
export const ROWS: FixtureRow[] = [
  {
    at: "2026-11-02T09:15:02",
    valueDate: "2026-11-02",
    ref: "FT26306000000001",
    counterparty: "NGUYEN VAN AN",
    counterpartyAccount: "1900000000011",
    counterpartyBank: "Techcombank",
    description: `NGUYEN VAN AN chuyen tien ${CODES.sameBank}`,
    credit: 500_000,
    balance: 10_500_000,
    covers: "incoming transfer from the same bank",
  },
  {
    at: "2026-11-03T10:20:00",
    valueDate: "2026-11-03",
    ref: "FT26307000000002",
    counterparty: "TRAN THI BINH",
    counterpartyAccount: "0070000000022",
    counterpartyBank: "Vietcombank",
    description: `MBVCB.9000000001.${CODES.napas} ung ho.CT tu 0070000000022 TRAN THI BINH toi 1900000000001`,
    credit: 200_000,
    balance: 10_700_000,
    covers: "incoming NAPAS transfer from another bank",
  },
  {
    at: "2026-11-04T11:00:00",
    valueDate: "2026-11-04",
    ref: "FT26308000000003",
    counterparty: "LE THI CUC",
    counterpartyAccount: "0300000000033",
    counterpartyBank: "MB",
    description: "QR - GIVETEST01",
    credit: 10_000,
    balance: 10_710_000,
    covers: "incoming VietQR transfer carrying the test code GIVETEST01",
  },
  {
    at: "2026-11-05T08:00:00",
    valueDate: "2026-11-05",
    ref: "FT26309000000004",
    counterparty: "PHAM VAN DUNG",
    counterpartyAccount: "0400000000044",
    counterpartyBank: "ACB",
    description: `UNG HO ${CODES.duplicate}`,
    credit: 100_000,
    balance: 10_810_000,
    covers: "two incoming transfers on one day, same amount and content (first)",
  },
  {
    at: "2026-11-05T08:00:00",
    valueDate: "2026-11-05",
    ref: "FT26309000000005",
    counterparty: "PHAM VAN DUNG",
    counterpartyAccount: "0400000000044",
    counterpartyBank: "ACB",
    description: `UNG HO ${CODES.duplicate}`,
    credit: 100_000,
    balance: 10_910_000,
    covers: "two incoming transfers on one day, same amount and content (second)",
  },
  {
    at: "2026-11-06T14:30:00",
    valueDate: "2026-11-06",
    ref: "FT26310000000006",
    counterparty: "CONG TY TNHH GAO MAU",
    counterpartyAccount: "0500000000055",
    counterpartyBank: "BIDV",
    description: "CHI MUA GAO CUU TRO DOT 1",
    debit: 3_000_000,
    fee: 10_000,
    vat: 1_000,
    balance: 7_899_000,
    covers: "outgoing transfer, with its fee and VAT on the same row",
  },
  {
    at: "2026-11-07",
    valueDate: "2026-11-07",
    ref: "19135200000000-20261107",
    counterparty: "",
    counterpartyAccount: "",
    counterpartyBank: "",
    description: "PHI QUAN LY TAI KHOAN THANG 10/2026",
    fee: 20_000,
    vat: 2_000,
    balance: 7_877_000,
    covers: "fee row added by the bank, booked without a time",
  },
  {
    at: "2026-11-08T16:45:10",
    valueDate: "2026-11-08",
    ref: "FT26312000000008",
    counterparty: "VÕ THỊ ĐÀO",
    counterpartyAccount: "0600000000066",
    counterpartyBank: "VPBank",
    description: `Ủng hộ đồng bào miền Trung ${CODES.diacritics}`,
    credit: 1_000_000,
    balance: 8_877_000,
    covers: "transfer content with Vietnamese diacritics",
  },
  {
    at: "2026-11-09T07:05:00",
    valueDate: "2026-11-09",
    ref: "FT26313000000009",
    counterparty: "HOANG VAN EM",
    counterpartyAccount: "0700000000077",
    counterpartyBank: "VietinBank",
    description:
      "HOANG VAN EM chuyen khoan ung ho chuong trinh nau com cho benh nhan ngheo tai benh vien tinh dot thang muoi mot nam hai nghin khong tram hai muoi sau " +
      CODES.long,
    credit: 250_000,
    balance: 9_127_000,
    covers: "transfer content longer than 100 characters, code at the end",
  },
]

export const CLOSING = ROWS[ROWS.length - 1].balance

const HEADER = [
  "Ngày giao dịch/Transaction date",
  "Ngày hiệu lực/Value date",
  "Số bút toán/Transaction number",
  "Đối tác giao dịch/Remitter",
  "Tài khoản đối ứng/Remitter's account number",
  "Ngân hàng đối tác/Remitter's bank",
  "Diễn giải/Description",
  "Nợ/Debit",
  "Có/Credit",
  "Phí/Fee",
  "Thuế GTGT/VAT",
  "Số dư/Running balance",
]

const total = (pick: (row: FixtureRow) => number | undefined) => ROWS.reduce((sum, row) => sum + (pick(row) ?? 0), 0)

/** The rows above the table, as the guide's "Tải sao kê" sample shows them (synthetic customer). */
function headerBlock(amount: (n: number) => XlsxCell, day: (iso: string) => XlsxCell): XlsxCell[][] {
  return [
    ["NGÂN HÀNG TMCP KỸ THƯƠNG VIỆT NAM"],
    ["TRUY VẤN GIAO DỊCH TÀI KHOẢN / TRANSACTION ENQUIRY"],
    ["Từ ngày/From", day(PERIOD.from), "Đến ngày/To", day(PERIOD.to)],
    [],
    ["Thông tin khách hàng / Customer Information"],
    ["Số tài khoản/Account number", "1900000000001"],
    ["Tên tài khoản/Account name", "CONG TY TNHH VI DU GIVE (DU LIEU GIA)"],
    ["Loại tiền/Currency", "VND"],
    ["Loại tài khoản/Account type", "Tài khoản thanh toán"],
    [],
    ["Thông tin số dư / BalanceSummary"],
    ["Số dư hiện tại/Actual balance", amount(CLOSING)],
    ["Số dư đầu ngày/Opening balance", amount(OPENING)],
    ["Số dư cuối ngày/ Closing balance", amount(CLOSING)],
    ["Tổng ghi nợ/ Total debits", amount(total((r) => r.debit))],
    ["Tổng ghi có/ Total credits", amount(total((r) => r.credit))],
    ["Tổng phí/ Total fees", amount(total((r) => r.fee))],
    ["Tổng VAT/ Total VAT", amount(total((r) => r.vat))],
    [],
  ]
}

function dayFirst(at: string): string {
  const [day, time] = at.split("T")
  const [y, m, d] = day.split("-")
  return time === undefined ? `${d}/${m}/${y}` : `${d}/${m}/${y} ${time}`
}

/** XLSX: native numbers and date cells, newest first. */
export function syntheticXlsx(): Uint8Array {
  const n = (value: number | undefined): XlsxCell => (value === undefined ? null : { n: String(value) })
  const date = (iso: string): XlsxCell => ({ date: iso.includes("T") ? iso : `${iso}T00:00:00` })
  const table = [...ROWS]
    .reverse()
    .map((row): XlsxCell[] => [
      date(row.at),
      date(row.valueDate),
      row.ref,
      row.counterparty || null,
      row.counterpartyAccount || null,
      row.counterpartyBank || null,
      row.description,
      n(row.debit),
      n(row.credit),
      n(row.fee),
      n(row.vat),
      n(row.balance),
    ])
  return xlsxFile([...headerBlock(n, (iso) => iso), HEADER, ...table], "Giao dich")
}

/** CSV: UTF-8 with a byte order mark, text amounts with "," thousands, oldest first. */
export function syntheticCsv(): Uint8Array {
  const money = (value: number | undefined) => (value === undefined ? "" : value.toLocaleString("en-US"))
  const quote = (cell: XlsxCell) => {
    const text = cell === null ? "" : typeof cell === "string" ? cell : ""
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const table = ROWS.map((row) => [
    dayFirst(row.at),
    dayFirst(row.valueDate),
    row.ref,
    row.counterparty,
    row.counterpartyAccount,
    row.counterpartyBank,
    row.description,
    money(row.debit),
    money(row.credit),
    money(row.fee),
    money(row.vat),
    money(row.balance),
  ])
  const lines = [
    ...headerBlock(
      (value) => money(value),
      (iso) => iso
    ),
    HEADER,
    ...table,
  ].map((row) => row.map(quote).join(","))
  return new TextEncoder().encode(`﻿${lines.join("\r\n")}\r\n`)
}
