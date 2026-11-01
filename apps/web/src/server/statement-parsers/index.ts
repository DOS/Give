import "server-only"

import { ParserRegistry } from "./registry"

export { assertSupportedFormat, PARSER_NAME, ParserRegistry } from "./registry"
export type { ParsedStatement, StatementFormat, StatementParser } from "./types"

/**
 * Parsers of real bank formats. None yet: the bank is not chosen, and each
 * bank's parser lands with its own sample files (DOS/Give#17).
 */
export const statementParsers = new ParserRegistry([])
