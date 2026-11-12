import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"

import { StatusBadge, TypeBadge } from "@/components/badges"
import { ButtonLink } from "@/components/ui/Button"
import { CoverPlaceholder } from "@/components/ui/CoverPlaceholder"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { SkeletonList } from "@/components/ui/Skeleton"
import { requireSession, type Session } from "@/lib/auth/session"
import { isPublicStatus, listMyCampaigns } from "@/lib/campaigns"
import { privateCoverUrl } from "@/lib/cover-urls"
import { formatDate, formatVnd } from "@/lib/format"
import { dbAs } from "@/lib/supabase"

import { MePage } from "../_components/MePage"

export const metadata: Metadata = { title: "Chiến dịch của tôi", robots: { index: false } }

export default async function MyCampaignsPage() {
  const session = await requireSession("/me/campaigns")

  return (
    <MePage section="campaigns">
      <PageHeader title="Chiến dịch của tôi" actions={<ButtonLink href="/start">Tạo chiến dịch</ButtonLink>}>
        Sửa nội dung, gắn tài khoản nhận tiền, giải trình khoản chi và giao quà cho từng chiến dịch.
      </PageHeader>
      <Suspense fallback={<SkeletonList label="Đang tải chiến dịch…" />}>
        <CampaignList session={session} />
      </Suspense>
    </MePage>
  )
}

async function CampaignList({ session }: { session: Session }) {
  const campaigns = await listMyCampaigns(dbAs(session.accessToken), session.user.id)

  if (campaigns.length === 0) {
    return (
      <EmptyState level={2} title="Bạn chưa có chiến dịch nào.">
        Gây quỹ từ thiện hoặc cho một dự án sáng tạo. Bản nháp chỉ bạn thấy cho tới khi bạn gửi duyệt.
      </EmptyState>
    )
  }

  return (
    <ul className="divide-y divide-border card">
      {campaigns.map((campaign) => (
        <li key={campaign.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-6">
          <div className="flex min-w-0 flex-1 gap-4">
            <div className="relative hidden aspect-[16/9] w-32 shrink-0 overflow-hidden rounded bg-surface sm:block">
              {campaign.cover?.storage_path ? (
                <Image
                  src={privateCoverUrl(campaign.cover.storage_path)}
                  unoptimized
                  alt=""
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              ) : (
                <CoverPlaceholder type={campaign.type} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={campaign.type} />
                <StatusBadge status={campaign.status} />
              </div>
              <Link
                href={`/me/campaigns/${campaign.id}`}
                className="mt-2 block text-h3 break-words text-fg hover:text-primary hover:underline"
              >
                {campaign.title}
              </Link>
              <p className="mt-1 text-sm text-muted">
                Mục tiêu <span className="font-semibold text-fg tabular-nums">{formatVnd(campaign.goal_amount)}</span> ·
                Tạo ngày {formatDate(campaign.created_at)}
              </p>
              {campaign.status === "changes_requested" && campaign.review_note && (
                <p className="mt-2 text-sm font-medium break-words text-warning">Cần sửa: {campaign.review_note}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 sm:shrink-0">
            {isPublicStatus(campaign.status) && (
              <ButtonLink href={`/campaigns/${campaign.slug}`} variant="secondary">
                Xem trang
              </ButtonLink>
            )}
            <ButtonLink href={`/me/campaigns/${campaign.id}`} variant="secondary">
              Quản lý
            </ButtonLink>
          </div>
        </li>
      ))}
    </ul>
  )
}
