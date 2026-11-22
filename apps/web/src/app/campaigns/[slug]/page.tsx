import clsx from "clsx"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache, type ReactNode } from "react"

import { AccountChanges } from "@/components/AccountChanges"
import { StatusBadge, TypeBadge } from "@/components/badges"
import { CampaignTeam } from "@/components/campaign/CampaignTeam"
import { CampaignVideo, isValidYoutubeId } from "@/components/campaign/CampaignVideo"
import { CampaignViewBeacon } from "@/components/campaign/CampaignViewBeacon"
import { ClosingImpactReport } from "@/components/campaign/ClosingImpactReport"
import { MilestoneList } from "@/components/campaign/MilestoneList"
import { RecentSupporters } from "@/components/campaign/RecentSupporters"
import { StatementPreview } from "@/components/campaign/StatementPreview"
import { StickyAside } from "@/components/campaign/StickyAside"
import { TransparencySummaryBox } from "@/components/campaign/TransparencySummaryBox"
import { FollowButton } from "@/components/FollowButton"
import { Markdown } from "@/components/Markdown"
import { ProgressBar } from "@/components/ProgressBar"
import { QrPosterButton } from "@/components/QrPosterButton"
import { RewardTiers } from "@/components/RewardTiers"
import { ShareButtons } from "@/components/ShareButtons"
import { Badge } from "@/components/ui/Badge"
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button"
import { CoverPlaceholder } from "@/components/ui/CoverPlaceholder"
import { EmptyState } from "@/components/ui/EmptyState"
import { CheckIcon, ShieldIcon } from "@/components/ui/icons"
import { Money } from "@/components/ui/Money"
import { TabNav, type TabItem } from "@/components/ui/Tabs"
import { listPublicAccountChanges } from "@/lib/account-swaps"
import { siteOrigin } from "@/lib/auth/origin"
import { getSession } from "@/lib/auth/session"
import {
  COMMENTS_PAGE_SIZE,
  listCampaignComments,
  parseCommentsPage,
  parseShowHiddenComments,
  type CampaignCommentsPage,
} from "@/lib/campaign-comments"
import { listCampaignPublicTeam, type PublicTeamMember } from "@/lib/campaign-members"
import {
  discoveryHref,
  getCampaignBySlug,
  getPublicOrganizer,
  isPublicCampaignVisible,
  isPublicStatus,
  isStaff,
  listMilestones,
  listPublishedUpdates,
  VERIFICATION_LABELS,
  type PublicCampaign,
  type Db,
} from "@/lib/campaigns"
import { MODERATION_ROLES } from "@/lib/evidence-moderation"
import { getCampaignFollowerCount, isFollowingCampaign } from "@/lib/follows"
import { daysLeft, formatDate, formatVnd, progressPercent } from "@/lib/format"
import { isNavigableOrganizerHandle, organizerProfileHref } from "@/lib/organizer-handle"
import { acceptsPledges } from "@/lib/pledges"
import { listCampaignTiers, previewTiers } from "@/lib/reward-tiers"
import { SLUG_PATTERN } from "@/lib/slug"
import { privateCoverUrl, publicCoverUrl } from "@/lib/cover-urls"
import { getMoneyTotals, listStatement, raisedAmount, statementHref } from "@/lib/statement"
import { dbAs, dbService } from "@/lib/supabase"
import {
  getCampaignImpactReport,
  getCampaignTransparencySummary,
  type CampaignImpactReport,
  type CampaignTransparencySummary,
} from "@/lib/transparency"
import { acceptsDonations, paymentAccount } from "@/server/contributions"
import { listPublicTiers, organizesCampaign } from "@/server/pledges"
import { buildServerPosterData } from "@/server/viral-sharing"

import { CampaignComments } from "./CampaignComments"
import { DonateForm } from "./DonateForm"
import { toggleCampaignFollow } from "./follow-actions"
import { MonthlyForm } from "./MonthlyForm"
import { ReportCampaign } from "./ReportCampaign"

/**
 * Public campaigns (including opted-in future pre-launch teasers) load as an
 * anonymous visitor. If that finds nothing and someone is signed in, retry as
 * them: the organizer and staff may preview a campaign that is not public yet
 * (RLS decides).
 */
const loadCampaign = cache(
  async (slug: string): Promise<{ campaign: PublicCampaign; db: Db; preview: boolean } | null> => {
    if (!SLUG_PATTERN.test(slug) || slug.length > 80) return null
    const anon = dbAs()
    const published = await getCampaignBySlug(anon, slug)
    if (published && isPublicCampaignVisible(published)) return { campaign: published, db: anon, preview: false }

    const session = await getSession()
    if (!session) return null
    const db = dbAs(session.accessToken)
    const own = await getCampaignBySlug(db, slug).catch(() => null)
    return own ? { campaign: own, db, preview: !isPublicCampaignVisible(own) } : null
  }
)

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const loaded = await loadCampaign((await params).slug)
  if (!loaded) {
    return {
      title: "Không tìm thấy",
      robots: { index: false, follow: false },
    }
  }
  const { campaign, preview } = loaded
  const description = campaign.summary || undefined
  const unindexed = preview || campaign.status === "suspended"
  if (unindexed) {
    return {
      title: campaign.title,
      ...(description ? { description } : {}),
      robots: { index: false, follow: false },
    }
  }
  const canonicalPath = `/campaigns/${encodeURIComponent(campaign.slug)}`
  return {
    title: campaign.title,
    ...(description ? { description } : {}),
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "website",
      siteName: "Give",
      locale: "vi_VN",
      title: campaign.title,
      ...(description ? { description } : {}),
      url: canonicalPath,
    },
  }
}

interface PublicMonthly {
  allow_monthly: boolean
  monthly_supporters: number
}

/**
 * Whether a public give campaign takes monthly plans and how many donors
 * have an active one (give.public_campaign_monthly, DOS/Give#276). Pledged
 * monthly amounts are intentions, never summed or shown.
 */
async function publicMonthly(db: Db, campaignId: string): Promise<PublicMonthly | null> {
  const { data, error } = await db
    .from("public_campaign_monthly")
    .select("allow_monthly, monthly_supporters")
    .eq("campaign_id", campaignId)
    .maybeSingle()
  if (error) throw error
  const row = data as { allow_monthly: boolean | null; monthly_supporters: number | string | null } | null
  return row
    ? { allow_monthly: row.allow_monthly === true, monthly_supporters: Number(row.monthly_supporters) || 0 }
    : null
}

/** "Từ thiện" for give, "Dự án sáng tạo" for back, as discovery names them. */
const TYPE_NAMES = { give: "Từ thiện", back: "Dự án sáng tạo" } as const

interface BreadcrumbCrumb {
  name: string
  href?: string
}

function buildBreadcrumbJsonLd(campaign: PublicCampaign, origin: string | undefined) {
  const toUrl = (path: string) => (origin ? new URL(path, origin).toString() : path)
  const crumbs: BreadcrumbCrumb[] = [
    { name: "Trang chủ", href: "/" },
    { name: "Khám phá", href: "/campaigns" },
    { name: TYPE_NAMES[campaign.type], href: discoveryHref({ type: campaign.type }) },
    ...(campaign.category
      ? [
          {
            name: campaign.category.name,
            href: discoveryHref({ type: campaign.type, category: campaign.category.slug }),
          },
        ]
      : []),
    { name: campaign.title },
  ]
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      ...(crumb.href ? { item: toUrl(crumb.href) } : {}),
    })),
  }
}

interface YoutubeMediaRow {
  id: string
  youtube_id: string | null
  alt: string | null
  sort_order: number
}

async function listYoutubeMedia(db: Db, campaignId: string): Promise<YoutubeMediaRow[]> {
  const { data, error } = await db
    .from("campaign_media")
    .select("id, youtube_id, alt, sort_order")
    .eq("campaign_id", campaignId)
    .eq("kind", "youtube")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
  if (error) throw error
  return (data ?? []) as YoutubeMediaRow[]
}

async function loadPublicComments(
  campaignId: string,
  token: string | undefined,
  page: number,
  includeHidden: boolean
): Promise<CampaignCommentsPage> {
  const offset = (page - 1) * COMMENTS_PAGE_SIZE
  if (token) {
    try {
      return await listCampaignComments(dbAs(token), campaignId, {
        limit: COMMENTS_PAGE_SIZE,
        offset,
        includeHidden,
      })
    } catch (error: unknown) {
      const code = (error as { code?: string } | null)?.code
      if (typeof code === "string" && code.startsWith("PGRST30")) {
        return listCampaignComments(dbAs(), campaignId, {
          limit: COMMENTS_PAGE_SIZE,
          offset,
          includeHidden: false,
        })
      }
      throw error
    }
  }
  return listCampaignComments(dbAs(), campaignId, {
    limit: COMMENTS_PAGE_SIZE,
    offset,
    includeHidden: false,
  })
}

/**
 * The campaign page (DESIGN.md 8): breadcrumb, H1 and the organizer line,
 * then an 8/4 grid from 1024px: cover, tabs, story, statement and updates in
 * the main column; the funding box and either recent supporters (give) or
 * the reward tiers (back) in the sticky sidebar. Below 1024px the funding
 * box follows the title, and a bar at the bottom of the screen keeps the
 * main action in reach.
 */
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const loaded = await loadCampaign((await params).slug)
  if (!loaded) notFound()
  const { campaign, db, preview } = loaded
  const queryParams = searchParams ? await searchParams : {}
  const commentsPage = parseCommentsPage(queryParams)
  const requestedShowHidden = parseShowHiddenComments(queryParams)

  const isGive = campaign.type === "give"
  const halted = campaign.status === "suspended" || campaign.status === "cancelled"
  const isPublicLiveOrEnded = !preview && isPublicStatus(campaign.status)
  const publicPrelaunch = !preview && !isPublicLiveOrEnded
  const preLaunch = (preview && !halted) || publicPrelaunch
  const donationsOpen = isPublicLiveOrEnded && acceptsDonations(campaign)
  const pledgesOpen = isPublicLiveOrEnded && acceptsPledges(campaign)
  const sessionPromise = getSession()
  const isModeratorPromise = !isPublicLiveOrEnded
    ? Promise.resolve(false)
    : sessionPromise.then((s) => (s ? isStaff(dbAs(s.accessToken), MODERATION_ROLES).catch(() => false) : false))
  const [
    milestones,
    updates,
    youtubeMedia,
    organizer,
    account,
    session,
    ownCampaign,
    isModerator,
    totals,
    accountChanges,
    tiers,
    statementRows,
    monthly,
    comments,
    publicTeam,
    transparencySummary,
    impactReport,
    followerCount,
    following,
  ] = await Promise.all([
    listMilestones(db, campaign.id),
    listPublishedUpdates(db, campaign.id),
    listYoutubeMedia(db, campaign.id).catch(() => [] as YoutubeMediaRow[]),
    preview
      ? Promise.resolve(null)
      : getPublicOrganizer(db, campaign.id).catch((error: unknown) => {
          console.error("campaign page: public organizer lookup failed", error)
          return null
        }),
    donationsOpen
      ? paymentAccount(dbService(), campaign.id).catch((error: unknown) => {
          // The page still renders, without the donate form.
          console.error("campaign page: payment account lookup failed", error)
          return null
        })
      : Promise.resolve(null),
    sessionPromise,
    // The organizer cannot back or report their own campaign (the database refuses both).
    !isPublicLiveOrEnded
      ? Promise.resolve(false)
      : sessionPromise.then((s) =>
          s ? organizesCampaign(dbAs(s.accessToken), campaign.id, s.user.id).catch(() => false) : false
        ),
    isModeratorPromise,
    // Public views only: a preview or pre-launch teaser has no public money totals yet.
    !isPublicLiveOrEnded ? Promise.resolve(null) : getMoneyTotals(dbAs(), campaign.id),
    // A failed read hides the notice rather than the page; the statement shows it too.
    !isPublicLiveOrEnded ? Promise.resolve([]) : listPublicAccountChanges(dbAs(), campaign.id).catch(() => []),
    // Reward tiers (DOS/Give#83): the public view (live/ended), or the organizer's own active tiers in a preview.
    // Pre-launch teasers show no pledge/tier CTAs.
    isGive || publicPrelaunch
      ? Promise.resolve([])
      : (preview ? listCampaignTiers(db, campaign.id).then(previewTiers) : listPublicTiers(dbAs(), campaign.id)).catch(
          (error: unknown) => {
            console.error("campaign page: reward tiers lookup failed", error)
            return []
          }
        ),
    // The newest rows of the public statement, for its preview and the recent supporters.
    // A failed read leaves them out; the statement page has them all.
    !isPublicLiveOrEnded
      ? Promise.resolve(null)
      : listStatement(dbAs(), campaign.id, "all", 1)
          .then(({ rows }) => rows)
          .catch((error: unknown) => {
            console.error("campaign page: statement lookup failed", error)
            return null
          }),
    // Monthly giving (DOS/Give#276): public live/ended give campaigns only. A failed read hides it.
    isGive && isPublicLiveOrEnded
      ? publicMonthly(dbAs(), campaign.id).catch((error: unknown) => {
          console.error("campaign page: monthly giving lookup failed", error)
          return null
        })
      : Promise.resolve(null),
    // Public comments (DOS/Give#250): public live/ended campaigns only. A failed read degrades cleanly.
    !isPublicLiveOrEnded
      ? Promise.resolve(null)
      : Promise.all([sessionPromise, requestedShowHidden ? isModeratorPromise : Promise.resolve(false)])
          .then(([s, includeHidden]) => loadPublicComments(campaign.id, s?.accessToken, commentsPage, includeHidden))
          .catch((error: unknown) => {
            console.error("campaign page: comments lookup failed", error)
            return null
          }),
    // Public team block (DOS/Give#253, #315): public campaigns and opted-in pre-launch teasers.
    preview
      ? Promise.resolve([] as PublicTeamMember[])
      : listCampaignPublicTeam(dbAs(), campaign.id).catch((error: unknown) => {
          console.error("campaign page: public team lookup failed", error)
          return [] as PublicTeamMember[]
        }),
    // 3-second transparency summary & milestone rollups (DOS/Give#314): public live/ended campaigns only (never pre-launch or preview).
    !isPublicLiveOrEnded
      ? Promise.resolve<CampaignTransparencySummary | null>(null)
      : getCampaignTransparencySummary(dbAs(), campaign.id).catch((error: unknown) => {
          console.error("campaign page: transparency summary lookup failed", error)
          return null
        }),
    // Published closing impact report (DOS/Give#314): public live/ended campaigns only via anon RLS (never pre-launch or preview).
    !isPublicLiveOrEnded
      ? Promise.resolve<CampaignImpactReport | null>(null)
      : getCampaignImpactReport(dbAs(), campaign.id).catch((error: unknown) => {
          console.error("campaign page: impact report lookup failed", error)
          return null
        }),
    // Campaign follower count & viewer follow state (DOS/Give#315).
    preview ? Promise.resolve(0) : getCampaignFollowerCount(dbAs(), campaign.id).catch(() => 0),
    preview
      ? Promise.resolve(false)
      : sessionPromise.then((s) =>
          s ? isFollowingCampaign(dbAs(s.accessToken), s.user.id, campaign.id).catch(() => false) : false
        ),
  ])
  const showHiddenComments = isModerator && requestedShowHidden
  const pitchVideo =
    youtubeMedia.find((m): m is YoutubeMediaRow & { youtube_id: string } => isValidYoutubeId(m.youtube_id)) ?? null
  const canDonate = donationsOpen && account !== null
  const ownProject = pledgesOpen && ownCampaign
  const canPledge = pledgesOpen && !ownProject
  // create_donation_plan also needs an end date and the usable account canDonate checked.
  const monthlyOpen = canDonate && monthly?.allow_monthly === true && campaign.ends_at !== null
  const monthlySupporters = monthly?.monthly_supporters ?? 0
  const loginHref = `/auth/login?return_path=${encodeURIComponent(`/campaigns/${campaign.slug}`)}`
  const closedNote =
    campaign.status === "suspended"
      ? isGive
        ? "Chiến dịch đang tạm dừng nên không nhận ủng hộ."
        : "Dự án đang tạm dừng nên không nhận cam kết."
      : campaign.status === "cancelled"
        ? isGive
          ? "Chiến dịch đã hủy nên không nhận ủng hộ."
          : "Dự án đã hủy nên không nhận cam kết."
        : preLaunch
          ? `Give sắp mở nhận ${isGive ? "ủng hộ" : "cam kết"}. Tiền sẽ đi thẳng vào tài khoản nhận của chiến dịch.`
          : !isGive
            ? campaign.status === "live" && campaign.starts_at && new Date(campaign.starts_at) > new Date()
              ? "Dự án chưa tới ngày nhận cam kết."
              : "Dự án không còn nhận cam kết."
            : donationsOpen
              ? "Chiến dịch chưa sẵn sàng nhận chuyển khoản. Hãy quay lại sau."
              : "Chiến dịch không còn nhận ủng hộ."

  const raised = raisedAmount(totals, campaign.type)
  const percent = progressPercent(raised, campaign.goal_amount)
  const days = daysLeft(campaign.ends_at)
  const options = campaign.display_options
  const people = totals ? (isGive ? totals.supporters_count : totals.backers_count) : null
  const pledgePath = `/campaigns/${campaign.slug}/pledge`
  const ctaLabel = isGive ? "Ủng hộ" : "Ủng hộ dự án"

  const publishedImpactReport = isPublicLiveOrEnded && impactReport?.published_at ? impactReport : null
  const tabs: TabItem[] = [
    { href: `/campaigns/${campaign.slug}`, label: "Câu chuyện", current: true },
    // The statement only exists for public live/ended campaigns (never pre-launch or preview).
    ...(!isPublicLiveOrEnded ? [] : [{ href: statementHref(campaign.slug, "all"), label: "Sao kê", current: false }]),
    ...(publishedImpactReport ? [{ href: "#bao-cao-tong-ket", label: "Báo cáo tổng kết", current: false }] : []),
    ...(updates.length > 0 ? [{ href: "#cap-nhat", label: "Cập nhật", current: false, count: updates.length }] : []),
    ...(!isPublicLiveOrEnded
      ? []
      : [
          ...(comments
            ? [
                {
                  href: "#binh-luan",
                  label: "Bình luận",
                  current: false,
                  count: comments.totalTopLevel,
                },
              ]
            : []),
          {
            href: statementHref(campaign.slug, "in"),
            label: isGive ? "Người ủng hộ" : "Người đồng hành",
            current: false,
            count: people ?? undefined,
          },
        ]),
  ]
  const coverSrc = campaign.cover?.storage_path
    ? preview
      ? privateCoverUrl(campaign.cover.storage_path)
      : publicCoverUrl(campaign.cover.storage_path)
    : null

  const organizerInitial = organizer ? (Array.from(organizer.display_name.trim())[0]?.toUpperCase() ?? "") : ""
  const stats = [
    options.backers_count !== false && people !== null
      ? { value: String(people), label: isGive ? "người ủng hộ" : "người đồng hành" }
      : null,
    options.time_remaining !== false && days !== null
      ? { value: String(Math.max(0, days)), label: days > 0 ? "ngày còn lại" : "đã hết hạn" }
      : null,
    options.progress_bar !== false ? { value: `${percent}%`, label: "mục tiêu" } : null,
  ].filter((stat) => stat !== null)
  const origin = siteOrigin()
  const breadcrumbJsonLd = !preview && !halted ? buildBreadcrumbJsonLd(campaign, origin) : null
  const posterData = isPublicLiveOrEnded
    ? buildServerPosterData({ campaign, totals, organizer, account, origin })
    : null

  return (
    <article>
      {isPublicLiveOrEnded && <CampaignViewBeacon campaignId={campaign.id} />}
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }}
        />
      )}
      {preview && (
        <div className="bg-warning-soft py-3">
          <p className="container-page">
            {halted ? (
              <>
                Chiến dịch đang ở trạng thái <StatusBadge status={campaign.status} /> và không hiển thị công khai.
              </>
            ) : (
              <>
                Bản xem trước: chiến dịch đang ở trạng thái <StatusBadge status={campaign.status} /> và chưa công khai.
              </>
            )}
          </p>
        </div>
      )}

      <div className="container-page pb-16 sm:pt-8 lg:pb-24">
        <nav aria-label="Đường dẫn" className="hidden text-sm text-muted sm:block">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/campaigns" className="hover:text-fg hover:underline">
                Khám phá
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href={discoveryHref({ type: campaign.type })} className="hover:text-fg hover:underline">
                {TYPE_NAMES[campaign.type]}
              </Link>
            </li>
            {campaign.category && (
              <>
                <li aria-hidden>/</li>
                <li>
                  <Link
                    href={discoveryHref({ type: campaign.type, category: campaign.category.slug })}
                    className="hover:text-fg hover:underline"
                  >
                    {campaign.category.name}
                  </Link>
                </li>
              </>
            )}
          </ol>
        </nav>

        {/* Phones stack the parts in reading order; from 1024px they sit on the 8/4 grid. */}
        <div className="flex flex-col gap-6 sm:mt-4 lg:grid lg:grid-cols-12 lg:grid-rows-[auto_auto_auto_1fr] lg:gap-x-6">
          <header className="min-w-0 max-lg:order-2 lg:col-span-8 lg:row-start-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <TypeBadge type={campaign.type} size="md" />
              {campaign.category && (
                <Link
                  href={discoveryHref({ type: campaign.type, category: campaign.category.slug })}
                  className="inline-flex min-h-11 items-center text-sm text-muted hover:text-fg hover:underline sm:hidden"
                >
                  {campaign.category.name}
                </Link>
              )}
              {publicPrelaunch ? (
                <Badge tone="info">Sắp ra mắt</Badge>
              ) : (
                !preview && campaign.status !== "live" && <StatusBadge status={campaign.status} />
              )}
            </div>
            <h1 className="mt-3 text-h1-phone tracking-tight break-words sm:text-h1">{campaign.title}</h1>
            {(organizer || (isGive && campaign.beneficiary_name)) && (
              <div className="mt-4 flex items-start gap-3 text-sm">
                {organizer && organizerInitial && (
                  <span
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded bg-surface font-bold text-muted"
                    aria-hidden
                  >
                    {organizerInitial}
                  </span>
                )}
                <div className="min-w-0">
                  {organizer && (
                    <>
                      <p className="flex items-center gap-2 font-semibold break-words">
                        {isNavigableOrganizerHandle(organizer.handle) ? (
                          <Link
                            href={organizerProfileHref(organizer.handle)}
                            className="min-w-0 rounded text-fg underline-offset-4 hover:text-primary hover:underline"
                          >
                            {organizer.display_name}
                          </Link>
                        ) : (
                          organizer.display_name
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
                      <p className="text-muted">
                        {organizer.kind === "organization" ? "Tổ chức gây quỹ" : "Người gây quỹ"} ·{" "}
                        {VERIFICATION_LABELS[organizer.verification_status]}
                      </p>
                    </>
                  )}
                  {isGive && campaign.beneficiary_name && (
                    <p className="text-muted">
                      Người thụ hưởng: <span className="text-fg">{campaign.beneficiary_name}</span>
                      {campaign.beneficiary_relation && ` (${campaign.beneficiary_relation})`}
                    </p>
                  )}
                </div>
              </div>
            )}
          </header>

          <div className="relative -mx-4 aspect-video overflow-hidden bg-surface max-lg:order-1 sm:mx-0 sm:rounded-md lg:col-span-8 lg:row-start-2">
            {coverSrc ? (
              <Image
                src={coverSrc}
                unoptimized={preview}
                alt={campaign.cover?.alt ?? campaign.title}
                fill
                priority
                sizes="(min-width: 1024px) 792px, 100vw"
                className="object-cover"
              />
            ) : (
              <CoverPlaceholder type={campaign.type} />
            )}
          </div>

          <StickyAside className="max-lg:contents lg:sticky lg:top-24 lg:col-span-4 lg:col-start-9 lg:row-span-4 lg:row-start-1 lg:space-y-6 lg:self-start">
            <section
              aria-label={publicPrelaunch ? "Sắp ra mắt" : isGive ? "Ủng hộ chiến dịch" : "Ủng hộ dự án"}
              className="min-w-0 card p-4 max-lg:order-3 sm:p-6 lg:shadow-float"
            >
              {publicPrelaunch ? (
                <>
                  <Badge tone="info">Sắp ra mắt</Badge>
                  <p className="mt-3 text-sm text-muted">Mục tiêu gây quỹ</p>
                  <p className="mt-1">
                    <Money amount={campaign.goal_amount} size="xl" />
                  </p>
                  <p className="mt-3 text-sm text-muted">
                    {[
                      campaign.starts_at && `Dự kiến mở ngày ${formatDate(campaign.starts_at)}`,
                      campaign.ends_at && `Kết thúc ${formatDate(campaign.ends_at)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-3 text-sm text-muted">
                    {isGive
                      ? "Chiến dịch đã được duyệt và sắp mở nhận ủng hộ. Đăng ký để nhận thông báo ngay khi mở."
                      : "Dự án đã được duyệt và sắp mở nhận cam kết. Đăng ký để nhận thông báo ngay khi mở."}
                  </p>
                  <div className="mt-6 space-y-3">
                    <FollowButton
                      following={following}
                      count={followerCount}
                      signedIn={!!session}
                      loginHref={loginHref}
                      action={toggleCampaignFollow.bind(null, campaign.id, campaign.slug)}
                      followLabel="Nhận thông báo khi mở"
                      followingLabel="Đã đăng ký nhận thông báo"
                      countNoun="người đang chờ"
                      primary
                      full
                      size="lg"
                    />
                    <ShareButtons path={`/campaigns/${campaign.slug}`} title={campaign.title} origin={origin} />
                  </div>
                </>
              ) : (
                <>
                  <p>
                    <Money amount={raised} size="xl" />
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {isGive ? "Đã nhận" : "Đã cam kết"} trên mục tiêu{" "}
                    <span className="font-semibold text-fg tabular-nums">{formatVnd(campaign.goal_amount)}</span>
                  </p>
                  {options.progress_bar !== false && <ProgressBar percent={percent} className="mt-4" />}
                  {stats.length > 0 && (
                    <dl
                      className={clsx(
                        "mt-4 grid gap-4",
                        stats.length === 1
                          ? "grid-cols-[auto]"
                          : stats.length === 2
                            ? "grid-cols-[auto_auto] justify-between"
                            : "grid-cols-[auto_auto_auto] justify-between"
                      )}
                    >
                      {stats.map((stat) => (
                        <div key={stat.label} className="flex min-w-0 flex-col-reverse justify-end">
                          <dt className="text-sm text-muted">{stat.label}</dt>
                          <dd className="text-lg font-bold tabular-nums">{stat.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {options.backers_count !== false && monthlySupporters > 0 && (
                    <p className="mt-3 text-sm text-fg">
                      <span className="font-semibold tabular-nums">{monthlySupporters}</span> người ủng hộ hằng tháng
                    </p>
                  )}
                  {(campaign.ends_at || campaign.stretch_goal_amount) && (
                    <p className="mt-3 text-sm text-muted">
                      {[
                        campaign.ends_at && `Kết thúc ${formatDate(campaign.ends_at)}`,
                        campaign.stretch_goal_amount && `Mục tiêu mở rộng ${formatVnd(campaign.stretch_goal_amount)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}

                  <div className="mt-6 space-y-3">
                    {canDonate ? (
                      <>
                        <ButtonLink href="#ung-ho" size="lg" full>
                          {ctaLabel}
                        </ButtonLink>
                        {monthlyOpen && (
                          <Link
                            href="#hang-thang"
                            className="flex min-h-11 items-center justify-center text-sm font-semibold text-primary hover:underline"
                          >
                            Hoặc ủng hộ hằng tháng
                          </Link>
                        )}
                      </>
                    ) : canPledge ? (
                      <>
                        <ButtonLink href={pledgePath} size="lg" full>
                          {ctaLabel}
                        </ButtonLink>
                        {!session && <p className="text-center text-sm text-muted">Cần đăng nhập để cam kết ủng hộ.</p>}
                      </>
                    ) : (
                      <>
                        <Button disabled size="lg" full>
                          {ctaLabel}
                        </Button>
                        <p className="text-center text-sm text-muted">
                          {ownProject ? "Đây là dự án của bạn nên bạn không cam kết ủng hộ được." : closedNote}
                        </p>
                      </>
                    )}
                    {isPublicLiveOrEnded && (
                      <>
                        <FollowButton
                          following={following}
                          count={followerCount}
                          signedIn={!!session}
                          loginHref={loginHref}
                          action={toggleCampaignFollow.bind(null, campaign.id, campaign.slug)}
                          full
                        />
                        <ShareButtons
                          path={`/campaigns/${campaign.slug}`}
                          title={campaign.title}
                          origin={origin}
                          campaignId={campaign.id}
                        />
                        {posterData && <QrPosterButton data={posterData} />}
                        {!ownCampaign && (
                          <ReportCampaign campaignId={campaign.id} slug={campaign.slug} signedIn={!!session} />
                        )}
                      </>
                    )}
                  </div>
                </>
              )}

              <div className="mt-4 flex gap-3 border-t border-border pt-4 text-sm">
                <ShieldIcon className="mt-0.5 shrink-0 text-primary" />
                <p>
                  <span className="font-semibold">
                    {isGive ? "Tiền vào thẳng tài khoản của chiến dịch" : "Chỉ chuyển tiền khi dự án đạt mục tiêu"}
                  </span>
                  <br />
                  <span className="text-muted">
                    {isGive
                      ? "Mỗi khoản ủng hộ chuyển thẳng vào tài khoản nhận của chiến dịch. Give không giữ tiền."
                      : `Bạn cam kết trước. Nếu dự án không đạt ${formatVnd(campaign.goal_amount)}${campaign.ends_at ? ` trước ${formatDate(campaign.ends_at)}` : ""}, không ai phải trả. Đạt mục tiêu thì bạn thanh toán trong vòng ${campaign.payment_window_days} ngày.`}
                  </span>
                </p>
              </div>
            </section>

            {!publicPrelaunch && (
              <div className={`min-w-0 max-lg:order-5 ${isGive ? "max-lg:hidden" : ""}`}>
                {isGive ? (
                  statementRows && (
                    <RecentSupporters slug={campaign.slug} rows={statementRows} count={totals?.supporters_count ?? 0} />
                  )
                ) : (
                  <RewardTiers
                    tiers={tiers}
                    slug={campaign.slug}
                    open={canPledge}
                    closedNote={
                      ownProject
                        ? "Đây là dự án của bạn nên bạn không chọn mức được."
                        : preLaunch
                          ? "Bản xem trước: người ủng hộ chọn được mức khi dự án mở gây quỹ."
                          : closedNote
                    }
                  />
                )}
              </div>
            )}
          </StickyAside>

          <div className="min-w-0 space-y-8 max-lg:order-4 lg:col-span-8 lg:row-start-3 lg:pt-2">
            {isPublicLiveOrEnded && transparencySummary && (
              <TransparencySummaryBox
                slug={campaign.slug}
                summary={transparencySummary}
                showImpactReportLink={Boolean(publishedImpactReport)}
              />
            )}
            <TabNav label="Nội dung chiến dịch" items={tabs} />

            <section aria-labelledby="story-heading">
              <h2 id="story-heading" className="sr-only">
                Câu chuyện
              </h2>
              <div className="space-y-6">
                {pitchVideo && (
                  <CampaignVideo youtubeId={pitchVideo.youtube_id} title={campaign.title} alt={pitchVideo.alt} />
                )}
                {campaign.story || campaign.summary ? (
                  <div className="max-w-[68ch] space-y-4">
                    {campaign.summary && <p className="text-lg font-medium">{campaign.summary}</p>}
                    {campaign.story && <Markdown>{campaign.story}</Markdown>}
                  </div>
                ) : (
                  <EmptyState title="Chưa có câu chuyện">
                    Người tổ chức chưa viết nội dung cho chiến dịch này.
                  </EmptyState>
                )}
              </div>
            </section>

            {canDonate && (
              <section id="ung-ho" aria-labelledby="donate-heading" className="max-w-[640px] scroll-mt-24">
                <h2 id="donate-heading" className="text-h2">
                  Ủng hộ chiến dịch
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Góp từ {formatVnd(campaign.min_contribution)}. Tiền chuyển thẳng vào tài khoản nhận của chiến dịch.
                </p>
                <div className="mt-6 card p-4 sm:p-6">
                  <DonateForm campaignId={campaign.id} defaultName={session?.user.name ?? ""} signedIn={!!session} />
                </div>
              </section>
            )}

            {monthlyOpen && (
              <section id="hang-thang" aria-labelledby="monthly-heading" className="max-w-[640px] scroll-mt-24">
                <h2 id="monthly-heading" className="text-h2">
                  Ủng hộ hằng tháng
                </h2>
                <p className="mt-2 max-w-[68ch] text-sm text-muted">
                  Chọn số tiền và một ngày trong tháng. Mỗi tháng vào ngày đó, Give nhắc bạn kèm mã ủng hộ và mã QR mới
                  để bạn tự chuyển khoản. Give không tự trừ tiền: tháng nào bạn không chuyển cũng không sao, và bạn dừng
                  được bất cứ lúc nào. Lời nhắc tự dừng khi chiến dịch kết thúc ({formatDate(campaign.ends_at)}).
                </p>
                <div className="mt-6 card p-4 sm:p-6">
                  {session ? (
                    <MonthlyForm campaignId={campaign.id} defaultName={session.user.name ?? ""} />
                  ) : (
                    <div className="space-y-3">
                      <p className="text-fg">Cần đăng nhập để Give gửi lời nhắc và mã ủng hộ cho bạn mỗi tháng.</p>
                      <a href={loginHref} className={buttonClass({ variant: "secondary", size: "lg", full: true })}>
                        Đăng nhập để ủng hộ hằng tháng
                      </a>
                    </div>
                  )}
                </div>
              </section>
            )}

            {milestones.length > 0 && (
              <section aria-labelledby="milestones-heading">
                <h2 id="milestones-heading" className="text-h2">
                  Các mốc mục tiêu
                </h2>
                <MilestoneList
                  milestones={milestones}
                  raisedAmount={!isPublicLiveOrEnded || !totals ? null : raised}
                  preview={!isPublicLiveOrEnded}
                  rollups={isPublicLiveOrEnded ? transparencySummary?.milestone_rollups : undefined}
                  statementUrl={isPublicLiveOrEnded ? statementHref(campaign.slug, "out") : undefined}
                />
              </section>
            )}
          </div>

          <div className="min-w-0 space-y-12 max-lg:order-6 lg:col-span-8 lg:row-start-4 lg:pt-6">
            {publishedImpactReport && <ClosingImpactReport report={publishedImpactReport} />}
            {totals && <StatementPreview slug={campaign.slug} totals={totals} rows={statementRows} />}
            <AccountChanges changes={accountChanges} />
            {!preview && <CampaignTeam members={publicTeam} />}

            <section id="cap-nhat" aria-labelledby="updates-heading" className="scroll-mt-24">
              <h2 id="updates-heading" className="text-h2">
                Cập nhật
              </h2>
              {updates.length > 0 ? (
                <ol className="mt-6 space-y-4">
                  {updates.map((update) => (
                    <li key={update.id} className="card p-4 sm:p-6">
                      <p className="text-sm text-muted">{formatDate(update.published_at)}</p>
                      <h3 className="mt-1 text-h3">{update.title}</h3>
                      <div className="mt-2">
                        <Markdown>{update.body}</Markdown>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-6 text-muted">Chưa có cập nhật nào.</p>
              )}
            </section>

            {!preview && comments && (
              <CampaignComments
                campaignId={campaign.id}
                slug={campaign.slug}
                threads={comments.threads}
                totalTopLevel={comments.totalTopLevel}
                page={commentsPage}
                signedIn={!!session}
                ownCampaign={ownCampaign}
                isModerator={isModerator}
                showHidden={showHiddenComments}
              />
            )}
          </div>
        </div>
      </div>

      {(canDonate || canPledge) && (
        <MobileActionBar>
          <ShareButtons
            path={`/campaigns/${campaign.slug}`}
            title={campaign.title}
            origin={origin}
            campaignId={campaign.id}
            compact
          />
          <ButtonLink href={canDonate ? "#ung-ho" : pledgePath} size="lg" className="min-w-0 flex-1">
            {ctaLabel}
          </ButtonLink>
        </MobileActionBar>
      )}
    </article>
  )
}

/**
 * Below 1024px the main action stays at the bottom of the screen (sticky, so
 * it settles above the footer at the end of the page). While it shows, a
 * control focused from the keyboard is scrolled clear of it with its ring
 * (`data-action-bar`, globals.css; DESIGN.md 6, Focus ring).
 */
function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <div data-action-bar className="sticky bottom-0 z-30 border-t border-border bg-bg lg:hidden">
      <div className="container-page flex gap-2 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  )
}
