import type { NormalizedTx } from "@/server/channels/types"

/**
 * What a statement format guarantees. Section 5.2: a format with neither a
 * stable row id nor a running balance cannot be imported automatically, so
 * the registry refuses such a parser outright.
 */
export interface StatementFormat {
  /**
   * One export format of one bank, e.g. "vcb-xlsx". The database keys
   * overlaps and format flags on it, so it never changes meaning once used.
   * Pattern: ^[a-z0-9][a-z0-9_.-]{0,59}$
   */
  name: string
  /** Every row carries the bank's own id (journal number, FT...). */
  hasStableRowId: boolean
  /** Every row carries the balance after it. */
  hasRunningBalance: boolean
}

/**
 * How much of the account's rows a file holds, as the file itself states it
 * (its period line, title or filter lines), never guessed from the rows
 * (DOS/Give#57). The import cannot tell a partial export from a full one by
 * its rows, so a parser that cannot tell says "partial".
 *
 * - "full": a statement "from D1 to D2": every row from the start of D1 to
 *   the end of D2. Its last day may still end early when the file was
 *   produced that day; exportedAt tells the database so.
 * - "ends_early": the same, but the file states a time on D2 before its end
 *   (an export "to D2 14:00"). Accepted only when D2 is today.
 * - "partial": anything else that holds part of a day: a period starting
 *   after midnight, the last N transactions, rows filtered by direction,
 *   amount or text, or no stated period at all. Accepted only for an export
 *   of today alone (D1 = D2 = today).
 */
export type StatementCoverage = "full" | "ends_early" | "partial"

/** A statement file as a parser reads it. */
export interface ParsedStatement {
  /** See StatementCoverage. The pipeline refuses partial exports of past days. */
  coverage: StatementCoverage
  /**
   * Why a "partial" file is partial, when the parser is unsure: it found a
   * time it cannot place (a time filter, or a name such as "4G" that reads
   * like one). The uploader is then told to contact finance as well as to
   * export again.
   */
  coverageDetail?: "unplaced_time"
  /**
   * The period the file states, as local (Asia/Ho_Chi_Minh) dates
   * "YYYY-MM-DD". Required for formats without row ids. The file must hold
   * every row of each day of the period; only its last day may end early,
   * and only when the file was produced that day.
   */
  periodFrom?: string | null
  periodTo?: string | null
  openingBalance?: bigint | null
  closingBalance?: bigint | null
  /** When the bank produced the file, if it says so. */
  exportedAt?: Date | null
  /** Oldest first, in the file's order. */
  rows: NormalizedTx[]
}

export interface StatementParser extends StatementFormat {
  /** Shown to the uploader. */
  label: string
  /** Six-digit BINs of the banks whose files this parser reads. */
  bankBins: readonly string[]
  /**
   * Reads the file. Throws on a file it does not recognise; never returns
   * a statement with rows left out. A file the bank marks as a partial
   * export is returned with its coverage, and the pipeline decides.
   */
  parse(file: Uint8Array): ParsedStatement | Promise<ParsedStatement>
}
