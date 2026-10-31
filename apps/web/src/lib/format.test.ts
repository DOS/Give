import { describe, expect, it } from "vitest"

import { daysLeft, formatDate, formatVnd, parseVnd, progressPercent, toVietnamLocalInput } from "./format"

describe("formatVnd", () => {
  it("formats whole đồng the Vietnamese way", () => {
    expect(formatVnd(1_500_000).replace(/\s/g, " ")).toBe("1.500.000 ₫")
    expect(formatVnd("10000").replace(/\s/g, " ")).toBe("10.000 ₫")
  })
})

describe("parseVnd", () => {
  it("accepts common ways of typing an amount", () => {
    expect(parseVnd("1.500.000")).toBe(1_500_000)
    expect(parseVnd("1,500,000")).toBe(1_500_000)
    expect(parseVnd(" 1 500 000 đ")).toBe(1_500_000)
    expect(parseVnd("50000₫")).toBe(50_000)
  })

  it("rejects anything that is not a positive whole number", () => {
    for (const input of ["", "0", "-5", "abc", "1e6", "12.5k", "9".repeat(20)]) {
      expect(parseVnd(input), input).toBeNull()
    }
  })
})

describe("toVietnamLocalInput", () => {
  it("shows UTC times in Vietnam time", () => {
    expect(toVietnamLocalInput("2026-11-01T02:00:00Z")).toBe("2026-11-01T09:00")
    expect(toVietnamLocalInput("2026-12-31T20:30:00.000Z")).toBe("2027-01-01T03:30")
  })

  it("returns an empty value for missing or bad input", () => {
    expect(toVietnamLocalInput(null)).toBe("")
    expect(toVietnamLocalInput("not a date")).toBe("")
  })
})

describe("formatDate", () => {
  it("uses the Vietnam calendar day", () => {
    expect(formatDate("2026-12-31T20:00:00Z")).toBe("01/01/2027")
    expect(formatDate(null)).toBe("—")
  })
})

describe("daysLeft", () => {
  const now = new Date("2026-11-01T00:00:00Z")

  it("rounds partial days up and never goes negative", () => {
    expect(daysLeft("2026-11-01T01:00:00Z", now)).toBe(1)
    expect(daysLeft("2026-11-11T00:00:00Z", now)).toBe(10)
    expect(daysLeft("2026-10-01T00:00:00Z", now)).toBe(0)
    expect(daysLeft(null, now)).toBeNull()
  })
})

describe("progressPercent", () => {
  it("rounds down and caps at 100", () => {
    expect(progressPercent(0, 1000)).toBe(0)
    expect(progressPercent(999, 1000)).toBe(99)
    expect(progressPercent(5000, 1000)).toBe(100)
    expect(progressPercent(10, 0)).toBe(0)
  })
})
