import { readSheet } from "read-excel-file/node"

import type { LocalDate } from "./text"

/**
 * Bank statement spreadsheets as a grid of cells, whatever the file type:
 * XLSX (through `read-excel-file`) or CSV (read here). The legacy binary
 * `.xls` format is not read: no npm package reads it without an open
 * advisory, and the banks built so far export CSV or XLSX.
 */

/** One cell: text, a whole or decimal number as written, or a date the file stored as a date. */
export type Cell = string | LocalDate | null
export type Grid = (readonly Cell[])[]

/** A file that is neither a readable XLSX nor a readable CSV. Never carries file contents. */
export class SheetReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SheetReadError"
  }
}

// An XLSX file is a ZIP archive. Statements are small XML; refuse archives
// that would inflate past this, before the reader inflates anything.
const MAX_XLSX_INFLATED_BYTES = 64 * 1024 * 1024
const MAX_XLSX_ENTRIES = 200

function u16(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8)
}

function u32(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)) + bytes[at + 3] * 0x1000000
}

/** True when the bytes start like a ZIP archive ("PK\x03\x04"). */
export function isZip(file: Uint8Array): boolean {
  return file.length >= 4 && file[0] === 0x50 && file[1] === 0x4b && file[2] === 0x03 && file[3] === 0x04
}

/**
 * Reads the archive's central directory and refuses an archive with too
 * many entries, ZIP64 records, or a declared inflated size above the limit,
 * so a small upload cannot inflate into gigabytes of XML.
 */
export function checkZipSize(file: Uint8Array): void {
  // End of central directory: signature 0x06054b50, at most 64 KiB of comment after it.
  let end = -1
  for (let i = file.length - 22; i >= Math.max(0, file.length - 22 - 0xffff); i--) {
    if (u32(file, i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new SheetReadError("not a ZIP archive")
  const entries = u16(file, end + 10)
  const size = u32(file, end + 12)
  const offset = u32(file, end + 16)
  if (entries === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw new SheetReadError("ZIP64 archive")
  if (entries > MAX_XLSX_ENTRIES || offset + size > end) throw new SheetReadError("unexpected ZIP archive")
  let at = offset
  let inflated = 0
  for (let n = 0; n < entries; n++) {
    if (at + 46 > end || u32(file, at) !== 0x02014b50) throw new SheetReadError("broken ZIP directory")
    inflated += u32(file, at + 24)
    if (inflated > MAX_XLSX_INFLATED_BYTES) throw new SheetReadError("ZIP archive too large once inflated")
    at += 46 + u16(file, at + 28) + u16(file, at + 30) + u16(file, at + 32)
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * A date cell as its local wall-clock date. `read-excel-file` turns the
 * Excel serial into a Date whose UTC fields are the wall-clock fields
 * (Excel dates carry no time zone), so those are read back as local
 * Asia/Ho_Chi_Minh time. Midnight exactly counts as a date without time.
 */
function dateCell(value: Date): LocalDate {
  if (!Number.isFinite(value.getTime())) throw new SheetReadError("unreadable date cell")
  const day = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
  const [h, m, s] = [value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds()]
  return { day, time: h === 0 && m === 0 && s === 0 ? null : `${pad(h)}:${pad(m)}:${pad(s)}` }
}

async function readXlsx(file: Uint8Array): Promise<Grid> {
  checkZipSize(file)
  let rows: unknown[][]
  try {
    // A Buffer, never a string: the reader takes a string as a file path.
    // Numbers come back as the digits the file stores, so no amount passes
    // through a float.
    rows = (await readSheet(Buffer.from(file), { parseNumber: (text: string) => text, trim: false })) as unknown[][]
  } catch {
    throw new SheetReadError("unreadable XLSX file")
  }
  return rows.map((row) =>
    row.map((value): Cell => {
      if (value === null || value === undefined) return null
      if (typeof value === "string") return value
      if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
      if (value instanceof Date) return dateCell(value)
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
  let i = 0
  const body = text.replace(/^﻿/, "")
  while (i < body.length) {
    const c = body[i]
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (c === '"') quoted = false
      else field += c
      i++
      continue
    }
    if (c === '"' && field === "") quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      if (c === "\r" && body[i + 1] === "\n") i++
    } else field += c
    i++
  }
  if (quoted) throw new SheetReadError("unterminated quote in CSV")
  if (field !== "" || row.length > 0) {
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
  return parseCsv(text, guessDelimiter(text)).map((row) => row.map((field) => (field === "" ? null : field)))
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
