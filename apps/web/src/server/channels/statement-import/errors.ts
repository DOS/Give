import { InboundError } from "@/server/inbound"

/**
 * Codes of a refused or failed statement import. STATEMENT_* come from the
 * app's own checks, before anything is recorded; GIVE_* are what the staging
 * and import RPCs raised.
 */
export type StatementImportCode =
  | "STATEMENT_FILE_INVALID"
  | "STATEMENT_ACCOUNT_NOT_FOUND"
  | "STATEMENT_CHANNEL_NOT_SUPPORTED"
  | "STATEMENT_PARSER_UNKNOWN"
  | "STATEMENT_PARSER_WRONG_BANK"
  | "STATEMENT_PARSER_FLAGS_CHANGED"
  | "STATEMENT_FORMAT_UNSUPPORTED"
  | "STATEMENT_PARSE_FAILED"
  | "STATEMENT_ROWS_INVALID"
  | "STATEMENT_ROW_INVALID"
  | "STATEMENT_ROWS_NOT_CHRONOLOGICAL"
  | "STATEMENT_ROW_OUTSIDE_PERIOD"
  | "STATEMENT_PERIOD_INVALID"
  | "STATEMENT_PERIOD_REQUIRED"
  | "STATEMENT_BALANCE_INVALID"
  | "STATEMENT_TOO_LARGE"
  | "STATEMENT_PAYLOAD_INVALID"

/**
 * A statement import failure with a stable code and, when it is about one
 * row, the row's 1-based position in the file. Only the code is stored on the
 * inbound event (it is an InboundError); the row helps the uploader fix the
 * file. Messages never carry row contents.
 */
export class StatementImportError extends InboundError {
  constructor(
    code: StatementImportCode | `GIVE_${string}`,
    readonly row?: number
  ) {
    super(code)
    this.name = "StatementImportError"
  }
}
