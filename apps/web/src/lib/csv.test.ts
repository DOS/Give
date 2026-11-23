import { describe, expect, it } from "vitest"

import { buildCsv, csvFilenameSlug, formatCsvCell, formatCsvRow, neutralizeCsvFormula } from "./csv"

describe("csv formula injection neutralization", () => {
  it.each([
    ["=cmd|'/C calc'!A0", "'=cmd|'/C calc'!A0"],
    ["  =1+1", "'  =1+1"],
    ["\t=SUM(A1:A2)", "'\t=SUM(A1:A2)"],
    ["\tfoo", "'\tfoo"],
    [" \tfoo", "' \tfoo"],
    ["\r=1+1", "'\r=1+1"],
    ["\rfoo", "'\rfoo"],
    ["\n=1+1", "'\n=1+1"],
    ["\u0000=1+1", "'\u0000=1+1"],
    ["\u007f=1+1", "'\u007f=1+1"],
    ["\u00A0=1+1", "'\u00A0=1+1"],
    ["\uFEFF=1+1", "'\uFEFF=1+1"],
    ["+123", "'+123"],
    ["-123", "'-123"],
    ["@SUM(1+1)*cmd|'/C calc'!A0", "'@SUM(1+1)*cmd|'/C calc'!A0"],
  ])("neutralizes %j", (input, expected) => {
    expect(neutralizeCsvFormula(input)).toBe(expected)
  })

  it.each([
    "",
    "   ",
    "  \n  ",
    "500000",
    "0",
    "Mua sách - đợt 1",
    "a+b@example.com",
    "Tỷ lệ = 100%",
    "Chiến dịch Bản Mây",
  ])("leaves safe string %j unchanged", (input) => {
    expect(neutralizeCsvFormula(input)).toBe(input)
  })
})

describe("RFC-4180 cell and row formatting", () => {
  it("quotes fields containing commas, double quotes, LF, or CRLF", () => {
    expect(formatCsvCell("a,b")).toBe('"a,b"')
    expect(formatCsvCell('Nói "minh bạch"')).toBe('"Nói ""minh bạch"""')
    expect(formatCsvCell("dòng 1\ndòng 2")).toBe('"dòng 1\ndòng 2"')
    expect(formatCsvCell("dòng 1\r\ndòng 2")).toBe('"dòng 1\r\ndòng 2"')
  })

  it("neutralizes formulas before applying RFC-4180 quoting", () => {
    expect(formatCsvCell('=HYPERLINK("https://evil.example","Click")')).toBe(
      '"\'=HYPERLINK(""https://evil.example"",""Click"")"'
    )
    expect(formatCsvCell("  =SUM(A1,A2)")).toBe('"\'  =SUM(A1,A2)"')
    expect(formatCsvCell("\r=1+1")).toBe('"\'\r=1+1"')
    expect(formatCsvCell("\n=1+1")).toBe('"\'\n=1+1"')
  })

  it("keeps finite non-negative numbers as unquoted digits and handles nullish/non-finite cells", () => {
    expect(formatCsvCell(500000)).toBe("500000")
    expect(formatCsvCell(0)).toBe("0")
    expect(formatCsvCell(-123)).toBe("'-123")
    expect(formatCsvCell(Number.NaN)).toBe("")
    expect(formatCsvCell(Number.POSITIVE_INFINITY)).toBe("")
    expect(formatCsvCell(null)).toBe("")
    expect(formatCsvCell(undefined)).toBe("")
    expect(formatCsvCell(true)).toBe("true")
  })

  it("preserves Vietnamese Unicode diacritics cleanly", () => {
    expect(formatCsvRow(["Tiếng Việt: ễ, ặ, ỗ, đ, Đ", 1500000])).toBe('"Tiếng Việt: ễ, ặ, ỗ, đ, Đ",1500000')
  })
})

describe("buildCsv", () => {
  it("prepends UTF-8 BOM by default and uses CRLF line endings", () => {
    const csv = buildCsv([
      ["Cột A", "Cột B"],
      ["=1+1", 500000],
    ])
    expect(csv.startsWith("\uFEFF")).toBe(true)
    expect(csv).toBe("\uFEFFCột A,Cột B\r\n'=1+1,500000")
  })

  it("supports disabling BOM and configuring LF newline", () => {
    const csv = buildCsv(
      [
        ["A", "B"],
        [1, 2],
      ],
      { bom: false, newline: "\n" }
    )
    expect(csv).toBe("A,B\n1,2")
  })

  it("handles empty row arrays cleanly", () => {
    expect(buildCsv([])).toBe("\uFEFF")
    expect(buildCsv([], { bom: false })).toBe("")
  })
})

describe("csvFilenameSlug", () => {
  it("keeps valid lowercase slugs and strips unsafe or non-ASCII characters", () => {
    expect(csvFilenameSlug("xay-truong-ban-may")).toBe("xay-truong-ban-may")
    expect(csvFilenameSlug("Chiến dịch Đắk Lắk 2026!")).toBe("chien-dich-dak-lak-2026")
    expect(csvFilenameSlug('../../etc/passwd\r\n"evil')).toBe("etc-passwd-evil")
    expect(csvFilenameSlug("a".repeat(100))).toHaveLength(80)
  })

  it("falls back safely to [a-z0-9-] when input produces nothing", () => {
    expect(csvFilenameSlug("---")).toBe("export")
    expect(csvFilenameSlug("???", "sao-ke")).toBe("sao-ke")
    expect(csvFilenameSlug("???", "///")).toBe("export")
  })
})
