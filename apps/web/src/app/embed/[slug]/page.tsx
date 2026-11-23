import clsx from "clsx"
import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"

import { StatusBadge, TypeBadge } from "@/components/badges"
import { ProgressBar } from "@/components/ProgressBar"
import { Badge } from "@/components/ui/Badge"
import { buttonClass } from "@/components/ui/Button"
import { CheckIcon } from "@/components/ui/icons"
import { siteOrigin } from "@/lib/auth/origin"
import {
  getCampaignBySlug,
  getPublicOrganizer,
  isPublicCampaignVisible,
  isPublicStatus,
  type DisplayOptions,
} from "@/lib/campaigns"
import { publicCoverUrl } from "@/lib/cover-urls"
import { buildCampaignOutboundUrl, parseEmbedOptions } from "@/lib/embed"
import { daysLeft, formatDate, formatVnd, progressPercent } from "@/lib/format"
import { SLUG_PATTERN } from "@/lib/slug"
import { getMoneyTotals, raisedAmount } from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

export const dynamic = "force-dynamic"

async function loadPublicEmbedCampaign(slug: string) {
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) return null
  const db = dbAs()
  const campaign = await getCampaignBySlug(db, slug)
  if (!campaign || !isPublicCampaignVisible(campaign)) return null
  return { campaign, db }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const loaded = await loadPublicEmbedCampaign((await params).slug)
  if (!loaded) {
    return {
      title: "Không tìm thấy",
      robots: { index: false, follow: false },
    }
  }
  const { campaign } = loaded
  return {
    title: campaign.title,
    ...(campaign.summary ? { description: campaign.summary } : {}),
    alternates: { canonical: `/campaigns/${encodeURIComponent(campaign.slug)}` },
    robots: { index: false, follow: false },
  }
}

/**
 * Clickjacking-safe, chrome-free, strictly read-only campaign widget for
 * third-party `<iframe>` embeds (`/embed/[slug]`, DOS/Give#335).
 *
 * Security invariants:
 * - Anonymous `dbAs()` ONLY (zero `getSession()` or cookie reads).
 * - Zero `<form>` mutations, zero inline VietQR / bank transfer details.
 * - Pre-launch (`approved`) teasers NEVER call `getMoneyTotals` and NEVER
 *   render raised/goal amounts or progress bars.
 */
export default async function EmbedCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const loaded = await loadPublicEmbedCampaign((await params).slug)
  if (!loaded) notFound()
  const { campaign, db } = loaded

  const options = parseEmbedOptions(searchParams ? await searchParams : {})
  const publicStatus = isPublicStatus(campaign.status)
  const isGive = campaign.type === "give"

  const [organizer, totals] = await Promise.all([
    getPublicOrganizer(db, campaign.id).catch(() => null),
    publicStatus ? getMoneyTotals(db, campaign.id).catch(() => null) : Promise.resolve(null),
  ])

  const outboundUrl = buildCampaignOutboundUrl(campaign.slug, {
    origin: siteOrigin(),
    ref: options.ref,
  })
  const coverSrc = campaign.cover?.storage_path ? publicCoverUrl(campaign.cover.storage_path) : null
  const displayOptions: Partial<DisplayOptions> = campaign.display_options ?? {}
  const showProgress = displayOptions.progress_bar !== false
  const showBackers = displayOptions.backers_count !== false
  const showTime = displayOptions.time_remaining !== false

  const raised = publicStatus ? raisedAmount(totals, campaign.type) : 0
  const percent = publicStatus ? progressPercent(raised, campaign.goal_amount) : 0
  const people = publicStatus && totals ? (isGive ? totals.supporters_count : totals.backers_count) : null
  const days = publicStatus ? daysLeft(campaign.ends_at) : null
  const validStartsAt = campaign.starts_at && !Number.isNaN(Date.parse(campaign.starts_at)) ? campaign.starts_at : null

  const metaParts = publicStatus
    ? [
        `Mục tiêu ${formatVnd(campaign.goal_amount)}`,
        !options.compact && showBackers && people !== null
          ? `${people} ${isGive ? "người ủng hộ" : "người đồng hành"}`
          : null,
        !options.compact && campaign.status === "live" && showTime && days !== null
          ? days > 0
            ? `Còn ${days} ngày`
            : "Đã hết hạn"
          : null,
      ].filter(Boolean)
    : []

  const ctaLabel = publicStatus ? (campaign.status === "live" ? "Ủng hộ ngay" : "Xem chi tiết") : "Xem chi tiết"

  return (
    <article
      data-embed-theme={options.theme}
      className="flex min-h-screen w-full flex-col justify-between overflow-hidden rounded-[12px] border border-border bg-raised p-4 text-fg"
    >
      <div className="flex min-w-0 items-start gap-3">
        {coverSrc && (
          <div
            className={clsx(
              "relative shrink-0 overflow-hidden rounded bg-surface",
              options.compact ? "hidden aspect-video w-24 sm:block" : "aspect-video w-28 sm:w-36"
            )}
          >
            <Image
              src={coverSrc}
              alt={campaign.cover?.alt ?? campaign.title}
              fill
              sizes={options.compact ? "96px" : "(min-width: 640px) 144px, 112px"}
              className="object-cover"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <TypeBadge type={campaign.type} />
              {publicStatus ? <StatusBadge status={campaign.status} /> : <Badge tone="info">Sắp ra mắt</Badge>}
            </div>
            <span className="shrink-0 text-sm font-bold text-primary">Give</span>
          </div>
          <h1
            className={clsx(
              "mt-2 font-semibold break-words text-fg",
              options.compact ? "truncate text-base" : "line-clamp-2 text-h3"
            )}
          >
            {campaign.title}
          </h1>
          {organizer && (
            <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-muted">
              <span className="truncate">{organizer.display_name}</span>
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
        </div>
      </div>

      <div className="mt-auto pt-3">
        {publicStatus ? (
          <>
            {showProgress && <ProgressBar percent={percent} size="sm" />}
            <div
              className={clsx(
                "flex items-center justify-between gap-3",
                showProgress && "mt-2",
                !options.compact && "flex-wrap"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className={clsx("figure", options.compact ? "text-base" : "text-lg")}>{formatVnd(raised)}</span>{" "}
                  <span className="text-sm text-muted">
                    {isGive ? "đã nhận" : "đã cam kết"}
                    {showProgress && ` · ${percent}%`}
                  </span>
                </p>
                {metaParts.length > 0 && <p className="truncate text-sm text-muted">{metaParts.join(" · ")}</p>}
              </div>
              <a
                href={outboundUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass({
                  variant: "primary",
                  size: options.compact ? "sm" : "md",
                  className: "shrink-0 whitespace-nowrap",
                })}
              >
                {ctaLabel}
                <span className="sr-only"> (mở thẻ mới)</span>
              </a>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">Sắp ra mắt</p>
              <p className="truncate text-sm text-muted">
                {validStartsAt ? `Dự kiến mở ngày ${formatDate(validStartsAt)}` : "Chiến dịch sắp mở nhận ủng hộ"}
              </p>
            </div>
            <a
              href={outboundUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({
                variant: "primary",
                size: options.compact ? "sm" : "md",
                className: "shrink-0 whitespace-nowrap",
              })}
            >
              {ctaLabel}
              <span className="sr-only"> (mở thẻ mới)</span>
            </a>
          </div>
        )}
      </div>
    </article>
  )
}
