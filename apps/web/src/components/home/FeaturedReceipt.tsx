import Link from "next/link"

import { TypeBadge } from "@/components/badges"
import { ProgressBar } from "@/components/ProgressBar"
import { MoneyRow } from "@/components/ui/Money"
import type { CardCampaign } from "@/lib/campaigns"
import { daysLeft, formatVnd, progressPercent } from "@/lib/format"
import { raisedAmount, remainingAmount, statementHref, type MoneyTotals } from "@/lib/statement"

/**
 * The home hero's statement card (DESIGN.md 8): the featured campaign as a
 * receipt of its public statement: what came in, what went back to donors,
 * what was spent and what remains (give), or pledged against the goal
 * (back). The figures are the same ones the campaign page and its statement
 * show. It floats, so it carries the floating shadow.
 */
export function FeaturedReceipt({ campaign, totals }: { campaign: CardCampaign; totals: MoneyTotals | undefined }) {
  const isGive = campaign.type === "give"
  const raised = raisedAmount(totals, campaign.type)
  const percent = progressPercent(raised, campaign.goal_amount)
  const days = daysLeft(campaign.ends_at)
  const people = totals ? (isGive ? totals.supporters_count : totals.backers_count) : 0
  const options = campaign.display_options
  const meta = [
    options.backers_count !== false ? `${people} ${isGive ? "người ủng hộ" : "người đồng hành"}` : null,
    options.time_remaining !== false && days !== null ? (days > 0 ? `Còn ${days} ngày` : "Đã hết hạn") : null,
  ].filter(Boolean)

  return (
    <article className="min-w-0 card shadow-float">
      <div className="border-b border-dashed border-border p-4 sm:p-6">
        <TypeBadge type={campaign.type} />
        <h2 className="mt-3 line-clamp-2 text-h3 break-words">
          <Link href={`/campaigns/${campaign.slug}`} className="hover:underline hover:underline-offset-4">
            {campaign.title}
          </Link>
        </h2>
      </div>

      <div className="space-y-3 p-4 text-sm sm:p-6">
        <p className="text-muted">{isGive ? "Theo sao kê tài khoản nhận" : "Theo các cam kết đã ghi nhận"}</p>
        <dl>
          {isGive ? (
            <>
              <MoneyRow label="Đã nhận" amount={totals?.paid_amount ?? 0} />
              <MoneyRow label="Đã hoàn lại" amount={totals?.refunded_amount ?? 0} />
              <MoneyRow label="Đã chi" amount={totals?.disbursed_amount ?? 0} />
              <MoneyRow label="Còn lại" amount={totals ? remainingAmount(totals) : 0} />
            </>
          ) : (
            <>
              <MoneyRow label="Đã cam kết" amount={raised} />
              <MoneyRow label="Mục tiêu" amount={campaign.goal_amount} />
            </>
          )}
        </dl>
        {isGive && totals && totals.other_in_amount > 0 && (
          <p className="text-muted">
            Trong đó {formatVnd(totals.other_in_amount)} không phải tiền ủng hộ, đã được Give giải trình.
          </p>
        )}
        {options.progress_bar !== false && <ProgressBar percent={percent} />}
        {(options.progress_bar !== false || meta.length > 0) && (
          <p className="flex flex-wrap justify-between gap-x-4 text-muted">
            {options.progress_bar !== false && <span>{percent}% mục tiêu</span>}
            {meta.length > 0 && <span>{meta.join(" · ")}</span>}
          </p>
        )}
        <Link href={statementHref(campaign.slug, "all")} className="inline-flex min-h-11 items-center link">
          Xem sao kê của chiến dịch
        </Link>
      </div>
    </article>
  )
}
