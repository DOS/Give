import { describe, expect, it } from "vitest"

import { xlsxFile } from "@/test/xlsx-file"

import { dateCell, MAX_CELL_CHARS, parseCsv, readGrid, SheetReadError } from "./read"

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

describe("dateCell", () => {
  it("rounds to the nearest second, so a serial just short of midnight is the next day", () => {
    expect(dateCell(new Date(Date.UTC(2026, 10, 2) - 1))).toEqual({ day: "2026-11-02", time: null })
    expect(dateCell(new Date(Date.UTC(2026, 10, 2, 9, 15, 1, 999)))).toEqual({ day: "2026-11-02", time: "09:15:02" })
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
    ["Windows-1258 text", new Uint8Array([0x4e, 0x67, 0xe0, 0x79])],
    ["an old binary .xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00])],
    ["an empty file", new Uint8Array()],
    ["a cell longer than any statement cell", text(`a,${"x".repeat(MAX_CELL_CHARS + 1)}\n`)],
  ])("refuses %s", async (_, file) => {
    await expect(readGrid(file)).rejects.toBeInstanceOf(SheetReadError)
  })
})
