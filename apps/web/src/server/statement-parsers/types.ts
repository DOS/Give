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

/** A statement file as a parser reads it. */
export interface ParsedStatement {
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
   * a partial statement.
   */
  parse(file: Uint8Array): ParsedStatement | Promise<ParsedStatement>
}
