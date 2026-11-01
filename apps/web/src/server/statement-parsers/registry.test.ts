import { describe, expect, it } from "vitest"

import { StatementImportError } from "@/server/channels/statement-import/errors"
import { csvStatementParser } from "@/test/csv-statement-parser"

import { statementParsers } from "."
import { assertSupportedFormat, ParserRegistry } from "./registry"

describe("ParserRegistry", () => {
  it("accepts formats with a stable row id, a running balance or both", () => {
    const registry = new ParserRegistry([
      csvStatementParser({ name: "ids-only", hasStableRowId: true, hasRunningBalance: false }),
      csvStatementParser({ name: "balance-only", hasStableRowId: false, hasRunningBalance: true }),
      csvStatementParser({ name: "both", bankBins: ["970436", "970415"] }),
    ])
    expect(registry.get("ids-only")?.name).toBe("ids-only")
    expect(registry.get("missing")).toBeUndefined()
    expect(registry.forBank("970415").map((p) => p.name)).toEqual(["both"])
    expect(registry.forBank("970436").map((p) => p.name)).toEqual(["ids-only", "balance-only", "both"])
  })

  it("refuses a format with neither a stable row id nor a running balance", () => {
    const parser = csvStatementParser({ hasStableRowId: false, hasRunningBalance: false })
    expect(() => new ParserRegistry([parser])).toThrow(StatementImportError)
    expect(() => assertSupportedFormat(parser)).toThrow("STATEMENT_FORMAT_UNSUPPORTED")
  })

  it("refuses flags that are not booleans", () => {
    const parser = csvStatementParser({ hasStableRowId: "yes" as unknown as boolean, hasRunningBalance: false })
    expect(() => new ParserRegistry([parser])).toThrow("STATEMENT_FORMAT_UNSUPPORTED")
  })

  it.each(["", "VCB", "-vcb", "a".repeat(61), "vcb xlsx"])("refuses the parser name %j", (name) => {
    expect(() => new ParserRegistry([csvStatementParser({ name })])).toThrow("is invalid")
  })

  it("refuses a name registered twice", () => {
    expect(() => new ParserRegistry([csvStatementParser(), csvStatementParser()])).toThrow("registered twice")
  })

  it.each([[[]], [["97043"]], [["970436", "abc123"]]])("refuses the bank BINs %j", (bankBins) => {
    expect(() => new ParserRegistry([csvStatementParser({ bankBins })])).toThrow("six-digit bank BINs")
  })

  it("ships no bank parser until a bank is chosen (DOS/Give#17)", () => {
    expect(statementParsers.get("test-csv")).toBeUndefined()
    expect(statementParsers.forBank("970436")).toEqual([])
  })
})
