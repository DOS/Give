import { readSheet } from "read-excel-file/node"

import type { LocalDate } from "./text"
import { isZip, storedZip, unzipXml, ZipError } from "./zip"

/**
 * Bank statement spreadsheets as a grid of cells, whatever the file type:
 * XLSX (unpacked under a size cap by `./zip`, then read by
 * `read-excel-file`) or CSV (read here). The legacy binary
 * `.xls` format is not read: no npm package reads it without an open
 * advisory, and the banks built so far export CSV or XLSX.
 */

/** A number cell of an XLSX file, as the digits the file stores ("1500000", "500.000", "1.05E7"). */
export interface NumberCell {
  number: string
}

/** One cell: text, a number cell, or a date the file stored as a date. */
export type Cell = string | NumberCell | LocalDate | null
export type Grid = (readonly Cell[])[]

/** A file that is neither a readable XLSX nor a readable CSV. Never carries file contents. */
export class SheetReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SheetReadError"
  }
}

/** No statement cell is this long; refusing early keeps every later pattern cheap. */
export const MAX_CELL_CHARS = 5000

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * A date cell as its local wall-clock date. `read-excel-file` turns the
 * Excel serial into a Date whose UTC fields are the wall-clock fields
 * (Excel dates carry no time zone), rounding down; Excel stores serials to
 * 15 significant digits, so 09:15:02 can arrive as 09:15:01.9996. The time
 * is rounded to the nearest second first. Midnight exactly counts as a
 * date without time.
 */
export function dateCell(value: Date): LocalDate {
  if (!Number.isFinite(value.getTime())) throw new SheetReadError("unreadable date cell")
  const at = new Date(Math.round(value.getTime() / 1000) * 1000)
  const day = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`
  const [h, m, s] = [at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds()]
  return { day, time: h === 0 && m === 0 && s === 0 ? null : `${pad(h)}:${pad(m)}:${pad(s)}` }
}

/**
 * Bounds of a worksheet the reader may build. `read-excel-file` trusts the
 * row and cell numbers in the XML: it adds an empty row for every skipped
 * row number and pads every row to the widest column, so `<row r="50000000">`
 * in a 2 KB file would exhaust memory. Statements hold at most 5000 rows
 * (statement-import MAX_ROWS) and a dozen columns.
 */
export const MAX_SHEET_ROWS = 20000
export const MAX_SHEET_COLUMNS = 100

const NAME = /[\w.:-]*/y
const ATTRIBUTE = /(?:^|\s)(?:[A-Za-z_][\w.-]*:)?(r|t|ref)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const SHEET_TAGS = new Set(["row", "c", "dimension"])

/**
 * Every start tag named row, c or dimension (namespace prefix dropped, as
 * the reader drops it) with its attribute text, in one pass over the XML:
 * each character is read once, quotes are honoured, so no input makes it
 * slow. Tags inside comments or CDATA are included, which only over-checks.
 */
function* sheetTags(xml: string): Generator<[string, string]> {
  let i = xml.indexOf("<")
  while (i >= 0) {
    NAME.lastIndex = i + 1
    NAME.exec(xml)
    const nameEnd = NAME.lastIndex
    const name = xml.slice(i + 1, nameEnd)
    let end = nameEnd
    let quote = ""
    for (; end < xml.length; end++) {
      const c = xml[end]
      if (quote) {
        if (c === quote) quote = ""
      } else if (c === '"' || c === "'") quote = c
      else if (c === ">") break
    }
    const local = name.slice(name.lastIndexOf(":") + 1)
    if (SHEET_TAGS.has(local) && /^[\s/>]?$/.test(xml.charAt(nameEnd))) yield [local, xml.slice(nameEnd, end)]
    i = xml.indexOf("<", end + 1)
  }
}

function columnNumber(letters: string): number {
  let n = 0
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64)
  return n
}

/** A cell address within the bounds ("L5000"), or throws. */
function checkAddress(address: string): void {
  const match = /^([A-Z]{1,3})(\d{1,7})$/.exec(address)
  if (!match || columnNumber(match[1]) > MAX_SHEET_COLUMNS || Number(match[2]) > MAX_SHEET_ROWS) {
    throw new SheetReadError("worksheet larger than a statement")
  }
}

/**
 * Checks the XML of every part of a workbook before the reader parses it:
 * at most MAX_SHEET_ROWS rows, every row and cell address within the
 * bounds, a `<dimension>` within them, and no date (`t="d"`) or error
 * (`t="e"`) cells. A date cell holds a zoneless ISO text the reader parses
 * in the server's time zone; an error cell (#N/A, #REF!) would silently
 * read as empty and could hide a donation code. The scan matches more than
 * the XML parser would (tags inside comments, say), which can only refuse
 * a file, never let one through.
 */
export function checkSheetXml(xml: string): void {
  let rows = 0
  for (const [tag, attributes] of sheetTags(xml)) {
    const values = new Map<string, string>()
    for (const [, name, double, single] of attributes.matchAll(ATTRIBUTE)) {
      const value = double ?? single
      // The reader decodes entities; real files never put one in these.
      if (value.includes("&")) throw new SheetReadError("entity in a cell address")
      values.set(name, value)
    }
    if (tag === "row") {
      rows++
      const r = values.get("r")
      if (rows > MAX_SHEET_ROWS || (r !== undefined && !(/^\d{1,7}$/.test(r) && Number(r) <= MAX_SHEET_ROWS))) {
        throw new SheetReadError("worksheet larger than a statement")
      }
    } else if (tag === "c") {
      const r = values.get("r")
      if (r !== undefined) checkAddress(r)
      const type = values.get("t")
      if (type === "d") throw new SheetReadError("date cell stored as text")
      if (type === "e") throw new SheetReadError("error cell")
    } else {
      for (const address of (values.get("ref") ?? "").split(":")) checkAddress(address)
    }
  }
}

function checkLength(text: string): string {
  if (text.length > MAX_CELL_CHARS) throw new SheetReadError("cell too long")
  return text
}

async function readXlsx(file: Uint8Array): Promise<Grid> {
  // Inflate under a hard cap and rebuild a plain archive first (sheet/zip.ts):
  // the reader itself trusts the sizes the archive declares.
  let archive: Buffer
  try {
    const entries = unzipXml(file)
    for (const entry of entries) checkSheetXml(entry.data.toString("utf8"))
    archive = storedZip(entries)
  } catch (err) {
    if (err instanceof ZipError) throw new SheetReadError(err.message)
    throw err
  }
  let rows: unknown[][]
  try {
    // A Buffer, never a string: the reader takes a string as a file path.
    // Number cells come back as the text the file stores, marked as numbers,
    // so no amount passes through a float or a locale's separators.
    rows = (await readSheet(archive, {
      parseNumber: (text: string): NumberCell => ({ number: text }),
      trim: false,
    })) as unknown[][]
  } catch {
    throw new SheetReadError("unreadable XLSX file")
  }
  return rows.map((row) =>
    row.map((value): Cell => {
      if (value === null || value === undefined) return null
      if (typeof value === "string") return checkLength(value)
      if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
      if (value instanceof Date) return dateCell(value)
      if (typeof value === "object" && typeof (value as NumberCell).number === "string") {
        return { number: checkLength((value as NumberCell).number) }
      }
      throw new SheetReadError("unexpected XLSX cell")
    })
  )
}

/** UTF-8 (with or without a byte order mark) or UTF-16LE with its mark, as Excel saves CSV. */
function decodeText(file: Uint8Array): string {
  try {
    if (file[0] === 0xff && file[1] === 0xfe) return new TextDecoder("utf-16le", { fatal: true }).decode(file)
    return new TextDecoder("utf-8", { fatal: true }).decode(file)
  } catch {
    throw new SheetReadError("CSV is neither UTF-8 nor UTF-16")
  }
}

/** Splits CSV text into rows of fields (RFC 4180: quoted fields, doubled quotes, CRLF or LF). */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  // A quoted field just closed: only a delimiter or a line end may follow.
  let closed = false
  let i = 0
  const body = text.replace(/^\ufeff/, "")
  while (i < body.length) {
    const c = body[i]
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (c === '"') {
        quoted = false
        closed = true
      } else field += c
      i++
      continue
    }
    if (c === delimiter) {
      row.push(field)
      field = ""
      closed = false
    } else if (c === "\n" || c === "\r") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      closed = false
      if (c === "\r" && body[i + 1] === "\n") i++
    } else if (closed) throw new SheetReadError("text after a closing quote in CSV")
    else if (c === '"' && field === "") quoted = true
    else field += c
    i++
  }
  if (quoted) throw new SheetReadError("unterminated quote in CSV")
  if (field !== "" || closed || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** The delimiter that splits the most lines into the same number (2 or more) of fields. */
function guessDelimiter(text: string): string {
  let best = ","
  let bestScore = 0
  for (const delimiter of [",", ";", "\t"]) {
    let rows: string[][]
    try {
      rows = parseCsv(text, delimiter).filter((r) => r.length > 1)
    } catch {
      continue
    }
    const widest = Math.max(0, ...rows.map((r) => r.length))
    const score = rows.filter((r) => r.length === widest).length * widest
    if (score > bestScore) [best, bestScore] = [delimiter, score]
  }
  return best
}

function readCsv(file: Uint8Array): Grid {
  const text = decodeText(file)
  if (/\u0000/.test(text)) throw new SheetReadError("binary file")
  return parseCsv(text, guessDelimiter(text)).map((row) =>
    row.map((field) => (field === "" ? null : checkLength(field)))
  )
}

/**
 * Reads a statement file into a grid: XLSX when it is a ZIP archive, CSV
 * otherwise. Only the first sheet of a workbook is read. Throws
 * SheetReadError on a file it cannot read.
 */
export async function readGrid(file: Uint8Array): Promise<Grid> {
  if (file.length === 0) throw new SheetReadError("empty file")
  return isZip(file) ? readXlsx(file) : readCsv(file)
}
