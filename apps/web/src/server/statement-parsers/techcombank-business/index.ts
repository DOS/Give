import { StatementImportError } from "@/server/channels/statement-import/errors"

import { readGrid } from "../sheet/read"
import type { StatementParser } from "../types"
import { parseTcbBusinessGrid, TcbLayoutError } from "./layout"

/** Techcombank's six-digit bank BIN (NAPAS), as on its VietQR codes. */
export const TECHCOMBANK_BIN = "970407"

/**
 * The Techcombank Business web transaction export, CSV or XLSX (DOS/Give#17,
 * decision P3 of 2026-11-18), built from Techcombank's public guides before
 * any real file was seen. See docs/research/bank-statements.md, section 6.2.
 *
 * Format flags. The database keys them on `name`, so once a file has been
 * imported they never change under this name; a different layout or flag
 * gets a new name such as "tcb-business-2".
 *
 * - hasRunningBalance: true. Techcombank's statement and transaction list
 *   show a balance after every row ("Số dư"), but the export file is
 *   UNCONFIRMED until JOY's anonymized samples arrive. The parser does not
 *   take the flag on trust: it needs the opening and closing balances of
 *   the download's header block, and every row's balance must follow from
 *   the one before, starting at the opening balance and ending at the
 *   closing one. A file that fails any of this is refused, so no file
 *   without a real running balance is imported under this flag, and no
 *   row is left out unnoticed.
 * - hasStableRowId: false. Rows carry a transaction number (often "FT…"),
 *   but nothing public says every row has one or that it is unique; the
 *   flag stays false (the safe value) until the samples show it. A wrong
 *   `true` would make the database drop a second transfer sharing a number.
 *   The number is kept in each row's `raw.ref`.
 *
 * The registry needs at least one of the two flags (design section 5.2), so
 * both cannot be false: the running balance, verified on every file,
 * carries the import. Without row ids the file must state its period ("Từ
 * ngày/From … Đến ngày/To …"); one that does not is refused.
 */
export const tcbBusinessParser: StatementParser = {
  name: "tcb-business",
  label: "Techcombank Business – giao dịch tài khoản (CSV hoặc XLSX)",
  bankBins: [TECHCOMBANK_BIN],
  hasStableRowId: false,
  hasRunningBalance: true,
  async parse(file) {
    try {
      return parseTcbBusinessGrid(await readGrid(file))
    } catch (err) {
      if (err instanceof TcbLayoutError && err.row !== undefined) {
        throw new StatementImportError("STATEMENT_ROW_INVALID", err.row)
      }
      throw new StatementImportError("STATEMENT_PARSE_FAILED")
    }
  },
}
