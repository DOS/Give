import { StatementImportError } from "@/server/channels/statement-import/errors"

import type { StatementFormat, StatementParser } from "./types"

/** The database's pattern for give.statement_import_batches.parser. */
export const PARSER_NAME = /^[a-z0-9][a-z0-9_.-]{0,59}$/
const BANK_BIN = /^\d{6}$/

/**
 * Section 5.2: only a format with a stable row id or a running balance can
 * tell a repeated row from a new one. Throws STATEMENT_FORMAT_UNSUPPORTED for
 * any other.
 */
export function assertSupportedFormat(format: StatementFormat): void {
  if (format.hasStableRowId !== true && format.hasRunningBalance !== true) {
    throw new StatementImportError("STATEMENT_FORMAT_UNSUPPORTED")
  }
}

/** The statement parsers the app accepts, by name. */
export class ParserRegistry {
  private readonly byName = new Map<string, StatementParser>()

  /** Refuses a bad name, a repeated name, a parser without bank BINs and an unsupported format. */
  constructor(parsers: readonly StatementParser[]) {
    for (const parser of parsers) {
      if (!PARSER_NAME.test(parser.name)) throw new Error(`Statement parser name "${parser.name}" is invalid`)
      if (this.byName.has(parser.name)) throw new Error(`Statement parser "${parser.name}" is registered twice`)
      if (parser.bankBins.length === 0 || !parser.bankBins.every((bin) => BANK_BIN.test(bin))) {
        throw new Error(`Statement parser "${parser.name}" needs six-digit bank BINs`)
      }
      assertSupportedFormat(parser)
      this.byName.set(parser.name, parser)
    }
  }

  get(name: string): StatementParser | undefined {
    return this.byName.get(name)
  }

  /** Parsers that read statements of this bank, for the upload form. */
  forBank(bankBin: string): StatementParser[] {
    return [...this.byName.values()].filter((parser) => parser.bankBins.includes(bankBin))
  }
}
