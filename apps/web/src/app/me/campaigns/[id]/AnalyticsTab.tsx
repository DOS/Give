import clsx from "clsx"

import { ProgressBar } from "@/components/ProgressBar"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { ChevronDownIcon, EyeIcon } from "@/components/ui/icons"
import { SegmentedNav } from "@/components/ui/Tabs"
import {
  ANALYTICS_PERIODS,
  analyticsTabHref,
  formatAnalyticsDate,
  formatAnalyticsShortDate,
  formatConversionRate,
  formatCount,
  referrerLabel,
  type AnalyticsDailyPoint,
  type AnalyticsPeriod,
  type CampaignAnalytics,
} from "@/lib/analytics"
import { isPublicStatus, type CampaignStatus, type CampaignType } from "@/lib/campaigns"
import { formatVnd } from "@/lib/format"

const VISIBLE_DAILY_ROWS = 14

interface AnalyticsTabProps {
  campaignId: string
  campaignType: CampaignType
  campaignStatus: CampaignStatus
  days: AnalyticsPeriod
  analytics: CampaignAnalytics | null
  error: string | null
}

function isActiveDay(day: AnalyticsDailyPoint): boolean {
  return day.views > 0 || day.share_clicks > 0 || day.contributions_count > 0 || day.contributions_amount > 0
}

function DailyBarChart({ daily, days }: { daily: readonly AnalyticsDailyPoint[]; days: AnalyticsPeriod }) {
  const maxViews = daily.reduce((max, point) => Math.max(max, point.views), 0)
  const peakDay = maxViews > 0 ? daily.find((point) => point.views === maxViews) : null
  const firstDate = daily[0]?.date
  const midDate = daily.length > 2 ? daily[Math.floor((daily.length - 1) / 2)]?.date : undefined
  const lastDate = daily.length > 1 ? daily[daily.length - 1]?.date : undefined

  const chartSummary = peakDay
    ? `Biểu đồ lượt xem trong ${days} ngày, cao nhất ${formatCount(peakDay.views)} lượt xem vào ngày ${formatAnalyticsDate(peakDay.date)}.`
    : `Biểu đồ lượt xem trong ${days} ngày, chưa có lượt xem nào.`

  const barGapClass = days <= 7 ? "gap-2" : days <= 30 ? "gap-1" : "gap-px"

  return (
    <section aria-labelledby="analytics-trend-heading" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="analytics-trend-heading" className="text-h3">
          Lượt xem theo ngày
        </h3>
        {peakDay && (
          <p className="text-sm text-muted tabular-nums">
            Cao nhất: <span className="font-semibold text-fg">{formatCount(peakDay.views)}</span> (
            {formatAnalyticsShortDate(peakDay.date)})
          </p>
        )}
      </div>

      {daily.length === 0 || maxViews === 0 ? (
        <p className="text-sm text-muted">Chưa có lượt xem nào trong {days} ngày qua.</p>
      ) : (
        <div className="space-y-2">
          <div
            role="img"
            aria-label={chartSummary}
            className={clsx("flex h-40 w-full items-end border-b border-border pt-2", barGapClass)}
          >
            {daily.map((point) => {
              const heightPercent = point.views > 0 ? Math.max(4, Math.round((point.views / maxViews) * 100)) : 0
              const tooltip = `${formatAnalyticsDate(point.date)}: ${formatCount(point.views)} lượt xem · ${formatCount(point.share_clicks)} lượt chia sẻ · ${formatCount(point.contributions_count)} lượt (${formatVnd(point.contributions_amount)})`
              return (
                <div key={point.date} title={tooltip} className="flex h-full min-w-0 flex-1 items-end">
                  {point.views > 0 ? (
                    <span className="block w-full rounded-t bg-primary" style={{ height: `${heightPercent}%` }} />
                  ) : (
                    <span className="block h-0.5 w-full bg-border" />
                  )}
                </div>
              )
            })}
          </div>

          {firstDate && (
            <div className="flex items-center justify-between gap-2 text-sm text-muted tabular-nums">
              <span>{formatAnalyticsShortDate(firstDate)}</span>
              {midDate && <span>{formatAnalyticsShortDate(midDate)}</span>}
              {lastDate && <span>{formatAnalyticsShortDate(lastDate)}</span>}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function DailyRows({ rows, contributionLabel }: { rows: readonly AnalyticsDailyPoint[]; contributionLabel: string }) {
  return (
    <>
      {/* Narrow phones (<640px): stacked 2-line rows so 320px viewports never scroll sideways. */}
      <ol className="divide-y divide-border rounded-md border border-border sm:hidden">
        {rows.map((row) => (
          <li key={row.date} className="space-y-1 bg-raised px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-fg tabular-nums">{formatAnalyticsDate(row.date)}</span>
              <span className="font-semibold text-primary tabular-nums">
                {row.contributions_amount > 0 ? formatVnd(row.contributions_amount) : "0 ₫"}
              </span>
            </div>
            <p className="text-sm text-muted tabular-nums">
              {formatCount(row.views)} lượt xem · {formatCount(row.share_clicks)} chia sẻ ·{" "}
              {formatCount(row.contributions_count)} {contributionLabel.toLowerCase()}
            </p>
          </li>
        ))}
      </ol>

      {/* Tablet & desktop (>=640px): bank-statement-style tabular breakdown. */}
      <div className="hidden overflow-hidden rounded-md border border-border sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-muted">
              <th scope="col" className="px-4 py-3 font-medium">
                Ngày
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Lượt xem
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Chia sẻ
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {contributionLabel}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Số tiền
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-raised">
            {rows.map((row) => (
              <tr key={row.date}>
                <th scope="row" className="px-4 py-3 font-medium text-fg tabular-nums">
                  {formatAnalyticsDate(row.date)}
                </th>
                <td className="px-4 py-3 text-right text-fg tabular-nums">{formatCount(row.views)}</td>
                <td className="px-4 py-3 text-right text-fg tabular-nums">{formatCount(row.share_clicks)}</td>
                <td className="px-4 py-3 text-right text-fg tabular-nums">{formatCount(row.contributions_count)}</td>
                <td className="px-4 py-3 text-right font-semibold text-fg tabular-nums">
                  {formatVnd(row.contributions_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/**
 * Organizer analytics tab on `/me/campaigns/[id]?tab=analytics` (DOS/Give#252).
 * Server-rendered from `give.get_campaign_analytics`: zero JS required for period
 * switching or daily breakdown, semantic tokens for both light and dark themes.
 */
export function AnalyticsTab({ campaignId, campaignType, campaignStatus, days, analytics, error }: AnalyticsTabProps) {
  const isGive = campaignType === "give"
  const contributionLabel = isGive ? "Lượt ủng hộ" : "Lượt cam kết"
  const amountLabel = isGive ? "Tiền đã nhận" : "Tiền đã cam kết"
  const periodItems = ANALYTICS_PERIODS.map((period) => ({
    href: analyticsTabHref(campaignId, period),
    label: `${period} ngày`,
    current: period === days,
  }))

  const hasActivity =
    analytics !== null &&
    (analytics.totals.views > 0 ||
      analytics.totals.share_clicks > 0 ||
      analytics.totals.contributions_count > 0 ||
      analytics.totals.contributions_amount > 0)

  const activeDaysDesc = analytics ? [...analytics.daily].reverse().filter(isActiveDay) : []
  const recentActiveDays = activeDaysDesc.slice(0, VISIBLE_DAILY_ROWS)
  const olderActiveDays = activeDaysDesc.slice(VISIBLE_DAILY_ROWS)

  return (
    <section aria-labelledby="analytics-heading" className="min-w-0 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 id="analytics-heading" className="text-h2">
            Thống kê hiệu quả
          </h2>
          {analytics && analytics.start_date && analytics.end_date ? (
            <p className="text-sm text-muted tabular-nums">
              Từ {formatAnalyticsDate(analytics.start_date)} đến {formatAnalyticsDate(analytics.end_date)} (giờ Việt
              Nam)
            </p>
          ) : (
            <p className="text-sm text-muted">Số liệu theo ngày trong {days} ngày gần nhất (giờ Việt Nam).</p>
          )}
        </div>
        <SegmentedNav label="Khoảng thời gian thống kê" items={periodItems} />
      </div>

      {error ? (
        <Callout tone="danger" title="Không tải được số liệu thống kê">
          <p>{error}</p>
        </Callout>
      ) : !analytics || !hasActivity ? (
        <EmptyState
          icon={<EyeIcon width={40} height={40} />}
          title={
            isPublicStatus(campaignStatus)
              ? `Chưa có dữ liệu trong ${days} ngày qua`
              : "Chiến dịch chưa có số liệu thống kê"
          }
        >
          {isPublicStatus(campaignStatus)
            ? `Chưa ghi nhận lượt xem, lượt chia sẻ hay ${contributionLabel.toLowerCase()} nào trong khoảng thời gian này.`
            : "Chiến dịch chưa hiển thị công khai. Lượt xem, nguồn truy cập và tỉ lệ chuyển đổi sẽ xuất hiện khi chiến dịch mở gây quỹ."}
        </EmptyState>
      ) : (
        <>
          <div className="space-y-3">
            <dl
              aria-label="Chỉ số tổng quan"
              className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-6 lg:grid-cols-5"
            >
              <div className="min-w-0 bg-raised p-4 sm:col-span-2 lg:col-span-1">
                <dt className="text-sm text-muted">Lượt xem</dt>
                <dd data-metric="views" className="mt-1 text-lg font-bold break-words text-fg tabular-nums">
                  {formatCount(analytics.totals.views)}
                </dd>
              </div>
              <div className="min-w-0 bg-raised p-4 sm:col-span-2 lg:col-span-1">
                <dt className="text-sm text-muted">Lượt chia sẻ</dt>
                <dd data-metric="share_clicks" className="mt-1 text-lg font-bold break-words text-fg tabular-nums">
                  {formatCount(analytics.totals.share_clicks)}
                </dd>
              </div>
              <div className="min-w-0 bg-raised p-4 sm:col-span-2 lg:col-span-1">
                <dt className="text-sm text-muted">Tỉ lệ chuyển đổi</dt>
                <dd data-metric="conversion_rate" className="mt-1 text-lg font-bold break-words text-fg tabular-nums">
                  {formatConversionRate(analytics.totals.conversion_rate, analytics.totals.views)}
                </dd>
              </div>
              <div className="min-w-0 bg-raised p-4 sm:col-span-3 lg:col-span-1">
                <dt className="text-sm text-muted">{contributionLabel}</dt>
                <dd
                  data-metric="contributions_count"
                  className="mt-1 text-lg font-bold break-words text-fg tabular-nums"
                >
                  {formatCount(analytics.totals.contributions_count)}
                </dd>
              </div>
              <div className="col-span-2 min-w-0 bg-raised p-4 sm:col-span-3 lg:col-span-1">
                <dt className="text-sm text-muted">{amountLabel}</dt>
                <dd
                  data-metric="contributions_amount"
                  className="mt-1 text-lg font-bold break-words text-primary tabular-nums"
                >
                  {formatVnd(analytics.totals.contributions_amount)}
                </dd>
              </div>
            </dl>
            <p className="max-w-[68ch] text-sm text-muted">
              Tỉ lệ chuyển đổi = {contributionLabel.toLowerCase()} / lượt xem trong {days} ngày qua.{" "}
              {isGive
                ? "Số lượt ủng hộ và số tiền được tổng hợp trực tiếp từ sổ cái sao kê."
                : "Số lượt cam kết và số tiền được tổng hợp trực tiếp từ sổ cái, không tính cam kết đã hủy."}
            </p>
          </div>

          {/* Detail-page 8/4 split (DESIGN.md 2.2): trend & daily breakdown on the left, referrers on the right. */}
          <div className="space-y-12 border-t border-border pt-8 lg:grid lg:grid-cols-12 lg:space-y-0 lg:gap-x-6">
            <div className="min-w-0 space-y-12 lg:col-span-8">
              <DailyBarChart daily={analytics.daily} days={days} />

              <section aria-labelledby="analytics-daily-heading" className="min-w-0 space-y-4">
                <h3 id="analytics-daily-heading" className="text-h3">
                  Chi tiết theo ngày
                </h3>
                {recentActiveDays.length === 0 ? (
                  <p className="text-sm text-muted">Chưa có hoạt động theo ngày trong khoảng thời gian này.</p>
                ) : (
                  <div className="space-y-4">
                    <DailyRows rows={recentActiveDays} contributionLabel={contributionLabel} />
                    {olderActiveDays.length > 0 && (
                      <details className="group space-y-4">
                        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 link [&::-webkit-details-marker]:hidden">
                          Xem thêm {olderActiveDays.length} ngày trước đó
                          <ChevronDownIcon width={20} height={20} className="group-open:rotate-180" />
                        </summary>
                        <DailyRows rows={olderActiveDays} contributionLabel={contributionLabel} />
                      </details>
                    )}
                  </div>
                )}
              </section>
            </div>

            <aside aria-labelledby="analytics-referrers-heading" className="min-w-0 space-y-6 lg:col-span-4">
              <h3 id="analytics-referrers-heading" className="text-h3">
                Nguồn truy cập
              </h3>
              {analytics.referrers.length === 0 ? (
                <p className="text-sm text-muted">Chưa có dữ liệu nguồn truy cập trong khoảng thời gian này.</p>
              ) : (
                <ol className="space-y-4">
                  {analytics.referrers.map((row) => {
                    const sharePercent =
                      analytics.totals.views > 0 ? Math.round((row.views / analytics.totals.views) * 100) : 0
                    const label = referrerLabel(row.bucket)
                    return (
                      <li key={row.bucket} className="space-y-2">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium text-fg">{label}</span>
                          <span className="shrink-0 text-muted tabular-nums">
                            <span className="font-semibold text-fg">{formatCount(row.views)}</span> ({sharePercent}%)
                          </span>
                        </div>
                        <ProgressBar percent={sharePercent} size="sm" label={`Tỉ lệ lượt xem từ ${label}`} />
                      </li>
                    )
                  })}
                </ol>
              )}

              <p className="border-t border-border pt-4 text-sm text-muted">
                Give chỉ ghi nhận tổng lượt xem theo ngày và nhóm nguồn truy cập, không lưu địa chỉ IP hay danh tính
                người xem.
              </p>
            </aside>
          </div>
        </>
      )}
    </section>
  )
}
