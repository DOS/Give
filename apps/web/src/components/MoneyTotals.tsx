import Link from "next/link"

import { formatVnd } from "@/lib/format"
import { explainedOutAmount, type MoneyTotals as Totals } from "@/lib/statement"

/**
 * The public money figures of a campaign (design section 2.4), straight from
 * give.public_campaigns: paid in, spent (with the unexplained part), refunded,
 * and pledged for back campaigns only.
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
      <dl className="grid grid-cols-2 gap-3 text-sm">
        {isBack && <Figure label="Đã cam kết" value={totals.pledged_amount} testId="pledged" />}
        <Figure label="Đã vào tài khoản" value={totals.paid_amount} testId="paid" />
        <Figure label="Đã chi" value={totals.disbursed_amount} testId="disbursed" />
        <Figure label="Đã hoàn lại" value={totals.refunded_amount} testId="refunded" />
        <Figure
          label="Chi chưa giải trình"
          value={totals.unexplained_out_amount}
          testId="unexplained"
          note={`${totals.unexplained_out_count} khoản`}
          warn={unexplained}
        />
      </dl>
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
