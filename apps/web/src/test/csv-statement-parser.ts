import type { NormalizedTx } from "@/server/channels/types"
import type { ParsedStatement, StatementParser } from "@/server/statement-parsers/types"

/**
 * A test-only statement format, so the pipeline runs end to end before any
 * real bank parser exists (DOS/Give#17). Never registered in the app.
 *
 *   period_from,2026-10-01          header lines (optional), then
 *   period_to,2026-10-02
 *   opening_balance,100000
 *   closing_balance,150000
 *   exported_at,2026-10-03T08:00:00+07:00
 *   booked_at,direction,amount,balance_after,ref,description,counterparty_name,counterparty_account
 *   2026-10-01T09:15:00+07:00,in,50000,150000,FT001,MBVCB.1.GVABCDEF.CT,NGUYEN VAN A,0123456789
 *   2026-10-02,out,1100,148900,,PHI SMS,,
 *
 * A booked_at without a time is a date-only row. Cells hold no commas.
 */
export function csvStatementParser(overrides: Partial<StatementParser> = {}): StatementParser {
  return {
    name: "test-csv",
    label: "CSV thử nghiệm",
    bankBins: ["970436"],
    hasStableRowId: true,
    hasRunningBalance: true,
    parse(file) {
      return parseCsvStatement(new TextDecoder("utf-8", { fatal: true }).decode(file))
    },
    ...overrides,
  }
}

const COLUMNS = "booked_at,direction,amount,balance_after,ref,description,counterparty_name,counterparty_account"

function optionalBigint(cell: string | undefined): bigint | null {
  return cell === undefined || cell === "" ? null : BigInt(cell)
}

export function parseCsvStatement(text: string): ParsedStatement {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "")
  const header = lines.indexOf(COLUMNS)
  if (header < 0) throw new Error("not a test statement")
  const meta = new Map(lines.slice(0, header).map((line) => line.split(",", 2) as [string, string]))
  const rows = lines.slice(header + 1).map((line): NormalizedTx => {
    const [bookedAt, direction, amount, balance, ref, description, name, account] = line.split(",")
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(bookedAt)
    if (direction !== "in" && direction !== "out") throw new Error("bad direction")
    return {
      providerTxId: ref ? ref : null,
      direction,
      asset: "VND",
      amount: BigInt(amount),
      bookedAt: new Date(dateOnly ? `${bookedAt}T00:00:00+07:00` : bookedAt),
      bookedDateOnly: dateOnly,
      description: description || null,
      counterpartyName: name || null,
      counterpartyAccount: account || null,
      balanceAfter: optionalBigint(balance),
      raw: { line },
    }
  })
  return {
    periodFrom: meta.get("period_from") ?? null,
    periodTo: meta.get("period_to") ?? null,
    openingBalance: optionalBigint(meta.get("opening_balance")),
    closingBalance: optionalBigint(meta.get("closing_balance")),
    exportedAt: meta.has("exported_at") ? new Date(meta.get("exported_at")!) : null,
    rows,
  }
}

/** The file bytes of a CSV statement. */
export function csvFile(...lines: string[]): Uint8Array {
  return new TextEncoder().encode(lines.join("\n"))
}

export { COLUMNS as CSV_COLUMNS }
