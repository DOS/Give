import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { requireSession } from "@/lib/auth/session"
import { getCampaignBySlug, isPublicStatus } from "@/lib/campaigns"
import { formatDateTime, formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { acceptsPledges, isSoldOut, NO_REWARD, pledgeStatusLabel, readShippingAddress } from "@/lib/pledges"
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
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div>
        <p className="text-sm text-gray-500">Ủng hộ dự án</p>
        <h1 className="text-2xl font-bold">
          <Link href={`/campaigns/${campaign.slug}`} className="hover:text-brand-700">
            {campaign.title}
          </Link>
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Dự án theo hình thức “đạt mục tiêu mới thanh toán”. Mục tiêu {formatVnd(campaign.goal_amount)}, nhận cam kết
          tới {formatDateTime(campaign.ends_at)}. Nếu đạt, bạn chuyển khoản trong {campaign.payment_window_days} ngày.
        </p>
      </div>

      {later && (
        <div className="card p-6 text-sm">
          Cam kết của bạn ({formatVnd(later.intended_amount)}) đang ở trạng thái{" "}
          <span className="font-semibold">{pledgeStatusLabel(later.status)}</span>.{" "}
          <Link href={`/me/pledges/${later.reference_code}`} className="font-medium text-brand-700">
            Xem cam kết
          </Link>
        </div>
      )}

      {open && (
        <div className="space-y-3 card border-blue-200 bg-blue-50 p-6 text-sm text-blue-900">
          <p>
            Bạn đã cam kết {formatVnd(open.intended_amount)} (mã{" "}
            <span className="font-mono font-semibold">{open.reference_code}</span>).
            {accepting
              ? " Bạn có thể đổi phần quà, số tiền hoặc hủy cam kết cho tới khi dự án kết thúc. Đổi cam kết sẽ tạo mã mới."
              : ""}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/me/pledges/${open.reference_code}`} className="btn-secondary">
              Xem cam kết
            </Link>
            {accepting && (
              <ActionForm
                action={cancelPledge.bind(null, open.id)}
                confirm="Hủy cam kết này? Suất quà của bạn sẽ được nhả cho người khác."
              >
                <SubmitButton className="btn-secondary text-red-700">Hủy cam kết</SubmitButton>
              </ActionForm>
            )}
          </div>
        </div>
      )}

      {own ? (
        <div className="card p-6 text-sm text-gray-700">
          Đây là dự án của bạn nên bạn không cam kết ủng hộ được.{" "}
          <Link href={`/campaigns/${campaign.slug}`} className="font-medium text-brand-700">
            Về trang dự án
          </Link>
        </div>
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
          <div className="card p-6 text-sm text-gray-700">
            Dự án hiện không nhận cam kết.{" "}
            <Link href={`/campaigns/${campaign.slug}`} className="font-medium text-brand-700">
              Về trang dự án
            </Link>
          </div>
        )
      )}
    </div>
  )
}
