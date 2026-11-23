import Link from "next/link"

import { OrganizerAvatar } from "@/components/OrganizerAvatar"
import { CheckIcon } from "@/components/ui/icons"
import type { DonorImpactSummary, FollowedOrganizer } from "@/lib/follows"
import { formatVnd } from "@/lib/format"
import { isNavigableOrganizerHandle, organizerProfileHref } from "@/lib/organizer-handle"

const COUNT = new Intl.NumberFormat("vi-VN")

/**
 * "Dấu ấn đóng góp của tôi" summary card at the top of `/me/contributions`
 * (DOS/Give#315). Powered by `give.my_donor_impact_summary()` and
 * `give.list_my_followed_organizers()` under the signed-in donor's own JWT.
 */
export function DonorImpactCard({
  summary,
  followedOrganizers = [],
}: {
  summary: DonorImpactSummary
  followedOrganizers?: readonly FollowedOrganizer[]
}) {
  const maxCategoryVnd = summary.category_breakdown.reduce((max, item) => Math.max(max, item.total_vnd), 0)
  const visibleOrganizers = followedOrganizers.filter((o) => isNavigableOrganizerHandle(o.handle))

  return (
    <section aria-labelledby="donor-impact-heading" className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="donor-impact-heading" className="text-h2">
          Dấu ấn đóng góp của tôi
        </h2>
        <p className="text-sm text-muted">Tổng hợp từ các khoản đã đối soát trên Give</p>
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md bg-surface p-4">
          <dt className="text-sm text-muted">Tổng đóng góp đã đối soát</dt>
          <dd className="mt-1 text-xl font-bold text-fg tabular-nums">{formatVnd(summary.total_matched_vnd)}</dd>
        </div>
        <div className="rounded-md bg-surface p-4">
          <dt className="text-sm text-muted">Chiến dịch đã ủng hộ</dt>
          <dd className="mt-1 text-xl font-bold text-fg tabular-nums">
            {COUNT.format(summary.campaigns_supported_count)}
          </dd>
        </div>
        <div className="rounded-md bg-surface p-4">
          <dt className="text-sm text-muted">Kế hoạch hằng tháng đang mở</dt>
          <dd className="mt-1 text-xl font-bold text-fg tabular-nums">
            {COUNT.format(summary.active_monthly_plans_count)}
          </dd>
        </div>
        <div className="rounded-md bg-surface p-4">
          <dt className="text-sm text-muted">
            <Link
              href="/me/following"
              className="hit-area inline-flex items-center underline-offset-4 hover:text-primary hover:underline"
            >
              Đang theo dõi
            </Link>
          </dt>
          <dd className="mt-1 text-xl font-bold text-fg tabular-nums">
            {COUNT.format(summary.followed_campaigns_count + summary.followed_organizers_count)}
          </dd>
          <p className="mt-0.5 text-sm text-muted tabular-nums">
            {COUNT.format(summary.followed_campaigns_count)} chiến dịch ·{" "}
            {COUNT.format(summary.followed_organizers_count)} người tổ chức
          </p>
        </div>
      </dl>

      {summary.category_breakdown.length > 0 && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-sm font-semibold text-fg">Phân bổ theo danh mục</h3>
          <ul className="mt-3 space-y-3">
            {summary.category_breakdown.map((item, index) => {
              const share =
                summary.total_matched_vnd > 0 ? Math.round((item.total_vnd / summary.total_matched_vnd) * 100) : 0
              const widthPercent =
                maxCategoryVnd > 0 && item.total_vnd > 0
                  ? Math.max(4, Math.round((item.total_vnd / maxCategoryVnd) * 100))
                  : 0
              return (
                <li key={item.category_id ?? `${item.category_slug}-${index}`} className="space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-fg">
                      {item.category_name}{" "}
                      <span className="font-normal text-muted">({COUNT.format(item.campaigns_count)} chiến dịch)</span>
                    </span>
                    <span className="font-semibold text-fg tabular-nums">
                      {formatVnd(item.total_vnd)} <span className="font-normal text-muted">· {share}%</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-surface" aria-hidden>
                    <div className="h-full rounded bg-primary" style={{ width: `${widthPercent}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {visibleOrganizers.length > 0 && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-sm font-semibold text-fg">Người tổ chức đang theo dõi</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {visibleOrganizers.map((organizer) => (
              <li key={organizer.handle}>
                <Link
                  href={organizerProfileHref(organizer.handle)}
                  className="inline-flex min-h-10 items-center gap-2 rounded border border-border bg-bg px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:border-muted hover:bg-surface"
                >
                  <OrganizerAvatar displayName={organizer.display_name} avatarUrl={organizer.avatar_url} size="md" />
                  <span className="max-w-44 truncate">{organizer.display_name}</span>
                  {organizer.verification_status === "verified" && (
                    <CheckIcon
                      width={14}
                      height={14}
                      className="shrink-0 text-primary"
                      role="img"
                      aria-hidden={false}
                      aria-label="Đã xác minh"
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
