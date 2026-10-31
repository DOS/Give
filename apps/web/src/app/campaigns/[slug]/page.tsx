import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"

import { StatusBadge, TypeBadge, VerificationBadge } from "@/components/badges"
import { Markdown } from "@/components/Markdown"
import { ProgressBar } from "@/components/ProgressBar"
import { getSession } from "@/lib/auth/session"
import {
  getCampaignBySlug,
  getPublicOrganizer,
  isPublicStatus,
  listMilestones,
  listPublishedUpdates,
  type PublicCampaign,
  type Db,
} from "@/lib/campaigns"
import { daysLeft, formatDate, formatVnd, progressPercent } from "@/lib/format"
import { SLUG_PATTERN } from "@/lib/slug"
import { privateCoverUrl, publicCoverUrl } from "@/lib/cover-urls"
import { dbAs } from "@/lib/supabase"

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

  const [milestones, updates, organizer] = await Promise.all([
    listMilestones(db, campaign.id),
    listPublishedUpdates(db, campaign.id),
    preview ? Promise.resolve(null) : getPublicOrganizer(db, campaign.id),
  ])

  const raised = 0
  const percent = progressPercent(raised, campaign.goal_amount)
  const days = daysLeft(campaign.ends_at)
  const options = campaign.display_options
  const isGive = campaign.type === "give"

  return (
    <article>
      {preview && (
        <div className="bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
          Bản xem trước: chiến dịch đang ở trạng thái <StatusBadge status={campaign.status} /> và chưa công khai.
        </div>
      )}

      <header className="mx-auto max-w-6xl px-4 pt-8">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={campaign.type} />
          {campaign.category && (
            <Link
              href={`/campaigns?category=${campaign.category.slug}`}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              {campaign.category.icon} {campaign.category.name}
            </Link>
          )}
          {!preview && campaign.status !== "live" && <StatusBadge status={campaign.status} />}
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{campaign.title}</h1>
        {campaign.summary && <p className="mt-3 max-w-3xl text-lg text-gray-600">{campaign.summary}</p>}
      </header>

      <div className="mx-auto mt-8 grid max-w-6xl gap-10 px-4 pb-16 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-gray-100">
            {campaign.cover?.storage_path ? (
              <Image
                src={
                  preview ? privateCoverUrl(campaign.cover.storage_path) : publicCoverUrl(campaign.cover.storage_path)
                }
                unoptimized={preview}
                alt={campaign.cover.alt ?? campaign.title}
                fill
                priority
                sizes="(min-width: 1024px) 66vw, 100vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-6xl text-gray-300" aria-hidden>
                {campaign.category?.icon ?? (isGive ? "❤️" : "🚀")}
              </div>
            )}
          </div>

          <section>
            <h2 className="mb-4 text-xl font-bold">Câu chuyện</h2>
            {campaign.story ? (
              <Markdown>{campaign.story}</Markdown>
            ) : (
              <p className="text-gray-500">Chưa có nội dung.</p>
            )}
          </section>

          {milestones.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-bold">Các mốc mục tiêu</h2>
              <ol className="space-y-3">
                {milestones.map((milestone) => (
                  <li key={milestone.id} className="card p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-semibold">{milestone.title}</h3>
                      <span className="text-sm font-medium text-gray-700">{formatVnd(milestone.target_amount)}</span>
                    </div>
                    {milestone.description && <p className="mt-1 text-sm text-gray-600">{milestone.description}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <h2 className="mb-4 text-xl font-bold">Cập nhật</h2>
            {updates.length > 0 ? (
              <ol className="space-y-6">
                {updates.map((update) => (
                  <li key={update.id} className="border-l-2 border-brand-100 pl-4">
                    <p className="text-xs text-gray-500">{formatDate(update.published_at)}</p>
                    <h3 className="mt-1 font-semibold">{update.title}</h3>
                    <div className="mt-2 text-sm">
                      <Markdown>{update.body}</Markdown>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-gray-500">Chưa có cập nhật nào.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <div className="space-y-4 card p-6">
            <div>
              <p className="text-2xl font-bold">{formatVnd(raised)}</p>
              <p className="text-sm text-gray-600">
                {isGive ? "đã nhận" : "đã cam kết"} trên mục tiêu {formatVnd(campaign.goal_amount)}
              </p>
            </div>
            {options.progress_bar !== false && <ProgressBar percent={percent} />}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {options.time_remaining !== false && days !== null && (
                <div>
                  <dt className="text-gray-500">Thời gian còn lại</dt>
                  <dd className="font-semibold">{days > 0 ? `${days} ngày` : "Đã hết hạn"}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">Góp tối thiểu</dt>
                <dd className="font-semibold">{formatVnd(campaign.min_contribution)}</dd>
              </div>
              {campaign.stretch_goal_amount && (
                <div>
                  <dt className="text-gray-500">Mục tiêu mở rộng</dt>
                  <dd className="font-semibold">{formatVnd(campaign.stretch_goal_amount)}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">Kết thúc</dt>
                <dd className="font-semibold">{formatDate(campaign.ends_at)}</dd>
              </div>
            </dl>
            <button type="button" disabled className="btn-primary w-full">
              {isGive ? "Ủng hộ" : "Đồng hành cùng dự án"}
            </button>
            <p className="text-center text-xs text-gray-500">
              Give sắp mở nhận {isGive ? "ủng hộ" : "cam kết"}. Tiền sẽ đi thẳng vào tài khoản nhận của chiến dịch.
            </p>
            {!isGive && (
              <p className="text-xs text-gray-500">
                Dự án theo hình thức “đạt mục tiêu mới thanh toán”: bạn cam kết trước, chỉ trả tiền khi dự án đạt mục
                tiêu, trong vòng {campaign.payment_window_days} ngày.
              </p>
            )}
          </div>

          {(organizer || (isGive && campaign.beneficiary_name)) && (
            <div className="space-y-3 card p-6 text-sm">
              {organizer && (
                <div>
                  <p className="text-gray-500">Người tổ chức</p>
                  <p className="font-semibold">{organizer.display_name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-gray-600">
                    {organizer.kind === "organization" ? "Tổ chức" : "Cá nhân"}
                    <VerificationBadge status={organizer.verification_status} />
                  </p>
                </div>
              )}
              {isGive && campaign.beneficiary_name && (
                <div>
                  <p className="text-gray-500">Người thụ hưởng</p>
                  <p className="font-semibold">{campaign.beneficiary_name}</p>
                  {campaign.beneficiary_relation && (
                    <p className="text-gray-600">Quan hệ: {campaign.beneficiary_relation}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </article>
  )
}
