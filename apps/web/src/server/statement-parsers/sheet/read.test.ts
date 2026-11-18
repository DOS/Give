import { describe, expect, it } from "vitest"

import { xlsxFile } from "@/test/xlsx-file"

import { checkZipSize, parseCsv, readGrid, SheetReadError } from "./read"

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
      [{ day: "2026-11-02", time: "08:15:30" }, "1500000", "Ủng hộ đồng bào & bà con", null],
      [{ day: "2026-11-03", time: null }, "123456789012", null, "x"],
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

  it("refuses an archive that declares too much inflated data", () => {
    const file = xlsxFile([["a"]])
    const view = Buffer.from(file.buffer, file.byteOffset, file.byteLength)
    const directory = view.readUInt32LE(file.length - 22 + 16)
    view.writeUInt32LE(0x7fffffff, directory + 24) // first entry's uncompressed size
    expect(() => checkZipSize(file)).toThrow("too large once inflated")
  })

  it("refuses a truncated archive", async () => {
    const file = xlsxFile([["a"]])
    await expect(readGrid(file.slice(0, file.length - 30))).rejects.toThrow("not a ZIP archive")
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
  ])("refuses %s", async (_, file) => {
    await expect(readGrid(file)).rejects.toBeInstanceOf(SheetReadError)
  })
})
