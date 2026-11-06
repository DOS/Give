import Image from "next/image"
import Link from "next/link"

import { TypeBadge } from "@/components/badges"
import { ProgressBar } from "@/components/ProgressBar"
import { CoverPlaceholder } from "@/components/ui/CoverPlaceholder"
import type { PublicCampaign } from "@/lib/campaigns"
import { publicCoverUrl } from "@/lib/cover-urls"
import { daysLeft, formatVnd, progressPercent } from "@/lib/format"

/**
 * Campaign card for discovery and the home page (DESIGN.md 6, public
 * campaigns only: the cover goes through the public media route). A 16:9
 * cover, then the type label, a two-line title, the progress bar, one line
 * of figures and one meta line; no description. `raised` and `people` come
 * from give.public_campaigns (lib/statement.ts). The whole card is one link
 * named by the title, with a hover border and no lift.
 */
export function CampaignCard({
  campaign,
  raised = 0,
  people,
  priority,
  headingLevel = 3,
}: {
  campaign: PublicCampaign
  raised?: number
  /** Supporters (give) or backers (back); left out of the meta line when unknown. */
  people?: number
  /** Loads the cover eagerly (above the fold). */
  priority?: boolean
  headingLevel?: 2 | 3
}) {
  const percent = progressPercent(raised, campaign.goal_amount)
  const days = daysLeft(campaign.ends_at)
  const options = campaign.display_options
  const isGive = campaign.type === "give"
  const Heading = headingLevel === 2 ? "h2" : "h3"
  const meta = [
    options.backers_count !== false && people !== undefined
      ? `${people} ${isGive ? "người ủng hộ" : "người đồng hành"}`
      : null,
    options.time_remaining !== false && days !== null ? (days > 0 ? `Còn ${days} ngày` : "Đã hết hạn") : null,
  ].filter(Boolean)

  return (
    <article className="group relative flex h-full min-w-0 flex-col overflow-hidden card transition-colors duration-150 hover:border-muted">
      <div className="relative aspect-video overflow-hidden rounded-t-md bg-surface">
        {campaign.cover?.storage_path ? (
          <Image
            src={publicCoverUrl(campaign.cover.storage_path)}
            alt=""
            fill
            priority={priority}
            sizes="(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <CoverPlaceholder type={campaign.type} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <TypeBadge type={campaign.type} className="self-start" />
        <Heading className="line-clamp-2 text-h3 break-words">
          <Link
            href={`/campaigns/${campaign.slug}`}
            className="group-hover:underline group-hover:underline-offset-4 after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary"
          >
            {campaign.title}
          </Link>
        </Heading>
        {campaign.category && <p className="text-sm text-muted">{campaign.category.name}</p>}
        <div className="mt-auto pt-2">
          {options.progress_bar !== false && <ProgressBar percent={percent} size="sm" />}
          <p className="mt-3">
            <span className="figure">{formatVnd(raised)}</span>{" "}
            <span className="text-muted">
              {isGive ? "đã nhận" : "đã cam kết"}
              {options.progress_bar !== false && ` · ${percent}%`}
            </span>
          </p>
          {meta.length > 0 && <p className="text-sm text-muted">{meta.join(" · ")}</p>}
        </div>
      </div>
    </article>
  )
}
