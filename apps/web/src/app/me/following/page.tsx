import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { StatusBadge, TypeBadge, VerificationBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { OrganizerAvatar } from "@/components/OrganizerAvatar"
import { ProgressBar } from "@/components/ProgressBar"
import { Badge } from "@/components/ui/Badge"
import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { CoverPlaceholder } from "@/components/ui/CoverPlaceholder"
import { EmptyState } from "@/components/ui/EmptyState"
import { CheckIcon } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/PageHeader"
import { SkeletonList } from "@/components/ui/Skeleton"
import { requireSession, type Session } from "@/lib/auth/session"
import { isPublicCampaignVisible, isPublicStatus } from "@/lib/campaigns"
import { publicCoverUrl } from "@/lib/cover-urls"
import {
  listMyFollowedCampaigns,
  listMyFollowedOrganizers,
  type FollowedCampaign,
  type FollowedOrganizer,
} from "@/lib/follows"
import { daysLeft, formatDate, formatVnd, progressPercent } from "@/lib/format"
import { isNavigableOrganizerHandle, organizerProfileHref } from "@/lib/organizer-handle"
import { ORGANIZER_KIND_LABELS } from "@/lib/organizer-profile"
import { dbAs } from "@/lib/supabase"
import { isSessionRejected } from "@/server/contributions"

import { MePage } from "../_components/MePage"

import { unfollowFollowedCampaign, unfollowFollowedOrganizer } from "./actions"

export const metadata: Metadata = { title: "Đang theo dõi", robots: { index: false } }

export default async function MyFollowingPage() {
  const session = await requireSession("/me/following")

  return (
    <MePage section="following">
      <PageHeader title="Đang theo dõi">
        Các chiến dịch và người tổ chức bạn đang theo dõi trên Give. Bạn nhận thông báo khi chiến dịch mở nhận ủng hộ,
        sắp kết thúc hoặc có cập nhật mới.
      </PageHeader>
      <Suspense fallback={<SkeletonList label="Đang tải danh sách đang theo dõi…" />}>
        <FollowingList session={session} />
      </Suspense>
    </MePage>
  )
}

async function FollowingList({ session }: { session: Session }) {
  const db = dbAs(session.accessToken)
  let campaigns: FollowedCampaign[]
  let organizers: FollowedOrganizer[]
  try {
    ;[campaigns, organizers] = await Promise.all([listMyFollowedCampaigns(db, 100, 0), listMyFollowedOrganizers(db)])
  } catch (error) {
    if (isSessionRejected(error)) redirect(`/auth/login?return_path=${encodeURIComponent("/me/following")}`)
    throw error
  }

  const visibleOrganizers = organizers.filter((o) => isNavigableOrganizerHandle(o.handle))

  if (campaigns.length === 0 && visibleOrganizers.length === 0) {
    return (
      <EmptyState
        level={2}
        title="Bạn chưa theo dõi chiến dịch hay người tổ chức nào."
        action={<ButtonLink href="/campaigns">Khám phá chiến dịch</ButtonLink>}
      >
        Theo dõi chiến dịch sắp mở, chiến dịch đang gây quỹ hoặc người tổ chức yêu thích để cập nhật kịp thời tại đây.
      </EmptyState>
    )
  }

  return (
    <div className="space-y-12">
      {campaigns.length > 0 && (
        <section aria-labelledby="followed-campaigns-heading" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="followed-campaigns-heading" className="text-h2">
              Chiến dịch đang theo dõi <span className="font-normal text-muted">({campaigns.length})</span>
            </h2>
            {campaigns.length >= 100 && (
              <p className="text-sm text-muted">Hiển thị 100 chiến dịch theo dõi mới nhất.</p>
            )}
          </div>
          <ul className="divide-y divide-border card">
            {campaigns.map((campaign) => {
              const publicLiveOrEnded = isPublicStatus(campaign.status)
              const prelaunch = campaign.status === "approved"
              const canShowPublicCover = Boolean(campaign.cover_storage_path && isPublicCampaignVisible(campaign))
              const percent = publicLiveOrEnded ? progressPercent(campaign.received_amount, campaign.goal_amount) : 0
              const days = campaign.status === "live" ? daysLeft(campaign.ends_at) : null
              const validHandle = isNavigableOrganizerHandle(campaign.organizer_handle)
                ? campaign.organizer_handle
                : null

              return (
                <li key={campaign.campaign_id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-6">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <div className="relative hidden aspect-[16/9] w-32 shrink-0 overflow-hidden rounded bg-surface sm:block">
                      {canShowPublicCover && campaign.cover_storage_path ? (
                        <Image
                          src={publicCoverUrl(campaign.cover_storage_path)}
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
                        {prelaunch ? <Badge tone="info">Sắp ra mắt</Badge> : <StatusBadge status={campaign.status} />}
                        {campaign.has_supported && <Badge tone="brand">Đã ủng hộ</Badge>}
                      </div>
                      <h3 className="mt-2 text-h3 break-words">
                        <Link
                          href={`/campaigns/${campaign.slug}`}
                          className="text-fg hover:text-primary hover:underline"
                        >
                          {campaign.title}
                        </Link>
                      </h3>
                      {(campaign.organizer_display_name || validHandle) && (
                        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted">
                          {validHandle ? (
                            <Link
                              href={organizerProfileHref(validHandle)}
                              className="truncate text-muted underline-offset-4 hover:text-fg hover:underline"
                            >
                              {campaign.organizer_display_name ?? `@${validHandle}`}
                            </Link>
                          ) : (
                            <span className="truncate">{campaign.organizer_display_name}</span>
                          )}
                          {campaign.organizer_verification_status === "verified" && (
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
                      )}
                      {publicLiveOrEnded ? (
                        <div className="mt-3 max-w-md space-y-1.5">
                          <ProgressBar percent={percent} size="sm" />
                          <p className="text-sm">
                            <span className="font-semibold text-fg tabular-nums">
                              {formatVnd(campaign.received_amount)}
                            </span>{" "}
                            <span className="text-muted">
                              {campaign.type === "give" ? "đã nhận" : "đã cam kết"} / mục tiêu{" "}
                              <span className="tabular-nums">{formatVnd(campaign.goal_amount)}</span> · {percent}%
                            </span>
                          </p>
                          {days !== null && (
                            <p className="text-sm text-muted">{days > 0 ? `Còn ${days} ngày` : "Đã hết hạn"}</p>
                          )}
                        </div>
                      ) : prelaunch ? (
                        <p className="mt-2 text-sm text-muted">
                          Mục tiêu{" "}
                          <span className="font-semibold text-fg tabular-nums">{formatVnd(campaign.goal_amount)}</span>
                          {campaign.starts_at && ` · Mở ngày ${formatDate(campaign.starts_at)}`}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <ActionForm action={unfollowFollowedCampaign}>
                      <input type="hidden" name="campaign_id" value={campaign.campaign_id} />
                      <input type="hidden" name="campaign_slug" value={campaign.slug} />
                      <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>
                        Bỏ theo dõi<span className="sr-only">{`: ${campaign.title}`}</span>
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {visibleOrganizers.length > 0 && (
        <section aria-labelledby="followed-organizers-heading" className="space-y-4">
          <h2 id="followed-organizers-heading" className="text-h2">
            Người tổ chức đang theo dõi <span className="font-normal text-muted">({visibleOrganizers.length})</span>
          </h2>
          <ul className="divide-y divide-border card">
            {visibleOrganizers.map((organizer) => (
              <li
                key={organizer.handle}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <OrganizerAvatar displayName={organizer.display_name} avatarUrl={organizer.avatar_url} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <VerificationBadge status={organizer.verification_status} />
                      <Badge tone="neutral">{ORGANIZER_KIND_LABELS[organizer.kind]}</Badge>
                    </div>
                    <h3 className="mt-1.5 text-h3 break-words">
                      <Link
                        href={organizerProfileHref(organizer.handle)}
                        className="text-fg hover:text-primary hover:underline"
                      >
                        {organizer.display_name}
                      </Link>
                    </h3>
                    <p className="mt-0.5 text-sm text-muted">
                      @{organizer.handle}
                      {organizer.followed_at &&
                        !Number.isNaN(Date.parse(organizer.followed_at)) &&
                        ` · Theo dõi từ ${formatDate(organizer.followed_at)}`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <ActionForm action={unfollowFollowedOrganizer}>
                    <input type="hidden" name="handle" value={organizer.handle} />
                    <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>
                      Bỏ theo dõi<span className="sr-only">{`: ${organizer.display_name}`}</span>
                    </SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
