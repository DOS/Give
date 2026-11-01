import type { Metadata } from "next"
import Link from "next/link"

import { requireSession } from "@/lib/auth/session"
import { donationStatusLabel } from "@/lib/contributions"
import { formatDate, formatVnd } from "@/lib/format"
import { dbAs } from "@/lib/supabase"

export const metadata: Metadata = { title: "Ủng hộ của tôi", robots: { index: false } }

interface MyContribution {
  id: string
  reference_code: string
  intended_amount: number
  received_amount: number
  status: string
  is_anonymous: boolean
  created_at: string
  campaign: { slug: string; title: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  awaiting_transfer: "bg-amber-100 text-amber-800",
  received: "bg-green-100 text-green-800",
  expired: "bg-gray-100 text-gray-700",
}

/** The signed-in user's donations, read with their own token under RLS. */
export default async function MyContributionsPage() {
  const session = await requireSession("/me/contributions")
  const { data, error } = await dbAs(session.accessToken)
    .from("contributions")
    .select(
      "id, reference_code, intended_amount, received_amount, status, is_anonymous, created_at, campaign:campaigns(slug, title)"
    )
    .eq("contributor_user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw error
  const contributions = (data ?? []) as unknown as MyContribution[]

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">Ủng hộ của tôi</h1>

      {contributions.length === 0 ? (
        <div className="mt-8 card p-10 text-center text-gray-600">
          Bạn chưa ủng hộ chiến dịch nào.{" "}
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
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {donationStatusLabel(c.status)}
                  </span>
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
                  {c.status === "received"
                    ? `Đã nhận ${formatVnd(c.received_amount)}`
                    : `Dự định ${formatVnd(c.intended_amount)}`}{" "}
                  · Mã {c.reference_code} · {formatDate(c.created_at)}
                </p>
              </div>
              {c.status !== "received" && (
                <Link href={`/donations/${c.reference_code}`} className="btn-secondary">
                  Xem cách chuyển khoản
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
