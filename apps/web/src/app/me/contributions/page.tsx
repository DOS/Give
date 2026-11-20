import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { Badge } from "@/components/ui/Badge"
import { ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { HeartIcon, SparkIcon } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/PageHeader"
import { PledgeStatusBadge } from "@/components/ui/PledgeStatusBadge"
import { SkeletonList } from "@/components/ui/Skeleton"
import { requireSession, type Session } from "@/lib/auth/session"
import { donationStatusLabel } from "@/lib/contributions"
import { formatDate, formatVnd } from "@/lib/format"
import { periodLabel } from "@/lib/plans"
import { fulfillmentLabel, offersPayment, pledgeListSummary, withoutReplacedPledges } from "@/lib/pledges"
import { dbAs, dbService } from "@/lib/supabase"
import { paymentAccount } from "@/server/contributions"
import { pledgeBalances, type PledgeBalance } from "@/server/pledges"

import { MePage } from "../_components/MePage"
import { DONATION_TONES, toneOf } from "../_components/tones"
import { RefCode } from "@/components/ui/RefCode"

import { PlanList, type MyPlan } from "./PlanList"

export const metadata: Metadata = { title: "Ủng hộ của tôi", robots: { index: false } }

interface MyContribution {
  id: string
  kind: "donation" | "pledge"
  campaign_id: string
  reference_code: string
  intended_amount: number
  received_amount: number
  status: string
  is_anonymous: boolean
  payment_due_at: string | null
  fulfillment_status: string | null
  reward_tier_id: string | null
  created_at: string
  /** Set on a monthly plan's donation (DOS/Give#276). */
  plan_id: string | null
  plan_period: string | null
  campaign: { slug: string; title: string } | null
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
/**
 * Marks each active plan's live campaign with whether it has a usable
 * account (give.payment_account, as the service role, for campaigns the
 * donor's own plans name), so "Chuyển khoản tháng này" is offered only when
 * the payment page can show a QR, as give.plan_donation_payable decides. A
 * failed lookup leaves it unknown; the payment page checks again.
 */
async function withUsableAccounts(plans: MyPlan[]): Promise<MyPlan[]> {
  const ids = [
    ...new Set(plans.filter((p) => p.status === "active" && p.campaign?.status === "live").map((p) => p.campaign_id)),
  ]
  if (ids.length === 0) return plans
  const service = dbService()
  const usable = new Map(
    await Promise.all(
      ids.map(async (id) => {
        const account = await paymentAccount(service, id).catch((e: unknown) => {
          console.error("contributions: payment account lookup failed", e)
          return undefined
        })
        return [id, account === undefined ? undefined : account !== null] as const
      })
    )
  )
  return plans.map((p) =>
    p.campaign && usable.get(p.campaign_id) !== undefined
      ? { ...p, campaign: { ...p.campaign, usable_account: usable.get(p.campaign_id) } }
      : p
  )
}

async function ContributionList({ session }: { session: Session }) {
  const db = dbAs(session.accessToken)
  const [{ data, error }, plansRead] = await Promise.all([
    db
      .from("contributions")
      .select(
        "id, kind, campaign_id, reference_code, intended_amount, received_amount, status, is_anonymous, payment_due_at, " +
          "fulfillment_status, reward_tier_id, created_at, plan_id, plan_period, campaign:campaigns(slug, title)"
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
  ])
  if (error) throw error
  if (plansRead.error) throw plansRead.error
  const plans = await withUsableAccounts((plansRead.data ?? []) as unknown as MyPlan[])
  const contributions = withoutReplacedPledges((data ?? []) as unknown as MyContribution[])
  const balances: Map<string, PledgeBalance> = contributions.some((c) => c.kind === "pledge")
    ? await pledgeBalances(dbService(), session.user.id).catch((e: unknown) => {
        // The list still renders; pledge lines leave out what refunds could change.
        console.error("contributions: pledge balances lookup failed", e)
        return new Map<string, PledgeBalance>()
      })
    : new Map()

  if (contributions.length === 0 && plans.length === 0) {
    return (
      <EmptyState
        level={2}
        title="Bạn chưa ủng hộ chiến dịch hay dự án nào."
        action={<ButtonLink href="/campaigns">Khám phá chiến dịch</ButtonLink>}
      >
        Mỗi lượt ủng hộ có một mã riêng; bạn theo dõi tiền đã đến đâu ngay tại đây.
      </EmptyState>
    )
  }

  return (
    <div className="space-y-10">
      {plans.length > 0 && <PlanList plans={plans} donations={contributions.filter((c) => c.plan_id !== null)} />}
      {contributions.length > 0 &&
        (plans.length > 0 ? (
          <section aria-labelledby="all-contributions-title" className="space-y-4">
            <h2 id="all-contributions-title" className="text-h2">
              Tất cả lượt ủng hộ
            </h2>
            <MyContributionItems contributions={contributions} balances={balances} />
          </section>
        ) : (
          <MyContributionItems contributions={contributions} balances={balances} />
        ))}
    </div>
  )
}

function MyContributionItems({
  contributions,
  balances,
}: {
  contributions: MyContribution[]
  balances: Map<string, PledgeBalance>
}) {
  return (
    <ul className="divide-y divide-border card">
      {contributions.map((c) => {
        const pledge = c.kind === "pledge"
        const Icon = pledge ? SparkIcon : HeartIcon
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
                    ? pledgeListSummary(c, balances.get(c.id) ?? null)
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
              <ButtonLink
                href={`/me/pledges/${c.reference_code}`}
                variant={offersPayment(c, balances.get(c.id) ?? null) ? "primary" : "secondary"}
                className="shrink-0"
              >
                {offersPayment(c, balances.get(c.id) ?? null) ? "Thanh toán" : "Xem cam kết"}
              </ButtonLink>
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
