import { describe, expect, it } from "vitest"

import { xlsxFile, xlsxFromSheetData } from "@/test/xlsx-file"

import {
  checkSheetXml,
  dateCell,
  MAX_CELL_CHARS,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  parseCsv,
  readGrid,
  SheetReadError,
} from "./read"

const text = (s: string) => new TextEncoder().encode(s)

describe("readGrid on XLSX", () => {
  it("reads strings, numbers as written and date cells as local dates", async () => {
    const file = xlsxFile([
      ["Ngày giao dịch", "Số tiền", "Mô tả"],
      [{ date: "2026-11-02T08:15:30" }, { n: "1500000" }, "Ủng hộ đồng bào & bà con"],
      [{ date: "2026-11-03T00:00:00" }, { n: "123456789012" }, null, "x"],
    ])
    expect(await readGrid(file)).toEqual([
      ["Ngày giao dịch", "Số tiền", "Mô tả", null],
      [{ day: "2026-11-02", time: "08:15:30" }, { number: "1500000" }, "Ủng hộ đồng bào & bà con", null],
      [{ day: "2026-11-03", time: null }, { number: "123456789012" }, null, "x"],
    ])
  })

  it("refuses a ZIP that is not a workbook", async () => {
    // The same archive with its workbook renamed away (in the entry and the directory).
    const file = Buffer.from(xlsxFile([["a"]]))
    for (let at = file.indexOf("xl/workbook.xml"); at >= 0; at = file.indexOf("xl/workbook.xml", at + 1)) {
      file.write("xl/workbooq.xml", at)
    }
    await expect(readGrid(file)).rejects.toBeInstanceOf(SheetReadError)
  })

  it("refuses a truncated archive", async () => {
    const file = xlsxFile([["a"]])
    await expect(readGrid(file.slice(0, file.length - 30))).rejects.toThrow("not a ZIP archive")
  })

  it("keeps the number text a file stores, without reading separators into it", async () => {
    const file = xlsxFile([[{ n: "500.000" }, { n: "1.05E7" }, { n: "-1200" }]])
    expect(await readGrid(file)).toEqual([[{ number: "500.000" }, { number: "1.05E7" }, { number: "-1200" }]])
  })

  it("reads a 15-digit Excel serial to the right second", async () => {
    // 09:15:02 as Excel stores it; read-excel-file alone rounds it down to 09:15:01.
    const file = xlsxFile([[{ date: "2026-11-02T09:15:02" }, { date: "2026-11-02T23:59:59" }]])
    expect(await readGrid(file)).toEqual([
      [
        { day: "2026-11-02", time: "09:15:02" },
        { day: "2026-11-02", time: "23:59:59" },
      ],
    ])
  })

  it("refuses a cell longer than any statement cell", async () => {
    await expect(readGrid(xlsxFile([["x".repeat(MAX_CELL_CHARS + 1)]]))).rejects.toThrow("cell too long")
  })
})

describe("readGrid refuses worksheets larger than a statement, before the reader builds them", () => {
  const cell = (r: string, value = "x") => `<c r="${r}" t="inlineStr"><is><t>${value}</t></is></c>`

  it("reads a sheet within the bounds", async () => {
    const file = xlsxFromSheetData(
      `<row r="1">${cell("A1")}</row><row r="${MAX_SHEET_ROWS}">${cell(`CV${MAX_SHEET_ROWS}`)}</row>`
    )
    const grid = await readGrid(file)
    expect(grid).toHaveLength(MAX_SHEET_ROWS)
    expect(grid[MAX_SHEET_ROWS - 1][MAX_SHEET_COLUMNS - 1]).toBe("x")
  })

  it.each([
    ["a sparse huge row number", `<row r="1">${cell("A1")}</row><row r="50000000">${cell("A50000000")}</row>`],
    ["a row number past the bound", `<row r="${MAX_SHEET_ROWS + 1}"></row>`],
    ["a cell in a far column", `<row r="1">${cell("XFD1")}</row>`],
    ["a cell in a far row of an unnumbered row", `<row>${cell("A2000000")}</row>`],
    ["more row elements than the bound", "<row/>".repeat(MAX_SHEET_ROWS + 1)],
    ["a namespace-prefixed row", `<x:row xmlns:x="urn:x" x:r="50000000"></x:row>`],
    ["an entity in a row number", `<row r="&#53;0000000"></row>`],
    [
      "a quoted '>' before the address",
      `<row r="1"><c foo=">" r="A99999999" t="inlineStr"><is><t>x</t></is></c></row>`,
    ],
    ["a date cell stored as text", `<row r="1"><c r="A1" t="d"><v>2026-11-17T03:00:00</v></c></row>`],
    ["an error cell", `<row r="1"><c r="A1" t="e"><v>#N/A</v></c></row>`],
    // Shapes the reader and a looser scan would read differently.
    ["a prefixed row number before a plain one", `<row x:r="60000" r="2"></row>`],
    [
      "a prefixed cell address before a plain one",
      `<row r="1"><c x:r="XFD1" r="A1" t="inlineStr"><is><t>x</t></is></c></row>`,
    ],
    [
      "a prefixed date type before a plain one",
      `<row r="1"><c r="A1" x:t="d" t="n"><v>2026-11-02T09:00:00</v></c></row>`,
    ],
    ["an unbalanced quote hiding later tags", `<foo a='b></foo><row r="60000"></row>`],
    ["a comment", `<!-- it's --><row r="1">${'<c r="A1"/>'}</row>`],
    ["CDATA", `<row r="1"><c r="A1" t="inlineStr"><is><t><![CDATA[x]]></t></is></c></row>`],
    ["a processing instruction", `<?x y?><row r="1"></row>`],
    ["an unquoted attribute", `<row r=1></row>`],
  ])("refuses %s", async (_, sheetData) => {
    await expect(readGrid(xlsxFromSheetData(sheetData))).rejects.toBeInstanceOf(SheetReadError)
  })

  it("refuses a dimension past the bounds", async () => {
    const file = xlsxFromSheetData(`<row r="1">${cell("A1")}</row>`, '<dimension ref="A1:XFD1048576"/>')
    await expect(readGrid(file)).rejects.toThrow("worksheet larger than a statement")
  })

  it("scans hostile XML in linear time", () => {
    const started = performance.now()
    for (const xml of [
      '<c a="'.repeat(200000),
      "<".repeat(1000000),
      `<row${" ".repeat(1000000)}x>`,
      `<row r="1"${" r".repeat(300000)}>`,
    ]) {
      expect(() => checkSheetXml(xml)).toThrow(SheetReadError)
    }
    expect(performance.now() - started).toBeLessThan(2000)
  })
})

describe("readGrid on XLSX under another time zone", () => {
  it("reads date cells the same as under UTC", async () => {
    const before = process.env.TZ
    process.env.TZ = "Asia/Ho_Chi_Minh"
    try {
      expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-420)
      const grid = await readGrid(xlsxFile([[{ date: "2026-11-02T09:15:02" }, { date: "2026-11-03T00:00:00" }]]))
      expect(grid).toEqual([
        [
          { day: "2026-11-02", time: "09:15:02" },
          { day: "2026-11-03", time: null },
        ],
      ])
    } finally {
      if (before === undefined) delete process.env.TZ
      else process.env.TZ = before
    }
  })
})

describe("dateCell", () => {
  it("rounds to the nearest second, so a serial just short of midnight is the next day", () => {
    expect(dateCell(new Date(Date.UTC(2026, 10, 2) - 1))).toEqual({ day: "2026-11-02", time: null })
    expect(dateCell(new Date(Date.UTC(2026, 10, 2, 9, 15, 1, 999)))).toEqual({ day: "2026-11-02", time: "09:15:02" })
  })

  it("keeps a time from 23:59:59.5 on its own day (DOS/Give#57)", () => {
    expect(dateCell(new Date(Date.UTC(2026, 10, 1, 23, 59, 59, 500)))).toEqual({ day: "2026-11-01", time: "23:59:59" })
    expect(dateCell(new Date(Date.UTC(2026, 10, 1, 23, 59, 59, 998)))).toEqual({ day: "2026-11-01", time: "23:59:59" })
  })
})

describe("readGrid on CSV", () => {
  it("reads UTF-8 with a byte order mark, quotes and CRLF", async () => {
    const csv = '﻿Ngày,Mô tả,Số tiền\r\n02/11/2026,"Ủng hộ, ""GV7K2M9QH""",1.500.000\r\n'
    expect(await readGrid(text(csv))).toEqual([
      ["Ngày", "Mô tả", "Số tiền"],
      ["02/11/2026", 'Ủng hộ, "GV7K2M9QH"', "1.500.000"],
    ])
  })

  it("reads UTF-16LE as Excel saves Unicode text, with tabs", async () => {
    const body = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("Ngày\tMô tả\r\n02/11/2026\tPhí\r\n", "utf16le"),
    ])
    expect(await readGrid(new Uint8Array(body))).toEqual([
      ["Ngày", "Mô tả"],
      ["02/11/2026", "Phí"],
    ])
  })

  it("finds a semicolon delimiter", async () => {
    expect(await readGrid(text("a;b;c\n1;2,5;3\n"))).toEqual([
      ["a", "b", "c"],
      ["1", "2,5", "3"],
    ])
  })

  it("keeps a line break inside a quoted field", () => {
    expect(parseCsv('a,"x\ny"\n', ",")).toEqual([["a", "x\ny"]])
  })

  it.each([
    ["an unterminated quote", text('a,"b\n')],
    ["text after a closing quote", text('"a"b,c\n')],
    ["Windows-1258 text", new Uint8Array([0x4e, 0x67, 0xe0, 0x79])],
    ["an old binary .xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00])],
    ["an empty file", new Uint8Array()],
    ["a cell longer than any statement cell", text(`a,${"x".repeat(MAX_CELL_CHARS + 1)}\n`)],
  ])("refuses %s", async (_, file) => {
    await expect(readGrid(file)).rejects.toBeInstanceOf(SheetReadError)
  })
})
