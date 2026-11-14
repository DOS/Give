import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache, type ReactNode } from "react"

import { AccountChanges } from "@/components/AccountChanges"
import { StatusBadge, TypeBadge } from "@/components/badges"
import { RecentSupporters } from "@/components/campaign/RecentSupporters"
import { StatementPreview } from "@/components/campaign/StatementPreview"
import { StickyAside } from "@/components/campaign/StickyAside"
import { Markdown } from "@/components/Markdown"
import { ProgressBar } from "@/components/ProgressBar"
import { RewardTiers } from "@/components/RewardTiers"
import { ShareButtons } from "@/components/ShareButtons"
import { Button, ButtonLink } from "@/components/ui/Button"
import { CoverPlaceholder } from "@/components/ui/CoverPlaceholder"
import { EmptyState } from "@/components/ui/EmptyState"
import { CheckIcon, FlagIcon, ShieldIcon } from "@/components/ui/icons"
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
  VERIFICATION_LABELS,
  type PublicCampaign,
  type Db,
} from "@/lib/campaigns"
import { daysLeft, formatDate, formatVnd, progressPercent } from "@/lib/format"
import { acceptsPledges } from "@/lib/pledges"
import { listCampaignTiers, previewTiers } from "@/lib/reward-tiers"
import { SLUG_PATTERN } from "@/lib/slug"
import { privateCoverUrl, publicCoverUrl } from "@/lib/cover-urls"
import { getMoneyTotals, listStatement, raisedAmount, statementHref } from "@/lib/statement"
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

/** "Từ thiện" for give, "Dự án sáng tạo" for back, as discovery names them. */
const TYPE_NAMES = { give: "Từ thiện", back: "Dự án sáng tạo" } as const

/**
 * The campaign page (DESIGN.md 8): breadcrumb, H1 and the organizer line,
 * then an 8/4 grid from 1024px: cover, tabs, story, statement and updates in
 * the main column; the funding box and either recent supporters (give) or
 * the reward tiers (back) in the sticky sidebar. Below 1024px the funding
 * box follows the title, and a bar at the bottom of the screen keeps the
 * main action in reach.
 */
export default async function CampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const loaded = await loadCampaign((await params).slug)
  if (!loaded) notFound()
  const { campaign, db, preview } = loaded

  const isGive = campaign.type === "give"
  const donationsOpen = !preview && acceptsDonations(campaign)
  const pledgesOpen = !preview && acceptsPledges(campaign)
  const [milestones, updates, organizer, account, session, totals, accountChanges, tiers, statementRows] =
    await Promise.all([
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
        : (preview
            ? listCampaignTiers(db, campaign.id).then(previewTiers)
            : listPublicTiers(dbAs(), campaign.id)
          ).catch((error: unknown) => {
            console.error("campaign page: reward tiers lookup failed", error)
            return []
          }),
      // The newest rows of the public statement, for its preview and the recent supporters.
      // A failed read leaves them out; the statement page has them all.
      preview
        ? Promise.resolve(null)
        : listStatement(dbAs(), campaign.id, "all", 1)
            .then(({ rows }) => rows)
            .catch((error: unknown) => {
              console.error("campaign page: statement lookup failed", error)
              return null
            }),
    ])
  const canDonate = donationsOpen && account !== null
  // The creator cannot back their own project (the database refuses it too).
  const ownProject =
    pledgesOpen && session ? await organizesCampaign(dbAs(session.accessToken), campaign.id, session.user.id) : false
  const canPledge = pledgesOpen && !ownProject
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
  const people = totals ? (isGive ? totals.supporters_count : totals.backers_count) : null
  const pledgePath = `/campaigns/${campaign.slug}/pledge`
  const ctaLabel = isGive ? "Ủng hộ" : "Ủng hộ dự án"

  const tabs: TabItem[] = [
    { href: `/campaigns/${campaign.slug}`, label: "Câu chuyện", current: true },
    // The statement only exists for public campaigns.
    ...(preview ? [] : [{ href: statementHref(campaign.slug, "all"), label: "Sao kê", current: false }]),
    ...(updates.length > 0 ? [{ href: "#cap-nhat", label: "Cập nhật", current: false, count: updates.length }] : []),
    ...(preview
      ? []
      : [
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

  const stats = [
    options.backers_count !== false && people !== null
      ? { value: String(people), label: isGive ? "người ủng hộ" : "người đồng hành" }
      : null,
    options.time_remaining !== false && days !== null
      ? { value: String(Math.max(0, days)), label: days > 0 ? "ngày còn lại" : "đã hết hạn" }
      : null,
    options.progress_bar !== false ? { value: `${percent}%`, label: "mục tiêu" } : null,
  ].filter((stat) => stat !== null)

  return (
    <article>
      {preview && (
        <div className="bg-warning-soft py-3">
          <p className="container-page">
            Bản xem trước: chiến dịch đang ở trạng thái <StatusBadge status={campaign.status} /> và chưa công khai.
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
              {!preview && campaign.status !== "live" && <StatusBadge status={campaign.status} />}
            </div>
            <h1 className="mt-3 text-h1-phone tracking-tight break-words sm:text-h1">{campaign.title}</h1>
            {(organizer || (isGive && campaign.beneficiary_name)) && (
              <div className="mt-4 flex items-start gap-3 text-sm">
                {organizer && (
                  <span
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded bg-surface font-bold text-muted"
                    aria-hidden
                  >
                    {organizer.display_name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  {organizer && (
                    <>
                      <p className="flex items-center gap-1 font-semibold break-words">
                        {organizer.display_name}
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
              aria-label={isGive ? "Ủng hộ chiến dịch" : "Ủng hộ dự án"}
              className="min-w-0 card p-4 max-lg:order-3 sm:p-6 lg:shadow-float"
            >
              <p>
                <Money amount={raised} size="xl" />
              </p>
              <p className="mt-1 text-sm text-muted">
                {isGive ? "Đã nhận" : "Đã cam kết"} trên mục tiêu{" "}
                <span className="font-semibold text-fg tabular-nums">{formatVnd(campaign.goal_amount)}</span>
              </p>
              {options.progress_bar !== false && <ProgressBar percent={percent} className="mt-4" />}
              {stats.length > 0 && (
                <dl className="mt-4 grid grid-cols-[auto_auto_auto] justify-between gap-4">
                  {stats.map((stat) => (
                    <div key={stat.label} className="flex min-w-0 flex-col-reverse justify-end">
                      <dt className="text-sm text-muted">{stat.label}</dt>
                      <dd className="text-lg font-bold tabular-nums">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
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
                  <ButtonLink href="#ung-ho" size="lg" full>
                    {ctaLabel}
                  </ButtonLink>
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
                {!preview && (
                  <>
                    <ShareButtons path={`/campaigns/${campaign.slug}`} title={campaign.title} origin={siteOrigin()} />
                    {/* No campaign report flow yet: the statement takes reports on evidence images (DOS/Give#58). */}
                    <Link
                      href={statementHref(campaign.slug, "out")}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 text-sm text-muted hover:text-fg hover:underline"
                    >
                      <FlagIcon width={16} height={16} />
                      Báo cáo chứng từ có vấn đề
                    </Link>
                  </>
                )}
              </div>

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
                      : preview
                        ? "Bản xem trước: người ủng hộ chọn được mức khi dự án mở gây quỹ."
                        : closedNote
                  }
                />
              )}
            </div>
          </StickyAside>

          <div className="min-w-0 space-y-8 max-lg:order-4 lg:col-span-8 lg:row-start-3 lg:pt-2">
            <TabNav label="Nội dung chiến dịch" items={tabs} />

            <section aria-labelledby="story-heading">
              <h2 id="story-heading" className="sr-only">
                Câu chuyện
              </h2>
              {campaign.story || campaign.summary ? (
                <div className="max-w-[68ch] space-y-4">
                  {campaign.summary && <p className="text-lg font-medium">{campaign.summary}</p>}
                  {campaign.story && <Markdown>{campaign.story}</Markdown>}
                </div>
              ) : (
                <EmptyState title="Chưa có câu chuyện">Người tổ chức chưa viết nội dung cho chiến dịch này.</EmptyState>
              )}
            </section>

            {canDonate && (
              <section id="ung-ho" aria-labelledby="donate-heading" className="max-w-[640px] scroll-mt-24">
                <h2 id="donate-heading" className="text-h2">
                  Ủng hộ chiến dịch
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Góp từ {formatVnd(campaign.min_contribution)}. Tiền chuyển thẳng vào tài khoản nhận của chiến dịch.
                </p>
                <div className="mt-4 card p-4 sm:p-6">
                  <DonateForm campaignId={campaign.id} defaultName={session?.user.name ?? ""} signedIn={!!session} />
                </div>
              </section>
            )}

            {milestones.length > 0 && (
              <section aria-labelledby="milestones-heading">
                <h2 id="milestones-heading" className="text-h2">
                  Các mốc mục tiêu
                </h2>
                <ol className="mt-4">
                  {milestones.map((milestone) => (
                    <li key={milestone.id} className="border-b border-border py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-semibold">{milestone.title}</h3>
                        <span className="font-semibold tabular-nums">{formatVnd(milestone.target_amount)}</span>
                      </div>
                      {milestone.description && <p className="mt-1 text-muted">{milestone.description}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>

          <div className="min-w-0 space-y-12 max-lg:order-6 lg:col-span-8 lg:row-start-4 lg:pt-6">
            {totals && <StatementPreview slug={campaign.slug} totals={totals} rows={statementRows} />}
            <AccountChanges changes={accountChanges} />

            <section id="cap-nhat" aria-labelledby="updates-heading" className="scroll-mt-24">
              <h2 id="updates-heading" className="text-h2">
                Cập nhật
              </h2>
              {updates.length > 0 ? (
                <ol className="mt-4 space-y-4">
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
                <p className="mt-2 text-muted">Chưa có cập nhật nào.</p>
              )}
            </section>
          </div>
        </div>
      </div>

      {(canDonate || canPledge) && (
        <MobileActionBar>
          <ShareButtons path={`/campaigns/${campaign.slug}`} title={campaign.title} origin={siteOrigin()} compact />
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
