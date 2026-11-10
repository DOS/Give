import Link from "next/link"

import { LedgerIcon } from "@/components/ui/icons"
import { MoneyRow } from "@/components/ui/Money"
import { formatVnd } from "@/lib/format"
import { explainedOutAmount, remainingAmount, type MoneyTotals as Totals } from "@/lib/statement"

/**
 * The public money figures of a campaign (design section 2.4), straight from
 * give.public_campaigns. The headline is the gross amount paid in, with what
 * was refunded and what remains right below it (owner decision on
 * DOS/Give#58); then spending (with the unexplained part) and, for back
 * campaigns only, pledged. Laid out as a receipt (DOS/Give#95).
 */
export function MoneyTotals({ totals, statementHref }: { totals: Totals; statementHref?: string }) {
  const isBack = totals.type === "back"
  const unexplained = totals.unexplained_out_count > 0

  return (
    <section className="min-w-0 space-y-4 card p-4 sm:p-6" aria-labelledby="money-totals-heading">
      <div className="flex gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded bg-primary-soft text-primary">
          <LedgerIcon />
        </span>
        <div className="min-w-0">
          <h2 id="money-totals-heading" className="text-h3">
            Minh bạch tài chính
          </h2>
          <p className="mt-1 text-sm text-muted">
            Give không giữ tiền: mọi khoản đi thẳng vào tài khoản nhận của chiến dịch. Số liệu dưới đây lấy từ sao kê
            của tài khoản đó.
          </p>
        </div>
      </div>
      <dl className="border-t border-dashed border-border pt-3">
        <MoneyRow label="Tổng đã nhận vào tài khoản" amount={totals.paid_amount} figure="paid" strong />
        <MoneyRow label="Đã hoàn lại người ủng hộ" amount={totals.refunded_amount} figure="refunded" />
        <MoneyRow label="Còn lại trong tài khoản" amount={remainingAmount(totals)} figure="remaining" />
      </dl>
      {totals.other_in_amount > 0 && (
        <p className="text-sm text-muted">
          Trong đó <span data-figure="other_in">{formatVnd(totals.other_in_amount)}</span> không phải tiền ủng hộ (người
          tổ chức nạp thêm, ngân hàng hoàn phí hoặc trả lãi), đã được Give giải trình trên sao kê.
        </p>
      )}
      <dl className="border-t border-border pt-3">
        {isBack && <MoneyRow label="Đã cam kết" amount={totals.pledged_amount} figure="pledged" />}
        <MoneyRow label="Đã chi" amount={totals.disbursed_amount} figure="disbursed" />
        <MoneyRow
          label="Chi chưa giải trình"
          amount={totals.unexplained_out_amount}
          figure="unexplained"
          note={`${totals.unexplained_out_count} khoản`}
          tone={unexplained ? "warn" : "default"}
        />
      </dl>
      <p className="text-sm text-muted">Còn lại = đã nhận − đã chi − đã hoàn lại, theo sao kê đã ghi nhận.</p>
      {totals.disbursed_amount > 0 && (
        <p className="text-sm text-muted">
          Trong số đã chi, {formatVnd(explainedOutAmount(totals))} đã được người tổ chức giải trình.
        </p>
      )}
      {statementHref && (
        <Link href={statementHref} className="inline-flex min-h-11 items-center link">
          Xem sao kê và giải trình chi
        </Link>
      )}
    </section>
  )
}
