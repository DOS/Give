import Link from "next/link"

import { formatVnd } from "@/lib/format"
import { explainedOutAmount, remainingAmount, type MoneyTotals as Totals } from "@/lib/statement"

/**
 * The public money figures of a campaign (design section 2.4), straight from
 * give.public_campaigns. The headline is the gross amount paid in, with what
 * was refunded and what remains right below it (owner decision on
 * DOS/Give#58); then spending (with the unexplained part) and, for back
 * campaigns only, pledged.
 */
export function MoneyTotals({ totals, statementHref }: { totals: Totals; statementHref?: string }) {
  const isBack = totals.type === "back"
  const unexplained = totals.unexplained_out_count > 0

  return (
    <section className="space-y-4 card p-6" aria-labelledby="money-totals-heading">
      <div>
        <h2 id="money-totals-heading" className="font-semibold">
          Minh bạch tài chính
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Give không giữ tiền: mọi khoản đi thẳng vào tài khoản nhận của chiến dịch. Số liệu dưới đây lấy từ sao kê của
          tài khoản đó.
        </p>
      </div>
      <dl>
        <dt className="text-sm text-gray-500">Tổng đã nhận vào tài khoản</dt>
        <dd className="text-2xl font-bold tabular-nums" data-figure="paid">
          {formatVnd(totals.paid_amount)}
        </dd>
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
          <Figure label="Đã hoàn lại người ủng hộ" value={totals.refunded_amount} testId="refunded" />
          <Figure label="Còn lại trong tài khoản" value={remainingAmount(totals)} testId="remaining" />
        </div>
      </dl>
      <dl className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 text-sm">
        {isBack && <Figure label="Đã cam kết" value={totals.pledged_amount} testId="pledged" />}
        <Figure label="Đã chi" value={totals.disbursed_amount} testId="disbursed" />
        <Figure
          label="Chi chưa giải trình"
          value={totals.unexplained_out_amount}
          testId="unexplained"
          note={`${totals.unexplained_out_count} khoản`}
          warn={unexplained}
        />
      </dl>
      <p className="text-xs text-gray-500">Còn lại = đã nhận − đã chi − đã hoàn lại, theo sao kê đã ghi nhận.</p>
      {totals.disbursed_amount > 0 && (
        <p className="text-xs text-gray-500">
          Trong số đã chi, {formatVnd(explainedOutAmount(totals))} đã được người tổ chức giải trình.
        </p>
      )}
      {statementHref && (
        <Link href={statementHref} className="inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
          Xem sao kê và giải trình chi →
        </Link>
      )}
    </section>
  )
}

function Figure({
  label,
  value,
  testId,
  note,
  warn,
}: {
  label: string
  value: number
  testId: string
  note?: string
  warn?: boolean
}) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-semibold ${warn ? "text-amber-700" : ""}`} data-figure={testId}>
        {formatVnd(value)}
      </dd>
      {note && <dd className={`text-xs ${warn ? "text-amber-700" : "text-gray-500"}`}>{note}</dd>}
    </div>
  )
}
