import { CSV_COLUMNS, csvFile } from "./csv-statement-parser"

/**
 * A realistic large statement in the test CSV format (DOS/Give#73): `rows`
 * incoming transfers, `perDay` a day from `firstDay`, each with a bank id, a
 * transfer description, the sender's name and account and a running balance
 * (as DOS/Give#60 measured: 5000 such rows are about 1.6 MB of jsonb before
 * the raw cells). Opening balance 0; the closing balance is the last row's.
 * Without ids, for a format that has none.
 */
export function largeStatementFile({
  rows = 5000,
  perDay = 500,
  firstDay = "2026-09-20",
  withIds = true,
}: { rows?: number; perDay?: number; firstDay?: string; withIds?: boolean } = {}): Uint8Array {
  const days = Math.ceil(rows / perDay)
  const start = Date.parse(`${firstDay}T00:00:00Z`)
  const day = (n: number) => new Date(start + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  let balance = 0
  const lines = Array.from({ length: rows }, (_, index) => {
    const i = index + 1
    const amount = 100000 + i
    balance += amount
    const second = (index % perDay) * 30
    const time = `${String(7 + Math.floor(second / 3600)).padStart(2, "0")}:${String(Math.floor(second / 60) % 60).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}`
    const id = String(i).padStart(6, "0")
    return [
      `${day(Math.floor(index / perDay))}T${time}+07:00`,
      "in",
      amount,
      balance,
      withIds ? `FT26${id}` : "",
      `MBVCB.${i}.ung ho chien dich GV${id}.CT tu 0123${id} NGUYEN VAN ${i}`,
      `NGUYEN VAN ${i}`,
      `0123${id}`,
    ].join(",")
  })
  return csvFile(
    `period_from,${firstDay}`,
    `period_to,${day(days - 1)}`,
    "opening_balance,0",
    `closing_balance,${balance}`,
    CSV_COLUMNS,
    ...lines
  )
}
