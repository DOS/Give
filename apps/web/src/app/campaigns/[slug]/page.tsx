import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache, type ReactNode } from "react"

import { AccountChanges } from "@/components/AccountChanges"
import { StatusBadge, TypeBadge, VerificationBadge } from "@/components/badges"
import { Markdown } from "@/components/Markdown"
import { MoneyTotals } from "@/components/MoneyTotals"
import { PledgeTotals } from "@/components/PledgeTotals"
import { ProgressBar } from "@/components/ProgressBar"
import { RewardTiers } from "@/components/RewardTiers"
import { ShareButtons } from "@/components/ShareButtons"
import { Button, ButtonLink } from "@/components/ui/Button"
import { CoverPlaceholder } from "@/components/ui/CoverPlaceholder"
import { EmptyState } from "@/components/ui/EmptyState"
import { ClockIcon, FlagIcon, HeartIcon, UsersIcon } from "@/components/ui/icons"
import { Money } from "@/components/ui/Money"
import { TabNav, type TabItem } from "@/components/ui/Tabs"
import { listPublicAccountChanges } from "@/lib/account-swaps"
import { siteOrigin } from "@/lib/auth/origin"
import { getSession } from "@/lib/auth/session"
import {
  discoveryHref,
  getCampaignBySlug,
  getPublicOrganizer,
  isPublicStatus,
  listMilestones,
  listPublishedUpdates,
  type PublicCampaign,
  type Db,
} from "@/lib/campaigns"
import { daysLeft, formatDate, formatVnd, progressPercent } from "@/lib/format"
import { acceptsPledges } from "@/lib/pledges"
import { listCampaignTiers, previewTiers } from "@/lib/reward-tiers"
import { SLUG_PATTERN } from "@/lib/slug"
import { privateCoverUrl, publicCoverUrl } from "@/lib/cover-urls"
import { getMoneyTotals, raisedAmount, statementHref } from "@/lib/statement"
import { dbAs, dbService } from "@/lib/supabase"
import { acceptsDonations, paymentAccount } from "@/server/contributions"
import { listPublicTiers, organizesCampaign } from "@/server/pledges"

import { DonateForm } from "./DonateForm"

/**
 * Public campaigns load as an anonymous visitor. If that finds nothing and
 * someone is signed in, retry as them: the organizer and staff may preview a
 * campaign that is not public yet (RLS decides).
 */
const loadCampaign = cache(
  async (slug: string): Promise<{ campaign: PublicCampaign; db: Db; preview: boolean } | null> => {
    if (!SLUG_PATTERN.test(slug) || slug.length > 80) return null
    const anon = dbAs()
    const published = await getCampaignBySlug(anon, slug)
    if (published && isPublicStatus(published.status)) return { campaign: published, db: anon, preview: false }

    const session = await getSession()
    if (!session) return null
    const db = dbAs(session.accessToken)
    const own = await getCampaignBySlug(db, slug).catch(() => null)
    return own ? { campaign: own, db, preview: !isPublicStatus(own.status) } : null
  }
)

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const loaded = await loadCampaign((await params).slug)
  if (!loaded) return { title: "Không tìm thấy" }
  const { campaign, preview } = loaded
  return {
    title: campaign.title,
    description: campaign.summary ?? undefined,
    robots: preview ? { index: false, follow: false } : undefined,
    openGraph:
      campaign.cover?.storage_path && !preview ? { images: [publicCoverUrl(campaign.cover.storage_path)] } : undefined,
  }
}

export default async function CampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const loaded = await loadCampaign((await params).slug)
  if (!loaded) notFound()
  const { campaign, db, preview } = loaded

  const isGive = campaign.type === "give"
  const donationsOpen = !preview && acceptsDonations(campaign)
  const pledgesOpen = !preview && acceptsPledges(campaign)
  const [milestones, updates, organizer, account, session, totals, accountChanges, tiers] = await Promise.all([
    listMilestones(db, campaign.id),
    listPublishedUpdates(db, campaign.id),
    preview ? Promise.resolve(null) : getPublicOrganizer(db, campaign.id),
    donationsOpen
      ? paymentAccount(dbService(), campaign.id).catch((error: unknown) => {
          // The page still renders, without the donate form.
          console.error("campaign page: payment account lookup failed", error)
          return null
        })
      : Promise.resolve(null),
    getSession(),
    // Public views only: a preview has no public totals yet.
    preview ? Promise.resolve(null) : getMoneyTotals(dbAs(), campaign.id),
    // A failed read hides the notice rather than the page; the statement shows it too.
    preview ? Promise.resolve([]) : listPublicAccountChanges(dbAs(), campaign.id).catch(() => []),
    // Reward tiers (DOS/Give#83): the public view, or the organizer's own active tiers in a preview.
    // A failed read hides the tiers rather than the page.
    isGive
      ? Promise.resolve([])
      : (preview ? listCampaignTiers(db, campaign.id).then(previewTiers) : listPublicTiers(dbAs(), campaign.id)).catch(
          (error: unknown) => {
            console.error("campaign page: reward tiers lookup failed", error)
            return []
          }
        ),
  ])
  const canDonate = donationsOpen && account !== null
  // The creator cannot back their own project (the database refuses it too).
  const ownProject =
    pledgesOpen && session ? await organizesCampaign(dbAs(session.accessToken), campaign.id, session.user.id) : false
  const closedNote = preview
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

  const tabs: TabItem[] = [
    { href: `/campaigns/${campaign.slug}`, label: "Câu chuyện", current: true },
    // The statement only exists for public campaigns.
    ...(preview
      ? []
      : [
          { href: statementHref(campaign.slug, "all"), label: "Sao kê", current: false },
          {
            href: statementHref(campaign.slug, "in"),
            label: isGive ? "Người ủng hộ" : "Người đồng hành",
            current: false,
          },
        ]),
  ]
  const coverSrc = campaign.cover?.storage_path
    ? preview
      ? privateCoverUrl(campaign.cover.storage_path)
      : publicCoverUrl(campaign.cover.storage_path)
    : null

  return (
    <article>
      {preview && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-amber-900">
          Bản xem trước: chiến dịch đang ở trạng thái <StatusBadge status={campaign.status} /> và chưa công khai.
        </div>
      )}

      <header className="container-page pt-8 sm:pt-10">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <TypeBadge type={campaign.type} />
          {campaign.category && (
            <Link
              href={discoveryHref({ type: campaign.type, category: campaign.category.slug })}
              className="inline-flex min-h-11 items-center text-muted hover:text-ink hover:underline"
            >
              {campaign.category.name}
            </Link>
          )}
          {!preview && campaign.status !== "live" && <StatusBadge status={campaign.status} />}
        </div>
        <h1 className="mt-2 max-w-4xl text-[1.75rem] leading-tight font-bold tracking-tight sm:text-4xl sm:leading-tight">
          {campaign.title}
        </h1>
        {campaign.summary && <p className="mt-3 max-w-3xl text-lg text-body">{campaign.summary}</p>}
      </header>

      <div className="container-page mt-6 grid gap-8 pb-16 sm:mt-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-12 lg:gap-y-8">
        {/* DOM order is the phone order (cover, funding card, story, tiers and totals); lg places them in two columns. */}
        <div className="relative aspect-[16/9] overflow-hidden rounded bg-surface lg:col-start-1 lg:row-start-1">
          {coverSrc ? (
            <Image
              src={coverSrc}
              unoptimized={preview}
              alt={campaign.cover?.alt ?? campaign.title}
              fill
              priority
              sizes="(min-width: 1024px) 720px, 100vw"
              className="object-cover"
            />
          ) : (
            <CoverPlaceholder type={campaign.type} />
          )}
        </div>

        <section
          aria-label={isGive ? "Ủng hộ chiến dịch" : "Ủng hộ dự án"}
          className="space-y-5 card p-5 shadow-[0_12px_32px_-16px_rgb(17_24_39/0.18)] sm:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          <div>
            <p>
              <Money amount={raised} size="xl" />
            </p>
            <p className="mt-1 text-body">
              {isGive ? "đã nhận" : "đã cam kết"} trên mục tiêu{" "}
              <span className="font-semibold text-ink tabular-nums">{formatVnd(campaign.goal_amount)}</span>
            </p>
          </div>
          {options.progress_bar !== false && <ProgressBar percent={percent} />}
          {!isGive && totals && <PledgeTotals totals={totals} />}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            {options.backers_count !== false && totals && (
              <Stat
                icon={<UsersIcon width={16} height={16} />}
                label={isGive ? "Người ủng hộ" : "Người đồng hành"}
                value={String(isGive ? totals.supporters_count : totals.backers_count)}
              />
            )}
            {options.time_remaining !== false && days !== null && (
              <Stat
                icon={<ClockIcon width={16} height={16} />}
                label="Thời gian còn lại"
                value={days > 0 ? `${days} ngày` : "Đã hết hạn"}
              />
            )}
            <Stat label="Góp tối thiểu" value={formatVnd(campaign.min_contribution)} />
            {campaign.stretch_goal_amount && (
              <Stat label="Mục tiêu mở rộng" value={formatVnd(campaign.stretch_goal_amount)} />
            )}
            <Stat label="Kết thúc" value={formatDate(campaign.ends_at)} />
          </dl>
          <div className="space-y-3 border-t border-line pt-5">
            {canDonate ? (
              <DonateForm campaignId={campaign.id} defaultName={session?.user.name ?? ""} signedIn={!!session} />
            ) : pledgesOpen && !ownProject ? (
              <>
                <ButtonLink href={`/campaigns/${campaign.slug}/pledge`} size="lg" full>
                  Ủng hộ dự án
                </ButtonLink>
                {!session && <p className="text-center text-sm text-muted">Cần đăng nhập để cam kết ủng hộ.</p>}
              </>
            ) : (
              <>
                <Button disabled size="lg" full>
                  {isGive ? "Ủng hộ" : "Ủng hộ dự án"}
                </Button>
                <p className="text-center text-muted">
                  {ownProject ? "Đây là dự án của bạn nên bạn không cam kết ủng hộ được." : closedNote}
                </p>
              </>
            )}
            {!isGive && (
              <p className="rounded-md bg-accent-50 px-4 py-3 text-accent-800">
                Dự án theo hình thức “đạt mục tiêu mới thanh toán”: bạn cam kết trước, chỉ trả tiền khi dự án đạt mục
                tiêu, trong vòng {campaign.payment_window_days} ngày.
              </p>
            )}
          </div>
          {!preview && (
            <div className="space-y-1">
              <ShareButtons path={`/campaigns/${campaign.slug}`} title={campaign.title} origin={siteOrigin()} />
              {/* No campaign report flow yet: the statement takes reports on evidence images (DOS/Give#58). */}
              <Link
                href={statementHref(campaign.slug, "out")}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 text-muted hover:text-ink hover:underline"
              >
                <FlagIcon width={18} height={18} />
                Báo cáo chứng từ có vấn đề
              </Link>
            </div>
          )}
        </section>

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-span-2 lg:row-start-2">
          {(organizer || (isGive && campaign.beneficiary_name)) && (
            <div className="grid gap-6 sm:grid-cols-2">
              {organizer && (
                <div className="flex items-start gap-3">
                  <span
                    className="inline-flex size-12 shrink-0 items-center justify-center rounded bg-brand-50 text-lg font-bold text-brand-800"
                    aria-hidden
                  >
                    {organizer.display_name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-muted">
                      {organizer.kind === "organization" ? "Tổ chức gây quỹ" : "Người gây quỹ"}
                    </p>
                    <p className="font-semibold break-words text-ink">{organizer.display_name}</p>
                    <div className="mt-1">
                      <VerificationBadge status={organizer.verification_status} />
                    </div>
                  </div>
                </div>
              )}
              {isGive && campaign.beneficiary_name && (
                <div className="flex items-start gap-3">
                  <span
                    className="inline-flex size-12 shrink-0 items-center justify-center rounded bg-accent-100 text-accent-800"
                    aria-hidden
                  >
                    <HeartIcon width={22} height={22} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-muted">Người thụ hưởng</p>
                    <p className="font-semibold break-words text-ink">{campaign.beneficiary_name}</p>
                    {campaign.beneficiary_relation && (
                      <p className="text-body">Quan hệ: {campaign.beneficiary_relation}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <TabNav label="Nội dung chiến dịch" items={tabs} />

          <section aria-labelledby="story-heading">
            <h2 id="story-heading" className="sr-only">
              Câu chuyện
            </h2>
            {campaign.story ? (
              <div className="max-w-prose text-lg">
                <Markdown>{campaign.story}</Markdown>
              </div>
            ) : (
              <EmptyState title="Chưa có câu chuyện">Người tổ chức chưa viết nội dung cho chiến dịch này.</EmptyState>
            )}
          </section>

          {milestones.length > 0 && (
            <section aria-labelledby="milestones-heading">
              <h2 id="milestones-heading" className="mb-4 text-xl font-bold">
                Các mốc mục tiêu
              </h2>
              <ol className="space-y-3">
                {milestones.map((milestone) => (
                  <li key={milestone.id} className="card p-4 sm:p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-semibold">{milestone.title}</h3>
                      <span className="font-semibold text-ink tabular-nums">{formatVnd(milestone.target_amount)}</span>
                    </div>
                    {milestone.description && <p className="mt-1 text-body">{milestone.description}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="updates-heading">
            <h2 id="updates-heading" className="mb-4 flex items-baseline gap-2 text-xl font-bold">
              Cập nhật
              {updates.length > 0 && <span className="text-base font-normal text-muted">({updates.length})</span>}
            </h2>
            {updates.length > 0 ? (
              <ol className="space-y-8 border-l-2 border-brand-100 pl-6">
                {updates.map((update) => (
                  <li key={update.id}>
                    <p className="text-sm text-muted">{formatDate(update.published_at)}</p>
                    <h3 className="mt-1 text-lg font-semibold">{update.title}</h3>
                    <div className="mt-2">
                      <Markdown>{update.body}</Markdown>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted">Chưa có cập nhật nào.</p>
            )}
          </section>
        </div>

        <div className="space-y-6 lg:col-start-2 lg:row-start-3">
          {!isGive && (
            <RewardTiers
              tiers={tiers}
              slug={campaign.slug}
              open={pledgesOpen && !ownProject}
              closedNote={
                ownProject
                  ? "Đây là dự án của bạn nên bạn không chọn mức được."
                  : preview
                    ? "Bản xem trước: người ủng hộ chọn được mức khi dự án mở gây quỹ."
                    : closedNote
              }
            />
          )}

          {totals && <MoneyTotals totals={totals} statementHref={statementHref(campaign.slug, "all")} />}

          <AccountChanges changes={accountChanges} />
        </div>
      </div>
    </article>
  )
}

function Stat({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-sm text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  )
}
