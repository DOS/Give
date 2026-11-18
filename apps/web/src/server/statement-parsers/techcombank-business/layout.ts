import type { NormalizedTx } from "@/server/channels/types"

import type { Cell, Grid } from "../sheet/read"
import { bankDate, label, vnd, vnInstant, wholeNumber, type LocalDate } from "../sheet/text"
import type { ParsedStatement, StatementCoverage } from "../types"

/**
 * The layout of a Techcombank Business transaction export ("Tải sao kê" /
 * "Xuất ra", CSV or XLSX) as a grid of cells. Built from Techcombank's
 * public guides before any real file was seen (DOS/Give#17); see
 * docs/research/bank-statements.md, section 6.2.
 *
 * What is documented (official guides): the header block of the download
 * ("TRUY VẤN GIAO DỊCH TÀI KHOẢN / TRANSACTION ENQUIRY", "Từ ngày/From …
 * Đến ngày/To …", "Loại tiền/Currency", "Số dư đầu ngày/Opening balance",
 * "Số dư cuối ngày/ Closing balance"), and the columns of the monthly
 * statement: transaction and value dates, counterparty and its bank,
 * transaction number, description, "Nợ", "Có", "Phí", "Thuế GTGT" and
 * "Số dư", with balance after = before + Có − Nợ − Phí − Thuế.
 *
 * UNCONFIRMED until JOY's anonymized samples arrive: the table header of
 * the CSV/XLSX export itself. The labels below are the statement's, in the
 * bilingual "Vietnamese/English" form the download uses. A file whose table
 * lacks them is refused, never guessed at.
 */

type Column =
  | "date"
  | "valueDate"
  | "ref"
  | "description"
  | "counterpartyName"
  | "counterpartyAccount"
  | "counterpartyBank"
  | "debit"
  | "credit"
  | "fee"
  | "vat"
  | "balance"

/**
 * Header labels per column, compared part by part: a header cell
 * "Nợ/Debit" is the parts "no" and "debit" (after `label()`), and every part
 * must name the same column. A cell naming two columns ("Ngày giao dịch /
 * Ngày hiệu lực", as the PDF statement stacks them) matches neither.
 */
const HEADERS: Record<Column, readonly string[]> = {
  date: ["ngay giao dich", "transaction date"],
  valueDate: ["ngay hieu luc", "value date", "ngay kh thuc hien", "requesting date"],
  ref: ["so but toan", "transaction number", "transaction no", "ma giao dich", "so tham chieu", "reference number"],
  description: ["dien giai", "description"],
  counterpartyName: ["doi tac giao dich", "remitter", "ten tai khoan doi ung", "remitter's account name"],
  counterpartyAccount: ["tai khoan doi ung", "so tai khoan doi ung", "remitter's account number"],
  counterpartyBank: ["ngan hang doi tac", "remitter's bank"],
  debit: ["no", "debit"],
  credit: ["co", "credit"],
  fee: ["phi", "fee", "fees"],
  vat: ["thue gtgt", "vat"],
  balance: ["so du", "running balance"],
}
const REQUIRED: readonly Column[] = ["date", "description", "debit", "credit", "balance"]

const DATE_TEXT = "(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{4})"
/** A time of day after a date of the period line ("01/11/2026 08:00", "2026-11-01t08:00:00" once folded). */
const TIME_TEXT = "(?:(?: |t)(\\d{1,2}:\\d{2}(?::\\d{2})?))?"
/**
 * "Từ ngày/From 2025-09-01 Đến ngày/To 2025-09-30" (Techcombank Business web
 * guide, 31/10/2025, p.32). A time after either date is read too: the guide
 * shows none, and an export bounded by times holds only part of a day
 * (DOS/Give#57).
 */
const PERIOD = new RegExp(
  `tu ngay(?: ?/ ?from)?:? ?${DATE_TEXT}${TIME_TEXT}.*?den ngay(?: ?/ ?to)?:? ?${DATE_TEXT}${TIME_TEXT}`
)
/** A date of the period line, with the time this parser reads after it. */
const PERIOD_DATE = new RegExp(`${DATE_TEXT}${TIME_TEXT}`, "g")
/**
 * Anything else in the period's own cells that reads as a time ("08h00",
 * "14g30", "14.30", "lúc 14:30", "- 14:30", "8 SA", a following "Giờ/Time"
 * cell): the export may be bounded by a time this parser does not read, so
 * it counts as partial (fail closed).
 */
const TIME_LIKE = /\d{1,2} ?(?::|h|g|gio|\.) ?\d{2}|\d ?(?:am|pm|sa|ch)\b|\b(?:gio|time|luc)\b/
/** A cell that is only a time, or only a time label ("14:30", "8 SA", "Giờ/Time"). */
const TIME_CELL =
  /^(?:\d{1,2} ?(?::|h|g|gio|\.) ?\d{2}(?::\d{2})?(?: ?(?:am|pm|sa|ch))?|\d{1,2} ?(?:am|pm|sa|ch)|(?:gio|time|luc)(?: ?\/ ?(?:gio|time))?)$/
/** A label of a time range on another row above the table ("Từ giờ/From time 08:00"). */
const TIME_RANGE = /\b(tu gio|den gio|from time|to time|gio bat dau|gio ket thuc|start time|end time)\b/
const START_OF_DAY = /^0?0:00(:00)?$/
const END_OF_DAY = /^23:59(:59)?$/
/** "Số dư đầu ngày/Opening balance" in the download; "Số dư đầu kỳ" in the monthly statement. */
const OPENING = /^(so du dau ngay|so du dau ky|opening balance)$/
/** "Số dư cuối ngày/ Closing balance" in the download; "Số dư cuối kỳ/Ending balance" in the statement. */
const CLOSING = /^(so du cuoi ngay|so du cuoi ky|closing balance|ending balance)$/
const CURRENCY = /^(loai tien|currency)$/
/** "Ngày giờ in/Printed on: 02/02/2023 08:45" (monthly statement). */
const PRINTED = /^(ngay gio in|printed on)$/
const UNIT = /\(?\s*vn[dđ]\s*\)?/gi
/**
 * Labels of the summary lines a file may carry outside the table (header
 * block of the download, summary of the monthly statement). After the table
 * only these may hold an amount; any other row with an amount or a date
 * there is refused, so a transaction row is never silently left out.
 */
const SUMMARY =
  /^(so du (dau|cuoi) (ngay|ky)|so du hien tai|tong (ghi no|ghi co|phi|vat|thue gtgt|phat sinh no|phat sinh co|lenh ghi no|lenh ghi co)|(opening|closing|ending|actual) balance|total (debits|credits|fees|vat|debit transaction|credit transaction))$/
/** The period line is short; the pattern runs on this much of a row at most. */
const PERIOD_SCAN_CHARS = 300

/** A file this parser does not recognise, or a cell it cannot read. Messages never carry cell contents. */
export class TcbLayoutError extends Error {
  constructor(
    message: string,
    /** 1-based position among the statement's transactions, when one row is at fault. */
    readonly row?: number
  ) {
    super(message)
    this.name = "TcbLayoutError"
  }
}

function isDate(cell: Cell | undefined): cell is LocalDate {
  return cell !== null && cell !== undefined && typeof cell === "object" && "day" in cell
}

function cellText(cell: Cell | undefined): string {
  if (cell === null || cell === undefined) return ""
  if (typeof cell === "string") return cell.trim()
  if (!isDate(cell)) return cell.number
  // A date the file stored as a date, written back day first.
  const [y, m, d] = cell.day.split("-")
  return cell.time === null ? `${d}/${m}/${y}` : `${d}/${m}/${y} ${cell.time}`
}

/** The labels of a cell: "Nợ/Debit" -> ["no", "debit"]. */
function parts(text: string): string[] {
  return text
    .split(/[/\n]/)
    .map(label)
    .filter((part) => part !== "")
}

function cellDate(cell: Cell | undefined): LocalDate {
  if (isDate(cell)) return cell
  if (typeof cell !== "string") throw new Error("not a date")
  return bankDate(cell)
}

/** Whole VND: a number cell in plain numeric form, or text with thousands separators. */
function cellAmount(cell: Cell | undefined): bigint | null {
  if (cell === undefined || cell === null) return null
  if (isDate(cell)) throw new Error("not an amount")
  if (typeof cell === "object") return wholeNumber(cell.number)
  return vnd(cell.trim())
}

function readsAs(read: () => unknown): boolean {
  try {
    return read() !== null
  } catch {
    return false
  }
}

function isBlank(row: readonly Cell[]): boolean {
  return row.every((cell) => cellText(cell) === "")
}

function headerColumns(row: readonly Cell[]): Partial<Record<Column, number>> | null {
  const found: Partial<Record<Column, number>> = {}
  row.forEach((cell, index) => {
    const names = parts(cellText(cell))
    if (names.length === 0) return
    const columns = new Set(
      names.map((name) => (Object.keys(HEADERS) as Column[]).find((column) => HEADERS[column].includes(name)))
    )
    if (columns.size !== 1) return
    const [column] = [...columns]
    if (column !== undefined && found[column] === undefined) found[column] = index
  })
  return REQUIRED.every((column) => found[column] !== undefined) ? found : null
}

/**
 * The value next to a label outside the table: in the same cell after a
 * colon ("Ngày giờ in/Printed on: 02/02/2023 08:45") or in the next
 * non-empty cell of the row.
 */
function labelled(rows: Grid, pattern: RegExp): Cell | undefined {
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const text = cellText(row[i])
      const colon = text.indexOf(":")
      if (colon > 0 && parts(text.slice(0, colon)).some((p) => pattern.test(p)) && text.slice(colon + 1).trim()) {
        return text.slice(colon + 1).trim()
      }
      if (parts(text).some((p) => pattern.test(p))) {
        return row.slice(i + 1).find((cell) => cellText(cell) !== "") ?? null
      }
    }
  }
  return undefined
}

function balanceAt(rows: Grid, pattern: RegExp): bigint | null {
  const cell = labelled(rows, pattern)
  if (cell === undefined || cell === null) return null
  try {
    return cellAmount(typeof cell === "string" ? cell.replace(UNIT, "") : cell)
  } catch {
    throw new TcbLayoutError("unreadable balance outside the table")
  }
}

interface HeaderPeriod {
  from: string
  to: string
  /** The time stated after each date, if any ("08:00"). */
  fromTime: string | null
  toTime: string | null
  /** Another time-like text on the period line, which this parser cannot place. */
  otherTime: boolean
}

function headerPeriod(rows: Grid): HeaderPeriod | null {
  for (const [index, row] of rows.entries()) {
    // Non-empty cells, folded one by one, so the period's own cells can be
    // told from the rest of the row (a print time, an account name).
    const cells = row.map((cell) => label(cellText(cell))).filter((cell) => cell !== "")
    const text = cells.join(" ")
    const match = PERIOD.exec(text.slice(0, PERIOD_SCAN_CHARS))
    if (!match) continue
    // The period's stretch: from "tu ngay" to the end of the to-date's cell.
    const end = match.index + match[0].length
    let toCell = cells.length - 1
    let offset = 0
    for (const [i, cell] of cells.entries()) {
      if (end <= offset + cell.length) {
        toCell = i
        break
      }
      offset += cell.length + 1
    }
    const stretch = text.slice(match.index, cells.slice(0, toCell + 1).join(" ").length)
    // Cells after it, up to a print-time label: a cell that is only a time
    // (other than 23:59) or a time label bounds the export by a time.
    const after = cells.slice(toCell + 1)
    const printed = after.findIndex((cell) => cell.split("/").some((part) => PRINTED.test(part.trim())))
    const following = printed < 0 ? after : after.slice(0, printed)
    return {
      otherTime:
        TIME_LIKE.test(stretch.replace(PERIOD_DATE, " ")) ||
        following.some((cell) => TIME_CELL.test(cell) && !END_OF_DAY.test(cell)) ||
        rows.some((other, i) => i !== index && other.some((cell) => TIME_RANGE.test(label(cellText(cell))))),
      from: bankDate(match[1]).day,
      fromTime: match[2] ?? null,
      to: bankDate(match[3]).day,
      toTime: match[4] ?? null,
    }
  }
  return null
}

/**
 * What the file says it holds (DOS/Give#57). Without a period line it may be
 * a list of recent transactions; a period starting after midnight leaves out
 * the start of its first day; one ending before 23:59 cuts its last day.
 */
function coverage(period: HeaderPeriod | null): StatementCoverage {
  if (period === null || period.otherTime) return "partial"
  if (period.fromTime !== null && !START_OF_DAY.test(period.fromTime)) return "partial"
  if (period.toTime !== null && !END_OF_DAY.test(period.toTime)) return "ends_early"
  return "full"
}

function printedAt(rows: Grid): Date | null {
  const cell = labelled(rows, PRINTED)
  if (cell === undefined || cell === null) return null
  try {
    return vnInstant(cellDate(cell))
  } catch {
    throw new TcbLayoutError("unreadable print time")
  }
}

interface Entry {
  date: LocalDate
  tx: NormalizedTx
}

function signed(tx: NormalizedTx): bigint {
  return tx.direction === "in" ? tx.amount : -tx.amount
}

function chainBreak(entries: readonly Entry[], opening: bigint): number {
  for (let i = 0; i < entries.length; i++) {
    const before = i === 0 ? opening : entries[i - 1].tx.balanceAfter!
    if (before + signed(entries[i].tx) !== entries[i].tx.balanceAfter) return i
  }
  return -1
}

/**
 * Puts the entries oldest first: the order in which every balance follows
 * from the one before, starting from the opening balance. The file's order
 * and its reverse are tried (exports often list the newest first); dates
 * must agree with the order chosen, and when both orders hold and differ
 * the file is refused rather than one picked.
 */
function oldestFirst(entries: Entry[], opening: bigint): Entry[] {
  const reversed = [...entries].reverse()
  const ascending = (list: readonly Entry[]) => list.every((e, i) => i === 0 || e.date.day >= list[i - 1].date.day)
  const holds = [entries, reversed].filter((list) => ascending(list) && chainBreak(list, opening) < 0)
  if (holds.length === 2 && holds[0].some((entry, i) => entry !== holds[1][i])) {
    throw new TcbLayoutError("row order is ambiguous")
  }
  if (holds.length > 0) return holds[0]
  const inDateOrder = ascending(entries) ? entries : ascending(reversed) ? reversed : null
  if (inDateOrder === null) throw new TcbLayoutError("rows are not in date order")
  const at = chainBreak(inDateOrder, opening)
  // Report the position in the file, whichever way round it is.
  throw new TcbLayoutError("running balance does not add up", inDateOrder === entries ? at + 1 : entries.length - at)
}

const ZERO = BigInt(0)

function magnitude(value: bigint | null): bigint {
  return value === null ? ZERO : value < ZERO ? -value : value
}

/**
 * Reads a Techcombank Business export grid. Throws TcbLayoutError on
 * anything it does not recognise; never returns a partial statement.
 */
export function parseTcbBusinessGrid(grid: Grid): ParsedStatement {
  const headerIndex = grid.findIndex((row) => headerColumns(row) !== null)
  if (headerIndex < 0) throw new TcbLayoutError("no Techcombank Business table header")
  const columns = headerColumns(grid[headerIndex]) as Record<(typeof REQUIRED)[number], number> &
    Partial<Record<Column, number>>
  const headerLabels = grid[headerIndex].map(cellText)
  const above = grid.slice(0, headerIndex)

  // The download states its currency ("Loại tiền/Currency"); without it, a
  // foreign-currency file with "1,000.00" amounts could pass as VND.
  const currency = labelled(above, CURRENCY)
  if (currency === undefined || currency === null || label(cellText(currency)) !== "vnd") {
    throw new TcbLayoutError("not a VND statement")
  }

  const entries: Entry[] = []
  let end = grid.length
  for (let r = headerIndex + 1; r < grid.length; r++) {
    const row = grid[r]
    if (isBlank(row)) continue
    let date: LocalDate
    try {
      date = cellDate(row[columns.date])
    } catch {
      // The first row without a transaction date ends the table.
      end = r
      break
    }
    const position = entries.length + 1
    let debit: bigint | null, credit: bigint | null, fee: bigint | null, vat: bigint | null, balance: bigint | null
    try {
      debit = cellAmount(row[columns.debit])
      credit = cellAmount(row[columns.credit])
      fee = columns.fee === undefined ? null : cellAmount(row[columns.fee])
      vat = columns.vat === undefined ? null : cellAmount(row[columns.vat])
      balance = cellAmount(row[columns.balance])
    } catch {
      throw new TcbLayoutError("unreadable cell", position)
    }
    if (balance === null) throw new TcbLayoutError("row has no balance", position)
    // Money out is Nợ plus the fee and VAT charged with it, as the
    // statement's balance counts them; a sign in those columns only repeats
    // the direction. A credit with a charge on the same row is not
    // documented, so it is refused until a sample shows one.
    const outgoing = magnitude(debit) + magnitude(fee) + magnitude(vat)
    if (credit !== null && credit < ZERO) throw new TcbLayoutError("negative credit", position)
    const incoming = credit ?? ZERO
    if ((outgoing === ZERO) === (incoming === ZERO)) {
      throw new TcbLayoutError("row needs either money in or money out", position)
    }

    const text = (column: Column) => (columns[column] === undefined ? "" : cellText(row[columns[column]!]))
    // Only the columns read above, under their labels in the file: an
    // unrecognised column could hold an account number nothing would mask.
    const cells: Record<string, string> = {}
    for (const index of Object.values(columns) as number[]) {
      const value = cellText(row[index])
      if (headerLabels[index] !== "" && value !== "") cells[headerLabels[index]] = value
    }
    const ref = text("ref")
    entries.push({
      date,
      tx: {
        // hasStableRowId is false until JOY's samples show the transaction
        // number is present and unique on every row; it stays in `raw.ref`.
        providerTxId: null,
        direction: incoming > ZERO ? "in" : "out",
        asset: "VND",
        amount: incoming > ZERO ? incoming : outgoing,
        bookedAt: vnInstant(date),
        bookedDateOnly: date.time === null,
        description: text("description") || null,
        counterpartyName: text("counterpartyName") || null,
        counterpartyAccount: text("counterpartyAccount") || null,
        balanceAfter: balance,
        raw: { sheetRow: r + 1, ...(ref === "" ? {} : { ref }), cells },
      },
    })
  }
  if (entries.length === 0) throw new TcbLayoutError("no transactions")

  // After the table, only summary lines may carry an amount or a date. A
  // row that does means the table was not read to its end (a row with an
  // unreadable or missing date): refuse rather than drop it.
  const after = grid.slice(end)
  for (const row of after) {
    const first = row.find((cell) => cellText(cell) !== "")
    const names = parts(cellText(first))
    if (names.length > 0 && names.every((name) => SUMMARY.test(name) || PRINTED.test(name))) continue
    if (row.some((cell) => readsAs(() => cellAmount(cell)) || readsAs(() => cellDate(cell)))) {
      throw new TcbLayoutError("rows after the end of the table")
    }
  }

  // Both balances are in the download's header block. The opening one
  // checks the first row's amount, the closing one that no row is missing
  // at the end; together with the chain they check every row.
  const outside = [...above, ...after]
  const opening = balanceAt(outside, OPENING)
  const closing = balanceAt(outside, CLOSING)
  if (opening === null || closing === null) throw new TcbLayoutError("no opening or closing balance")
  let period: HeaderPeriod | null
  try {
    period = headerPeriod(above)
  } catch {
    throw new TcbLayoutError("unreadable statement period")
  }

  const rows = oldestFirst(entries, opening)
  const last = rows[rows.length - 1].tx.balanceAfter!
  if (closing !== last) throw new TcbLayoutError("closing balance does not match the last row")
  for (let i = 1; i < rows.length; i++) {
    const [a, b] = [rows[i - 1].date, rows[i].date]
    if (a.time !== null && b.time !== null && `${b.day} ${b.time}` < `${a.day} ${a.time}`) {
      throw new TcbLayoutError("rows are not in time order")
    }
  }

  return {
    coverage: coverage(period),
    periodFrom: period?.from ?? null,
    periodTo: period?.to ?? null,
    openingBalance: opening,
    closingBalance: closing,
    exportedAt: printedAt(outside),
    rows: rows.map((entry) => entry.tx),
  }
}
