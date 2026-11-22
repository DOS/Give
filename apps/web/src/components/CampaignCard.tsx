import Image from "next/image"
import Link from "next/link"

import { TypeBadge } from "@/components/badges"
import { ProgressBar } from "@/components/ProgressBar"
import { Badge } from "@/components/ui/Badge"
import { CoverPlaceholder } from "@/components/ui/CoverPlaceholder"
import { CheckIcon } from "@/components/ui/icons"
import { STATUS_LABELS, type DisplayOptions, type ListedCampaign } from "@/lib/campaigns"
import { publicCoverUrl } from "@/lib/cover-urls"
import { daysLeft, formatDate, formatVnd, progressPercent } from "@/lib/format"
import { isNavigableOrganizerHandle, organizerProfileHref } from "@/lib/organizer-handle"

/**
 * Campaign card for discovery and the home page (DESIGN.md 6, public
 * campaigns only: the cover goes through the public media route). A 16:9
 * cover, then the type label, a two-line title, the organizer's display name
 * with a verified check, the progress bar, one line of figures and one meta
 * line (time left, or the status once the campaign has ended); no
 * description and no category. The organizer comes from
 * give.public_campaign_organizers (listPublicCampaigns); a card without one
 * leaves the line out. `raised` and `people` come from give.public_campaigns
 * (lib/statement.ts). The whole card is one link named by the title, with a
 * hover border and no lift.
 */
export function CampaignCard({
  campaign,
  raised = 0,
  people,
  priority,
  headingLevel = 3,
  hasImpactReport = false,
}: {
  campaign: ListedCampaign
  raised?: number
  /** Supporters (give) or backers (back); left out of the meta line when unknown. */
  people?: number
  /** Loads the cover eagerly (above the fold). */
  priority?: boolean
  headingLevel?: 2 | 3
  /** Shows a trust badge when the campaign has a published closing impact report (DOS/Give#314). */
  hasImpactReport?: boolean
}) {
  const percent = progressPercent(raised, campaign.goal_amount)
  const days = daysLeft(campaign.ends_at)
  const options: Partial<DisplayOptions> = campaign.display_options ?? {}
  const showProgress = options.progress_bar !== false
  const organizer = campaign.organizer
  const isGive = campaign.type === "give"
  const prelaunch = campaign.status === "approved"
  const Heading = headingLevel === 2 ? "h2" : "h3"
  const validStartsAt = campaign.starts_at && !Number.isNaN(Date.parse(campaign.starts_at)) ? campaign.starts_at : null
  const meta = prelaunch
    ? validStartsAt
      ? [`Mở ngày ${formatDate(validStartsAt)}`]
      : []
    : [
        options.backers_count !== false && people !== undefined
          ? `${people} ${isGive ? "người ủng hộ" : "người đồng hành"}`
          : null,
        campaign.status !== "live"
          ? STATUS_LABELS[campaign.status]
          : options.time_remaining !== false && days !== null
            ? days > 0
              ? `Còn ${days} ngày`
              : "Đã hết hạn"
            : null,
      ].filter(Boolean)

  return (
    <article
      data-ring-box
      className="group relative flex h-full min-w-0 flex-col overflow-hidden card transition-colors duration-150 hover:border-muted"
    >
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
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={campaign.type} />
          {prelaunch ? (
            <Badge tone="info">Sắp ra mắt</Badge>
          ) : (
            hasImpactReport && <Badge tone="brand">Có báo cáo tổng kết</Badge>
          )}
        </div>
        <Heading className="line-clamp-2 text-h3 break-words">
          <Link
            href={`/campaigns/${campaign.slug}`}
            className="group-hover:underline group-hover:underline-offset-4 group-has-[[data-organizer-link]:hover]:no-underline after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary"
          >
            {campaign.title}
          </Link>
        </Heading>
        {organizer && (
          <p className="flex min-w-0 items-center gap-2 text-sm text-muted">
            {isNavigableOrganizerHandle(organizer.handle) ? (
              <Link
                href={organizerProfileHref(organizer.handle)}
                data-organizer-link
                className="relative z-10 truncate rounded text-muted underline-offset-4 hover:text-fg hover:underline"
              >
                {organizer.display_name}
              </Link>
            ) : (
              <span className="truncate">{organizer.display_name}</span>
            )}
            {organizer.verification_status === "verified" && (
              <CheckIcon
                width={16}
                height={16}
                className="shrink-0 text-primary"
                role="img"
                aria-hidden={false}
                aria-label="Đã xác minh"
              />
            )}
          </p>
        )}
        <div className="mt-auto pt-2">
          {prelaunch ? (
            <>
              <p>
                <span className="text-muted">Mục tiêu </span>
                <span className="figure">{formatVnd(campaign.goal_amount)}</span>
              </p>
              {meta.length > 0 && <p className="text-sm text-muted">{meta.join(" · ")}</p>}
            </>
          ) : (
            <>
              {showProgress && <ProgressBar percent={percent} size="sm" />}
              <p className={showProgress ? "mt-3" : undefined}>
                <span className="figure">{formatVnd(raised)}</span>{" "}
                <span className="text-muted">
                  {isGive ? "đã nhận" : "đã cam kết"}
                  {showProgress && ` · ${percent}%`}
                </span>
              </p>
              {meta.length > 0 && <p className="text-sm text-muted">{meta.join(" · ")}</p>}
            </>
          )}
        </div>
      </div>
    </article>
  )
}
