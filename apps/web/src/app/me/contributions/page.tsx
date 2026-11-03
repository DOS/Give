import type { Metadata } from "next"
import Link from "next/link"

import { requireSession } from "@/lib/auth/session"
import { donationStatusLabel } from "@/lib/contributions"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import {
  fulfillmentLabel,
  paymentWindowClosed,
  pledgeStatusColor,
  pledgeStatusLabel,
  withoutReplacedPledges,
} from "@/lib/pledges"
import { dbAs } from "@/lib/supabase"

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
  campaign: { slug: string; title: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  awaiting_transfer: "bg-amber-100 text-amber-800",
  received: "bg-green-100 text-green-800",
  expired: "bg-gray-100 text-gray-700",
}

function statusLabel(c: MyContribution): string {
  return c.kind === "pledge" ? pledgeStatusLabel(c.status) : donationStatusLabel(c.status)
}

function statusColor(c: MyContribution): string {
  return c.kind === "pledge" ? pledgeStatusColor(c.status) : (STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-700")
}

function pledgeSummary(c: MyContribution): string {
  switch (c.status) {
    case "payment_due":
    case "partially_paid":
      if (paymentWindowClosed(c)) return `Đã quá hạn thanh toán · đã ghi nhận ${formatVnd(c.received_amount)}`
      return `Cần thanh toán ${formatVnd(Math.max(0, c.intended_amount - c.received_amount))}${
        c.payment_due_at ? ` trước ${formatDateTime(c.payment_due_at)}` : ""
      }`
    case "paid":
      return `Đã thanh toán ${formatVnd(c.received_amount)}`
    case "refund_due":
      return `Chờ người tạo dự án hoàn ${formatVnd(c.received_amount)}`
    default:
      return `Cam kết ${formatVnd(c.intended_amount)}`
  }
}

/**
 * The signed-in user's donations and pledges, read with their own token under
 * RLS. Pledges that change_pledge replaced are hidden; the current one shows
 * its payment and, once paid, its delivery status (section 4.2 step 7).
 */
export default async function MyContributionsPage() {
  const session = await requireSession("/me/contributions")
  const { data, error } = await dbAs(session.accessToken)
    .from("contributions")
    .select(
      "id, kind, campaign_id, reference_code, intended_amount, received_amount, status, is_anonymous, payment_due_at, " +
        "fulfillment_status, reward_tier_id, created_at, campaign:campaigns(slug, title)"
    )
    .eq("contributor_user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw error
  const contributions = withoutReplacedPledges((data ?? []) as unknown as MyContribution[])

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">Ủng hộ của tôi</h1>

      {contributions.length === 0 ? (
        <div className="mt-8 card p-10 text-center text-gray-600">
          Bạn chưa ủng hộ chiến dịch hay dự án nào.{" "}
          <Link href="/campaigns" className="font-medium text-brand-600">
            Khám phá chiến dịch
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-gray-200 rounded-lg border border-gray-200">
          {contributions.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(c)}`}>
                    {statusLabel(c)}
                  </span>
                  {c.kind === "pledge" && <span className="text-xs text-gray-500">Cam kết dự án</span>}
                  {c.kind === "pledge" && c.status === "paid" && c.reward_tier_id && (
                    <span className="text-xs text-gray-600">Giao quà: {fulfillmentLabel(c.fulfillment_status)}</span>
                  )}
                  {c.is_anonymous && <span className="text-xs text-gray-500">Ẩn danh</span>}
                </div>
                {c.campaign ? (
                  <Link
                    href={`/campaigns/${c.campaign.slug}`}
                    className="mt-1 block truncate font-semibold hover:text-brand-600"
                  >
                    {c.campaign.title}
                  </Link>
                ) : (
                  <p className="mt-1 font-semibold text-gray-500">Chiến dịch không còn công khai</p>
                )}
                <p className="text-sm text-gray-500">
                  {c.kind === "pledge"
                    ? pledgeSummary(c)
                    : c.status === "received"
                      ? `Đã nhận ${formatVnd(c.received_amount)}`
                      : `Dự định ${formatVnd(c.intended_amount)}`}{" "}
                  · Mã {c.reference_code} · {formatDate(c.created_at)}
                </p>
              </div>
              {c.kind === "pledge" ? (
                <Link href={`/me/pledges/${c.reference_code}`} className="btn-secondary">
                  {(c.status === "payment_due" || c.status === "partially_paid") && !paymentWindowClosed(c)
                    ? "Thanh toán"
                    : "Xem cam kết"}
                </Link>
              ) : (
                c.status !== "received" && (
                  <Link href={`/donations/${c.reference_code}`} className="btn-secondary">
                    {c.status === "awaiting_transfer" ? "Xem cách chuyển khoản" : "Xem trạng thái"}
                  </Link>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
