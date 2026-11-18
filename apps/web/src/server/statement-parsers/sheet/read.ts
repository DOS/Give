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

function checkLength(text: string): string {
  if (text.length > MAX_CELL_CHARS) throw new SheetReadError("cell too long")
  return text
}

async function readXlsx(file: Uint8Array): Promise<Grid> {
  // Inflate under a hard cap and rebuild a plain archive first (sheet/zip.ts):
  // the reader itself trusts the sizes the archive declares.
  let archive: Buffer
  try {
    archive = storedZip(unzipXml(file))
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
