import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { ThankYouCardButton } from "@/components/ThankYouCardButton"
import { Badge } from "@/components/ui/Badge"
import { ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { HeartIcon, SparkIcon } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/PageHeader"
import { PledgeStatusBadge } from "@/components/ui/PledgeStatusBadge"
import { SkeletonList } from "@/components/ui/Skeleton"
import { siteOrigin } from "@/lib/auth/origin"
import { requireSession, type Session } from "@/lib/auth/session"
import { isPublicStatus, type CampaignStatus } from "@/lib/campaigns"
import { donationStatusLabel } from "@/lib/contributions"
import {
  getMyDonorImpactSummary,
  listMyFollowedOrganizers,
  type DonorImpactSummary,
  type FollowedOrganizer,
} from "@/lib/follows"
import { formatDate, formatVnd } from "@/lib/format"
import { periodLabel, planDonationPayable, vnMonthStart } from "@/lib/plans"
import { fulfillmentLabel, offersPayment, pledgeListSummary, withoutReplacedPledges } from "@/lib/pledges"
import { dbAs, dbService } from "@/lib/supabase"
import { isThankYouCardEligible } from "@/lib/viral-sharing"
import { paymentAccounts } from "@/server/contributions"
import { pledgeBalances, type PledgeBalance } from "@/server/pledges"

import { MePage } from "../_components/MePage"
import { DONATION_TONES, toneOf } from "../_components/tones"
import { RefCode } from "@/components/ui/RefCode"

import { DonorImpactCard } from "./DonorImpactCard"
import { currentPlanDonation, PlanList, type MyPlan } from "./PlanList"

export const metadata: Metadata = { title: "Ủng hộ của tôi", robots: { index: false } }

interface MyContribution {
  id: string
  kind: "donation" | "pledge"
  campaign_id: string
  reference_code: string
  intended_amount: number
  received_amount: number
  status: string
  public_name?: string | null
  is_anonymous: boolean
  payment_due_at: string | null
  fulfillment_status: string | null
  reward_tier_id: string | null
  created_at: string
  /** Set on a monthly plan's donation (DOS/Give#276). */
  plan_id: string | null
  plan_period: string | null
  campaign: { slug: string; title: string; status: CampaignStatus } | null
}

export default async function MyContributionsPage() {
  const session = await requireSession("/me/contributions")

  return (
    <MePage section="contributions">
      <PageHeader title="Ủng hộ của tôi">
        Các lượt ủng hộ chiến dịch từ thiện và cam kết dự án sáng tạo của bạn, mới nhất ở trên.
      </PageHeader>
      <Suspense fallback={<SkeletonList label="Đang tải lượt ủng hộ…" />}>
        <ContributionList session={session} />
      </Suspense>
    </MePage>
  )
}

/**
 * Marks each active plan whose current-month donation is otherwise payable
 * with whether its campaign has a usable account (give.payment_account, as
 * the service role, deduped and bounded in parallel), so "Chuyển khoản tháng
 * này" is offered only when the payment page can show a QR, as
 * give.plan_donation_payable decides. Plans without an awaiting current-month
 * donation skip the lookup; a failed lookup leaves it unknown and the payment
 * page checks again.
 */
async function withUsableAccounts(plans: MyPlan[], donations: readonly MyContribution[], now: Date): Promise<MyPlan[]> {
  const month = vnMonthStart(now)
  const ids = plans
    .filter((p) => {
      if (p.status !== "active" || !p.campaign) return false
      const current = currentPlanDonation(p.campaign_id, donations, month)
      return current !== null && planDonationPayable({ ...current, campaign: p.campaign }, now)
    })
    .map((p) => p.campaign_id)
  if (ids.length === 0) return plans

  const accounts = await paymentAccounts(dbService(), ids, {
    onError: (campaignId, error) => {
      const rawCode = (error as { code?: unknown } | null)?.code
      const code = typeof rawCode === "string" && rawCode.length > 0 ? rawCode : undefined
      console.error(
        JSON.stringify({
          event: "contributions.payment_account_lookup_failed",
          campaign_id: campaignId,
          ...(code ? { code } : {}),
        })
      )
    },
  })
  return plans.map((p) =>
    p.campaign && accounts.has(p.campaign_id)
      ? { ...p, campaign: { ...p.campaign, usable_account: accounts.get(p.campaign_id) !== null } }
      : p
  )
}

/**
 * The signed-in user's donations and pledges, read with their own token under
 * RLS. Pledges that change_pledge replaced are hidden; the current one shows
 * its payment and, once paid, its delivery status (section 4.2 step 7).
 * Pledge amounts are net of refunds and the stop on payment requests is
 * shown (give.pledge_balances, DOS/Give#89), read as the service role for the
 * user the RLS read above has just proved.
 *
 * Monthly plans (DOS/Give#276) come first, also read under RLS; this month's
 * donation of each is among the newest contributions.
 */
async function ContributionList({ session }: { session: Session }) {
  const db = dbAs(session.accessToken)
  const [{ data, error }, plansRead, impactSummary, followedOrganizers] = await Promise.all([
    db
      .from("contributions")
      .select(
        "id, kind, campaign_id, reference_code, intended_amount, received_amount, status, public_name, is_anonymous, payment_due_at, " +
          "fulfillment_status, reward_tier_id, created_at, plan_id, plan_period, campaign:campaigns(slug, title, status)"
      )
      .eq("contributor_user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("donation_plans")
      .select(
        "id, campaign_id, amount, day_of_month, status, ended_reason, next_period, created_at, ended_at, " +
          "campaign:campaigns(slug, title, status, ends_at)"
      )
      .eq("contributor_user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    getMyDonorImpactSummary(db).catch((e: unknown) => {
      console.error("contributions: donor impact summary lookup failed", e)
      return null as DonorImpactSummary | null
    }),
    listMyFollowedOrganizers(db).catch((e: unknown) => {
      console.error("contributions: followed organizers lookup failed", e)
      return [] as FollowedOrganizer[]
    }),
  ])
  if (error) throw error
  if (plansRead.error) throw plansRead.error
  const now = new Date()
  const contributions = withoutReplacedPledges((data ?? []) as unknown as MyContribution[])
  const planDonations = contributions.filter((c) => c.plan_id !== null)
  const [plans, balances] = await Promise.all([
    withUsableAccounts((plansRead.data ?? []) as unknown as MyPlan[], planDonations, now),
    contributions.some((c) => c.kind === "pledge")
      ? pledgeBalances(dbService(), session.user.id).catch((e: unknown) => {
          // The list still renders; pledge lines leave out what refunds could change.
          console.error("contributions: pledge balances lookup failed", e)
          return new Map<string, PledgeBalance>()
        })
      : Promise.resolve(new Map<string, PledgeBalance>()),
  ])

  const showImpactCard =
    impactSummary !== null &&
    (contributions.length > 0 ||
      plans.length > 0 ||
      impactSummary.total_matched_vnd > 0 ||
      impactSummary.followed_campaigns_count > 0 ||
      impactSummary.followed_organizers_count > 0)

  if (contributions.length === 0 && plans.length === 0) {
    return (
      <div className="space-y-8">
        {showImpactCard && <DonorImpactCard summary={impactSummary} followedOrganizers={followedOrganizers} />}
        <EmptyState
          level={2}
          title="Bạn chưa ủng hộ chiến dịch hay dự án nào."
          action={<ButtonLink href="/campaigns">Khám phá chiến dịch</ButtonLink>}
        >
          Mỗi lượt ủng hộ có một mã riêng; bạn theo dõi tiền đã đến đâu ngay tại đây.
        </EmptyState>
      </div>
    )
  }

  const origin = siteOrigin()

  return (
    <div className="space-y-10">
      {showImpactCard && <DonorImpactCard summary={impactSummary} followedOrganizers={followedOrganizers} />}
      {plans.length > 0 && <PlanList plans={plans} donations={planDonations} now={now} />}
      {contributions.length > 0 &&
        (plans.length > 0 ? (
          <section aria-labelledby="all-contributions-title" className="space-y-4">
            <h2 id="all-contributions-title" className="text-h2">
              Tất cả lượt ủng hộ
            </h2>
            <MyContributionItems
              contributions={contributions}
              balances={balances}
              donorFallbackName={session.user.name}
              origin={origin}
            />
          </section>
        ) : (
          <MyContributionItems
            contributions={contributions}
            balances={balances}
            donorFallbackName={session.user.name}
            origin={origin}
          />
        ))}
    </div>
  )
}

function MyContributionItems({
  contributions,
  balances,
  donorFallbackName,
  origin,
}: {
  contributions: MyContribution[]
  balances: Map<string, PledgeBalance>
  donorFallbackName: string | null
  origin?: string
}) {
  return (
    <ul className="divide-y divide-border card">
      {contributions.map((c) => {
        const pledge = c.kind === "pledge"
        const Icon = pledge ? SparkIcon : HeartIcon
        const balance = balances.get(c.id) ?? null
        const receivedAmount = Number(c.received_amount)
        const cardAmount =
          pledge && balance
            ? Math.max(0, Number(balance.received_amount) - Number(balance.refunded_amount))
            : receivedAmount
        const hasPublicCampaign = c.campaign !== null && isPublicStatus(c.campaign.status)
        const canShareThankYou = isThankYouCardEligible({
          kind: c.kind,
          status: c.status,
          receivedAmount: cardAmount,
          hasPublicCampaign,
        })
        const thankYouCard =
          canShareThankYou && c.campaign
            ? {
                kind: c.kind,
                referenceCode: c.reference_code,
                amount: cardAmount,
                campaignTitle: c.campaign.title,
                campaignSlug: c.campaign.slug,
                campaignType: pledge ? ("back" as const) : ("give" as const),
                donorName: c.is_anonymous ? null : c.public_name?.trim() || donorFallbackName,
                isAnonymous: c.is_anonymous,
                createdAt: c.created_at,
                origin,
              }
            : null
        return (
          <li key={c.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-6">
            <div className="flex min-w-0 flex-1 gap-4">
              <span
                aria-hidden
                className={`hidden size-11 shrink-0 items-center justify-center rounded sm:flex ${pledge ? "bg-accent-soft text-accent" : "bg-primary-soft text-primary"}`}
              >
                <Icon width={20} height={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {pledge ? (
                    <PledgeStatusBadge status={c.status} />
                  ) : (
                    <Badge tone={toneOf(DONATION_TONES, c.status)}>{donationStatusLabel(c.status)}</Badge>
                  )}
                  {pledge && <span className="text-sm text-muted">Cam kết dự án</span>}
                  {pledge && c.status === "paid" && c.reward_tier_id && (
                    <span className="text-sm text-fg">Giao quà: {fulfillmentLabel(c.fulfillment_status)}</span>
                  )}
                  {c.plan_period && (
                    <span className="text-sm text-muted">Hằng tháng · tháng {periodLabel(c.plan_period)}</span>
                  )}
                  {c.is_anonymous && <span className="text-sm text-muted">Ẩn danh</span>}
                </div>
                {c.campaign ? (
                  <Link
                    href={`/campaigns/${c.campaign.slug}`}
                    className="mt-2 block text-h3 break-words text-fg hover:text-primary hover:underline"
                  >
                    {c.campaign.title}
                  </Link>
                ) : (
                  <p className="mt-2 text-h3 text-muted">Chiến dịch không còn công khai</p>
                )}
                <p className="mt-1 break-words text-fg">
                  {pledge
                    ? pledgeListSummary(c, balance)
                    : c.status === "received"
                      ? `Đã nhận ${formatVnd(c.received_amount)}`
                      : `Dự định ${formatVnd(c.intended_amount)}`}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Mã <RefCode>{c.reference_code}</RefCode> · {formatDate(c.created_at)}
                </p>
              </div>
            </div>
            {pledge ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {thankYouCard && (
                  <ThankYouCardButton card={thankYouCard} label="Thẻ “Tôi đã chung tay”" className="shrink-0" />
                )}
                <ButtonLink
                  href={`/me/pledges/${c.reference_code}`}
                  variant={offersPayment(c, balance) ? "primary" : "secondary"}
                  className="shrink-0"
                >
                  {offersPayment(c, balance) ? "Thanh toán" : "Xem cam kết"}
                </ButtonLink>
              </div>
            ) : thankYouCard ? (
              <ThankYouCardButton card={thankYouCard} label="Thẻ “Tôi đã chung tay”" className="shrink-0" />
            ) : (
              c.status !== "received" && (
                <ButtonLink href={`/donations/${c.reference_code}`} variant="secondary" className="shrink-0">
                  {c.status === "awaiting_transfer" ? "Xem cách chuyển khoản" : "Xem trạng thái"}
                </ButtonLink>
              )
            )}
          </li>
        )
      })}
    </ul>
  )
}
