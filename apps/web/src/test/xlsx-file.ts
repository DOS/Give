import { crc32, deflateRawSync } from "node:zlib"

/**
 * A minimal XLSX writer for statement parser fixtures and tests, so fixture
 * files can be rebuilt from readable source. Test-only: the app never writes
 * spreadsheets.
 *
 * Cells: a string (an inline string), `{ n: "1500000" }` (a number, written
 * as given), `{ date: "2026-11-02T08:15:00" }` (an Excel date serial shown
 * as dd/mm/yyyy hh:mm:ss), or null (no cell).
 */
export type XlsxCell = string | { n: string } | { date: string } | null

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function column(index: number): string {
  let name = ""
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

/** Days since 1899-12-30 (the Excel 1900 date system), wall-clock fields taken as given, as Excel stores it. */
function serial(wallClock: string): string {
  const ms = Date.parse(`${wallClock}Z`)
  if (!Number.isFinite(ms)) throw new Error(`bad fixture date ${wallClock}`)
  // Excel keeps 15 significant digits, so a serial is rarely the exact time.
  return String(Number(((ms - Date.UTC(1899, 11, 30)) / 86400000).toPrecision(15)))
}

function cellXml(cell: XlsxCell, ref: string): string {
  if (cell === null) return ""
  if (typeof cell === "string")
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escape(cell)}</t></is></c>`
  if ("n" in cell) return `<c r="${ref}"><v>${cell.n}</v></c>`
  return `<c r="${ref}" s="1"><v>${serial(cell.date)}</v></c>`
}

function sheetXml(rows: readonly (readonly XlsxCell[])[]): string {
  const body = rows
    .map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => cellXml(cell, `${column(c)}${r + 1}`)).join("")}</row>`)
    .join("")
  return `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

const STYLES = `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm:ss"/></numFmts><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`

function parts(sheetName: string, rows: readonly (readonly XlsxCell[])[]): [string, string][] {
  return [
    [
      "[Content_Types].xml",
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", sheetXml(rows)],
  ]
}

/** A one-sheet XLSX file (deflated ZIP entries, fixed timestamps, so the bytes are reproducible). */
export function xlsxFile(rows: readonly (readonly XlsxCell[])[], sheetName = "Sheet1"): Uint8Array {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, text] of parts(sheetName, rows)) {
    const nameBytes = Buffer.from(name, "utf8")
    const data = Buffer.from(text, "utf8")
    const packed = deflateRawSync(data)
    const crc = crc32(data)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x0800, 6) // UTF-8 names
    header.writeUInt16LE(8, 8) // deflate
    header.writeUInt16LE(0, 10)
    header.writeUInt16LE(0x5b71, 12) // 2025-11-17
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(packed.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(nameBytes.length, 26)
    header.writeUInt16LE(0, 28)
    local.push(header, nameBytes, packed)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    header.copy(entry, 8, 6, 30)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBytes)
    offset += header.length + nameBytes.length + packed.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(central.length / 2, 8)
  end.writeUInt16LE(central.length / 2, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...local, directory, end]))
}
