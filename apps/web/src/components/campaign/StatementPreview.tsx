import Link from "next/link"

import { SummaryCells } from "@/components/campaign/SummaryCells"
import { PledgeTotals } from "@/components/PledgeTotals"
import { Badge } from "@/components/ui/Badge"
import { Callout } from "@/components/ui/Callout"
import { formatDate, formatVnd } from "@/lib/format"
import { counterpartyLabel, remainingAmount, statementHref, type MoneyTotals, type StatementRow } from "@/lib/statement"

/** How many of the newest statement rows the campaign page shows. */
export const PREVIEW_ROWS = 5

function rowText(row: StatementRow): string {
  if (row.direction === "out" && row.explained && row.purpose) return row.purpose
  return counterpartyLabel(row)
}

function RowNote({ row }: { row: StatementRow }) {
  if (row.direction === "in") return row.in_explanation ? <Badge>Không phải tiền ủng hộ</Badge> : null
  if (row.is_refund) return <Badge>Hoàn tiền</Badge>
  return row.explained ? <Badge tone="brand">Đã giải trình</Badge> : <Badge tone="warning">Chưa giải trình</Badge>
}

function Amount({ row }: { row: StatementRow }) {
  const incoming = row.direction === "in"
  return (
    <span className={`font-semibold whitespace-nowrap tabular-nums ${incoming ? "text-primary" : "text-fg"}`}>
      {incoming ? "+" : "−"}
      {formatVnd(row.amount)}
    </span>
  )
}

/**
 * The statement on the campaign page (DESIGN.md 8): the summary figures, the
 * newest rows of the public statement, and a link to all of it. The numbers
 * come from give.public_campaigns and give.public_statement, as on the
 * statement page.
 */
export function StatementPreview({
  slug,
  totals,
  rows,
}: {
  slug: string
  totals: MoneyTotals
  /** The newest rows, or null when they could not be read (the summary still shows). */
  rows: readonly StatementRow[] | null
}) {
  const isBack = totals.type === "back"
  const shown = rows?.slice(0, PREVIEW_ROWS) ?? []

  return (
    <section aria-labelledby="sao-ke-heading" className="scroll-mt-24" id="sao-ke">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="sao-ke-heading" className="text-h2">
          Sao kê
        </h2>
        <Link href={statementHref(slug, "all")} className="inline-flex min-h-11 shrink-0 items-center text-sm link">
          Xem toàn bộ sao kê
        </Link>
      </div>
      <p className="text-sm text-muted">Đối chiếu với sao kê ngân hàng của tài khoản nhận.</p>

      <div className="mt-4 space-y-4">
        {isBack ? (
          <PledgeTotals totals={totals} />
        ) : (
          <SummaryCells
            label="Số liệu sao kê"
            cells={[
              { label: "Đã nhận", amount: totals.paid_amount, figure: "paid" },
              { label: "Đã hoàn lại", amount: totals.refunded_amount, figure: "refunded" },
              { label: "Đã chi", amount: totals.disbursed_amount, figure: "disbursed" },
              { label: "Còn lại", amount: remainingAmount(totals), figure: "remaining", tone: "primary" },
            ]}
          />
        )}
        {!isBack && totals.other_in_amount > 0 && (
          <p className="text-sm text-muted">
            Trong đó {formatVnd(totals.other_in_amount)} không phải tiền ủng hộ (người tổ chức nạp thêm, ngân hàng hoàn
            phí hoặc trả lãi), đã được Give giải trình trên sao kê.
          </p>
        )}
        {totals.unexplained_out_count > 0 && (
          <Callout tone="warning">
            <p>
              {totals.unexplained_out_count} khoản chi, tổng {formatVnd(totals.unexplained_out_amount)}, chưa được người
              tổ chức giải trình.
            </p>
          </Callout>
        )}
      </div>

      {rows !== null &&
        (shown.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Chưa có giao dịch nào trong sao kê.</p>
        ) : (
          <>
            <table className="mt-4 hidden w-full border-collapse text-left text-sm sm:table">
              <caption className="sr-only">Giao dịch mới nhất</caption>
              <thead>
                <tr className="text-muted">
                  <th scope="col" className="w-28 border-b border-border py-2 font-medium">
                    Ngày
                  </th>
                  <th scope="col" className="border-b border-border py-2 font-medium">
                    Nội dung
                  </th>
                  <th scope="col" className="border-b border-border py-2 text-right font-medium">
                    Số tiền
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id}>
                    <td className="border-b border-border py-3 align-top text-muted tabular-nums">
                      {formatDate(row.booked_at)}
                    </td>
                    <td className="border-b border-border py-3 pr-4 align-top">
                      <span className="break-words">{rowText(row)}</span> <RowNote row={row} />
                    </td>
                    <td className="border-b border-border py-3 text-right align-top">
                      <Amount row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-2 sm:hidden" aria-label="Giao dịch mới nhất">
              {shown.map((row) => (
                <li key={row.id} className="flex gap-3 border-b border-border py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="break-words">{rowText(row)}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-muted tabular-nums">
                      {formatDate(row.booked_at)} <RowNote row={row} />
                    </p>
                  </div>
                  <Amount row={row} />
                </li>
              ))}
            </ul>
          </>
        ))}
    </section>
  )
}
