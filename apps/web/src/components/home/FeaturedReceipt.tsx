import Image from "next/image"
import Link from "next/link"

import { TypeBadge } from "@/components/badges"
import { ProgressBar } from "@/components/ProgressBar"
import { CoverPlaceholder } from "@/components/ui/CoverPlaceholder"
import { MoneyRow } from "@/components/ui/Money"
import type { PublicCampaign } from "@/lib/campaigns"
import { publicCoverUrl } from "@/lib/cover-urls"
import { daysLeft, formatVnd, progressPercent } from "@/lib/format"
import { raisedAmount, remainingAmount, statementHref, type MoneyTotals } from "@/lib/statement"

/**
 * The home hero's featured campaign, shown as a receipt of its public
 * statement: what came in, what went back to donors, what remains (give),
 * or pledged against the goal (back). The figures are the same ones the
 * campaign page and its statement show.
 */
export function FeaturedReceipt({ campaign, totals }: { campaign: PublicCampaign; totals: MoneyTotals | undefined }) {
  const isGive = campaign.type === "give"
  const raised = raisedAmount(totals, campaign.type)
  const percent = progressPercent(raised, campaign.goal_amount)
  const days = daysLeft(campaign.ends_at)
  const people = totals ? (isGive ? totals.supporters_count : totals.backers_count) : 0
  const options = campaign.display_options

  return (
    <article className="relative card shadow-[0_1px_2px_rgb(17_24_39/0.04),0_12px_32px_-12px_rgb(17_24_39/0.18)]">
      <div className="flex gap-4 border-b border-dashed border-gray-300 p-4 sm:p-5">
        <div className="relative size-20 shrink-0 overflow-hidden rounded bg-surface sm:size-24">
          {campaign.cover?.storage_path ? (
            <Image
              src={publicCoverUrl(campaign.cover.storage_path)}
              alt=""
              fill
              priority
              sizes="96px"
              className="object-cover"
            />
          ) : (
            <CoverPlaceholder type={campaign.type} />
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <TypeBadge type={campaign.type} />
          <h2 className="line-clamp-2 text-lg leading-snug font-semibold">
            <Link
              href={`/campaigns/${campaign.slug}`}
              className="hover:underline hover:underline-offset-4 focus-visible:-outline-offset-2"
            >
              {campaign.title}
            </Link>
          </h2>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {isGive && <p className="-mb-2 text-sm text-muted">Theo sao kê tài khoản nhận</p>}
        <dl>
          {isGive ? (
            <>
              <MoneyRow label="Tổng đã nhận" amount={totals?.paid_amount ?? 0} strong />
              <MoneyRow label="Đã hoàn lại" amount={totals?.refunded_amount ?? 0} />
              <MoneyRow label="Đã chi" amount={totals?.disbursed_amount ?? 0} />
              <MoneyRow label="Còn lại" amount={totals ? remainingAmount(totals) : 0} />
            </>
          ) : (
            <>
              <MoneyRow label="Đã cam kết" amount={raised} strong />
              <MoneyRow label="Mục tiêu" amount={campaign.goal_amount} />
            </>
          )}
        </dl>
        {isGive && totals && totals.other_in_amount > 0 && (
          <p className="text-sm text-muted">
            Trong đó {formatVnd(totals.other_in_amount)} không phải tiền ủng hộ, đã được Give giải trình.
          </p>
        )}
        <div className="space-y-2">
          {options.progress_bar !== false && <ProgressBar percent={percent} />}
          <p className="flex flex-wrap justify-between gap-x-4 text-muted">
            {options.progress_bar !== false && <span>{percent}% mục tiêu</span>}
            {options.backers_count !== false && (
              <span>
                {people} {isGive ? "người ủng hộ" : "người đồng hành"}
              </span>
            )}
            {options.time_remaining !== false && days !== null && (
              <span>{days > 0 ? `Còn ${days} ngày` : "Đã hết hạn"}</span>
            )}
          </p>
        </div>
        <Link href={statementHref(campaign.slug, "all")} className="inline-flex min-h-11 items-center link">
          Xem sao kê của chiến dịch
        </Link>
      </div>
    </article>
  )
}
