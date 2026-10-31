import type { Metadata } from "next"
import Link from "next/link"

import { StatusBadge, TypeBadge } from "@/components/badges"
import { requireSession } from "@/lib/auth/session"
import { isPublicStatus, listMyCampaigns } from "@/lib/campaigns"
import { formatDate, formatVnd } from "@/lib/format"
import { dbAs } from "@/lib/supabase"

export const metadata: Metadata = { title: "Chiến dịch của tôi", robots: { index: false } }

export default async function MyCampaignsPage() {
  const session = await requireSession("/me/campaigns")
  const campaigns = await listMyCampaigns(dbAs(session.accessToken), session.user.id)

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Chiến dịch của tôi</h1>
        <Link href="/start" className="btn-primary">
          Tạo chiến dịch
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="mt-8 card p-10 text-center text-gray-600">
          Bạn chưa có chiến dịch nào.{" "}
          <Link href="/start" className="font-medium text-brand-600">
            Bắt đầu ngay
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-gray-200 rounded-lg border border-gray-200">
          {campaigns.map((campaign) => (
            <li key={campaign.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={campaign.type} />
                  <StatusBadge status={campaign.status} />
                </div>
                <Link
                  href={`/me/campaigns/${campaign.id}`}
                  className="mt-1 block truncate font-semibold hover:text-brand-600"
                >
                  {campaign.title}
                </Link>
                <p className="text-sm text-gray-500">
                  Mục tiêu {formatVnd(campaign.goal_amount)} · Tạo ngày {formatDate(campaign.created_at)}
                </p>
                {campaign.status === "changes_requested" && campaign.review_note && (
                  <p className="mt-1 text-sm text-orange-800">Cần sửa: {campaign.review_note}</p>
                )}
              </div>
              <div className="flex gap-2">
                {isPublicStatus(campaign.status) && (
                  <Link href={`/campaigns/${campaign.slug}`} className="btn-secondary">
                    Xem trang
                  </Link>
                )}
                <Link href={`/me/campaigns/${campaign.id}`} className="btn-secondary">
                  Quản lý
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
