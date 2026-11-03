import clsx from "clsx"
import Image from "next/image"
import Link from "next/link"

import { TypeBadge } from "@/components/badges"
import { ProgressBar } from "@/components/ProgressBar"
import { CoverPlaceholder } from "@/components/ui/CoverPlaceholder"
import type { PublicCampaign } from "@/lib/campaigns"
import { publicCoverUrl } from "@/lib/cover-urls"
import { daysLeft, formatVnd, progressPercent } from "@/lib/format"

/**
 * Campaign card for discovery and the home page (public campaigns only: the
 * cover goes through the public media route). `raised` comes from
 * give.public_campaigns (lib/statement.ts raisedAmount). The whole card is
 * one link named by the title.
 */
export function CampaignCard({
  campaign,
  raised = 0,
  priority,
  headingLevel = 3,
}: {
  campaign: PublicCampaign
  raised?: number
  /** Loads the cover eagerly (above the fold). */
  priority?: boolean
  headingLevel?: 2 | 3
}) {
  const percent = progressPercent(raised, campaign.goal_amount)
  const days = daysLeft(campaign.ends_at)
  const options = campaign.display_options
  const isGive = campaign.type === "give"
  const Heading = headingLevel === 2 ? "h2" : "h3"

  return (
    <article className="group relative flex h-full flex-col overflow-hidden card transition-colors hover:border-gray-300">
      <div className="relative aspect-[3/2] overflow-hidden bg-surface">
        {campaign.cover?.storage_path ? (
          <Image
            src={publicCoverUrl(campaign.cover.storage_path)}
            alt=""
            fill
            priority={priority}
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <CoverPlaceholder type={campaign.type} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <TypeBadge type={campaign.type} />
          {campaign.category && <span className="text-sm text-muted">{campaign.category.name}</span>}
        </div>
        <Heading className="line-clamp-2 text-lg leading-snug font-semibold">
          <Link
            href={`/campaigns/${campaign.slug}`}
            className="group-hover:underline group-hover:underline-offset-4 after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand-600"
          >
            {campaign.title}
          </Link>
        </Heading>
        {campaign.summary && <p className="line-clamp-2 text-body">{campaign.summary}</p>}
        <div className="mt-auto space-y-2 pt-2">
          {options.progress_bar !== false && <ProgressBar percent={percent} size="sm" />}
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span>
              <span className="figure">{formatVnd(raised)}</span>{" "}
              <span className="text-muted">{isGive ? "đã nhận" : "đã cam kết"}</span>
            </span>
            <span className={clsx("tabular-nums", percent >= 100 ? "font-semibold text-brand-700" : "text-muted")}>
              {percent}%
            </span>
          </p>
          <p className="flex flex-wrap justify-between gap-x-3 text-sm text-muted">
            <span>Mục tiêu {formatVnd(campaign.goal_amount)}</span>
            {options.time_remaining !== false && days !== null && (
              <span>{days > 0 ? `Còn ${days} ngày` : "Đã hết hạn"}</span>
            )}
          </p>
        </div>
      </div>
    </article>
  )
}
