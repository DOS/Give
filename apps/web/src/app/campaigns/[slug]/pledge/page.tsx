import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { Money } from "@/components/ui/Money"
import { PledgeStatusBadge } from "@/components/ui/PledgeStatusBadge"
import { requireSession } from "@/lib/auth/session"
import { getCampaignBySlug, isPublicStatus } from "@/lib/campaigns"
import { formatDateTime, formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { acceptsPledges, isSoldOut, NO_REWARD, readShippingAddress } from "@/lib/pledges"
import { SLUG_PATTERN } from "@/lib/slug"
import { dbAs } from "@/lib/supabase"
import { isSessionRejected } from "@/server/contributions"
import { listPublicTiers, organizesCampaign, ownPledgesOnCampaign } from "@/server/pledges"

import { cancelPledge, savePledge } from "./actions"
import { PledgeForm, type PledgeDefaults } from "./PledgeForm"

export const metadata: Metadata = { title: "Ủng hộ dự án", robots: { index: false, follow: false } }

/**
 * "Ủng hộ dự án" for a back campaign (section 4.2 step 2), sign-in required.
 * `?tier=<id>` preselects a tier (the tier cards on the campaign page link
 * here). A backer with an open pledge changes or cancels it here until
 * ends_at; a pledge already past that stage links to its own page.
 */
export default async function PledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) notFound()
  const query = await searchParams
  const tierParam = typeof query.tier === "string" && isUuid(query.tier) ? query.tier.toLowerCase() : null
  const returnPath = `/campaigns/${slug}/pledge${tierParam ? `?tier=${tierParam}` : ""}`
  const session = await requireSession(returnPath)
  const db = dbAs(session.accessToken)

  let campaign, tiers, pledges, own
  try {
    campaign = await getCampaignBySlug(db, slug)
    if (!campaign || !isPublicStatus(campaign.status)) notFound()
    if (campaign.type !== "back") redirect(`/campaigns/${slug}`)
    ;[tiers, pledges, own] = await Promise.all([
      listPublicTiers(db, campaign.id),
      ownPledgesOnCampaign(db, session.user.id, campaign.id),
      organizesCampaign(db, campaign.id, session.user.id),
    ])
  } catch (error) {
    if (isSessionRejected(error)) redirect(`/auth/login?return_path=${encodeURIComponent(returnPath)}`)
    throw error
  }

  const open = pledges.find((p) => p.status === "pledged") ?? null
  // A pledge that has moved on (payment due, paid, ...) since the campaign ended.
  const later = open ? null : (pledges.find((p) => p.status !== "cancelled" && p.status !== "pledged") ?? null)
  const accepting = acceptsPledges(campaign)

  const chosen = tierParam && tiers.some((t) => t.id === tierParam && !isSoldOut(t)) ? tierParam : null
  const openTier = open ? (open.reward_tier_id ?? NO_REWARD) : null
  const defaults: PledgeDefaults = {
    tier: chosen ?? openTier ?? (tiers.length === 0 ? NO_REWARD : ""),
    amount: open && (!chosen || chosen === open.reward_tier_id) ? open.intended_amount : null,
    public_name: open ? (open.public_name ?? "") : (session.user.name ?? ""),
    anonymous: open?.is_anonymous ?? false,
    message: open?.message ?? "",
    shipping: open ? readShippingAddress(open.shipping_address) : null,
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="max-w-3xl">
        <p className="text-muted">Ủng hộ dự án</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          <Link href={`/campaigns/${campaign.slug}`} className="underline-offset-4 hover:underline">
            {campaign.title}
          </Link>
        </h1>
      </header>

      <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-12">
        {/* First in DOM so phones read how payment works before the form; lg moves it to the right. */}
        <aside aria-labelledby="pledge-terms" className="card p-5 sm:p-6 lg:sticky lg:top-24 lg:order-last">
          <h2 id="pledge-terms" className="text-lg font-bold">
            Đạt mục tiêu mới thanh toán
          </h2>
          <dl className="mt-4 grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <dt className="text-sm text-muted">Mục tiêu</dt>
              <dd>
                <Money amount={campaign.goal_amount} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Nhận cam kết tới</dt>
              <dd className="font-semibold text-ink">{formatDateTime(campaign.ends_at)}</dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <dt className="text-sm text-muted">Nếu đạt mục tiêu</dt>
              <dd className="font-semibold text-ink">Bạn chuyển khoản trong {campaign.payment_window_days} ngày</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-md bg-accent-50 px-4 py-3 text-accent-800">
            Bạn cam kết trước, chỉ trả tiền khi dự án đạt mục tiêu. Nếu không đạt, cam kết tự hủy.
          </p>
        </aside>

        <div className="min-w-0 space-y-6">
          {later && (
            <Callout title="Bạn đã có cam kết cho dự án này">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                Cam kết {formatVnd(later.intended_amount)} đang ở trạng thái <PledgeStatusBadge status={later.status} />
              </p>
              <p>
                <Link href={`/me/pledges/${later.reference_code}`} className="link">
                  Xem cam kết
                </Link>
              </p>
            </Callout>
          )}

          {open && (
            <Callout tone="info" title={`Bạn đã cam kết ${formatVnd(open.intended_amount)}`}>
              <p>
                Mã cam kết <span className="font-mono font-semibold">{open.reference_code}</span>.
                {accepting
                  ? " Bạn có thể đổi phần quà, số tiền hoặc hủy cam kết cho tới khi dự án kết thúc. Đổi cam kết sẽ tạo mã mới."
                  : ""}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <ButtonLink href={`/me/pledges/${open.reference_code}`} variant="secondary">
                  Xem cam kết
                </ButtonLink>
                {accepting && (
                  <ActionForm
                    action={cancelPledge.bind(null, open.id)}
                    confirm="Hủy cam kết này? Suất quà của bạn sẽ được nhả cho người khác."
                  >
                    <SubmitButton className={buttonClass({ variant: "danger" })}>Hủy cam kết</SubmitButton>
                  </ActionForm>
                )}
              </div>
            </Callout>
          )}

          {own ? (
            <Callout title="Đây là dự án của bạn">
              <p>Bạn không cam kết ủng hộ dự án của chính mình được.</p>
              <p>
                <Link href={`/campaigns/${campaign.slug}`} className="link">
                  Về trang dự án
                </Link>
              </p>
            </Callout>
          ) : accepting && !later ? (
            <PledgeForm
              action={savePledge.bind(null, campaign.id, open?.id ?? null)}
              changing={!!open}
              tiers={tiers}
              minContribution={campaign.min_contribution}
              defaults={defaults}
            />
          ) : (
            !later && (
              <Callout title="Dự án hiện không nhận cam kết">
                <p>
                  <Link href={`/campaigns/${campaign.slug}`} className="link">
                    Về trang dự án
                  </Link>
                </p>
              </Callout>
            )
          )}
        </div>
      </div>
    </div>
  )
}
