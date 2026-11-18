import "server-only"

import { ParserRegistry } from "./registry"
import { tcbBusinessParser } from "./techcombank-business"

export { assertSupportedFormat, PARSER_NAME, ParserRegistry } from "./registry"
export type { ParsedStatement, StatementFormat, StatementParser } from "./types"

/**
 * Parsers of real bank formats. Techcombank Business is the first (DOS/Give#17),
 * built from the bank's guides; its real sample files are still to come.
 */
export const statementParsers = new ParserRegistry([tcbBusinessParser])
