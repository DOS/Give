import Link from "next/link"

import { formatDate, formatVnd } from "@/lib/format"
import { counterpartyLabel, statementHref, type StatementRow } from "@/lib/statement"

/** How many recent donations the give campaign page lists. */
export const RECENT_SUPPORTERS = 4

/**
 * "Ủng hộ gần đây" on a give campaign (DESIGN.md 8): the newest incoming
 * statement rows matched to a donation, under the donor's chosen display name
 * or "Ẩn danh", never the bank account-holder name (counterpartyLabel).
 */
export function RecentSupporters({
  slug,
  rows,
  count,
}: {
  slug: string
  rows: readonly StatementRow[]
  /** All supporters of the campaign, for the "see all" link. */
  count: number
}) {
  const donations = rows.filter((row) => row.direction === "in" && row.matched).slice(0, RECENT_SUPPORTERS)
  if (donations.length === 0) return null
  return (
    <section aria-labelledby="recent-supporters-heading">
      <h2 id="recent-supporters-heading" className="text-h3">
        Ủng hộ gần đây
      </h2>
      <ul className="mt-2">
        {donations.map((row) => (
          <li key={row.id} className="flex justify-between gap-3 border-b border-border py-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold break-words">{counterpartyLabel(row)}</p>
              <p className="text-muted">{formatDate(row.booked_at)}</p>
            </div>
            <p className="font-semibold whitespace-nowrap tabular-nums">{formatVnd(row.amount)}</p>
          </li>
        ))}
      </ul>
      <Link href={statementHref(slug, "in")} className="mt-2 inline-flex min-h-11 items-center text-sm link">
        {count > 0 ? `Xem tất cả ${count} người ủng hộ` : "Xem tất cả lượt ủng hộ"}
      </Link>
    </section>
  )
}
