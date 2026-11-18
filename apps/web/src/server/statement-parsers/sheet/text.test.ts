import { describe, expect, it } from "vitest"

import { bankDate, dayFirstDate, label, vnd, vnInstant, wholeNumber } from "./text"

describe("label", () => {
  it.each([
    ["Số dư đầu kỳ (VND):", "so du dau ky"],
    ["  Ngày  giao dịch ", "ngay giao dich"],
    ["ĐIỆN GIẢI", "dien giai"],
    ["Ghi có (VNĐ)", "ghi co"],
  ])("%j -> %j", (text, expected) => {
    expect(label(text)).toBe(expected)
  })
})

describe("label on hostile input", () => {
  it("stays linear on a long run of colons", () => {
    const started = performance.now()
    expect(label(`${":".repeat(200000)}x`)).toBe(`${":".repeat(200000)}x`)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})

describe("wholeNumber", () => {
  it.each([
    ["1500000", BigInt(1500000)],
    ["500.000", BigInt(500)],
    ["1.05E7", BigInt(10500000)],
    ["1.5e3", BigInt(1500)],
    ["-1200", BigInt(-1200)],
    ["0", BigInt(0)],
    ["120000E-2", BigInt(1200)],
  ] as const)("reads %j", (text, expected) => {
    expect(wholeNumber(text)).toBe(expected)
  })

  it.each(["1,500,000", "1.5", "1.05E1", "12E-2", "1e40", "", "abc", "1.2.3"])("refuses %j", (text) => {
    expect(() => wholeNumber(text)).toThrow()
  })
})

describe("vnd", () => {
  it.each([
    ["1.500.000", BigInt(1500000)],
    ["1,500,000", BigInt(1500000)],
    ["1,500,000.00", BigInt(1500000)],
    ["1.500.000,00", BigInt(1500000)],
    ["1500000", BigInt(1500000)],
    ["100.00", BigInt(100)],
    ["-2.000", BigInt(-2000)],
    [" 20 000 ", BigInt(20000)],
    [20000, BigInt(20000)],
  ] as const)("reads %j", (cell, expected) => {
    expect(vnd(cell)).toBe(expected)
  })

  it.each([null, "", "-"] as const)("reads %j as empty", (cell) => {
    expect(vnd(cell)).toBeNull()
  })

  it.each(["1,5", "1.000,50", "1.0000", "12,34,567", "1.000,000", "abc", "1e5", 1.5, 2 ** 60])("refuses %j", (cell) => {
    expect(() => vnd(cell)).toThrow()
  })
})

describe("dayFirstDate", () => {
  it("reads the day first, never the month", () => {
    expect(dayFirstDate("03/04/2026")).toEqual({ day: "2026-04-03", time: null })
    expect(dayFirstDate("17-11-2026")).toEqual({ day: "2026-11-17", time: null })
    expect(dayFirstDate("02-04-14")).toEqual({ day: "2014-04-02", time: null })
  })

  it("keeps a time of day when the cell has one", () => {
    expect(dayFirstDate("17/11/2026 08:05")).toEqual({ day: "2026-11-17", time: "08:05:00" })
    expect(dayFirstDate("7/1/2026 23:59:09")).toEqual({ day: "2026-01-07", time: "23:59:09" })
  })

  it.each(["31/02/2026", "17/13/2026", "2026-11-17", "17/11-2026", "17/11/202", "17/11/2026 24:00", "hôm nay"])(
    "refuses %j",
    (text) => {
      expect(() => dayFirstDate(text)).toThrow()
    }
  )
})

describe("bankDate", () => {
  it("reads ISO dates and day-first dates", () => {
    expect(bankDate("2025-09-01")).toEqual({ day: "2025-09-01", time: null })
    expect(bankDate("2025-09-01 08:05")).toEqual({ day: "2025-09-01", time: "08:05:00" })
    expect(bankDate("01/09/2025")).toEqual({ day: "2025-09-01", time: null })
  })

  it.each(["2025-13-01", "2025-9-1", "2025/09/01"])("refuses %j", (text) => {
    expect(() => bankDate(text)).toThrow()
  })
})

describe("vnInstant", () => {
  it("reads local dates as Asia/Ho_Chi_Minh", () => {
    expect(vnInstant({ day: "2026-11-17", time: null }).toISOString()).toBe("2026-11-16T17:00:00.000Z")
    expect(vnInstant({ day: "2026-11-17", time: "08:05:00" }).toISOString()).toBe("2026-11-17T01:05:00.000Z")
  })
})
