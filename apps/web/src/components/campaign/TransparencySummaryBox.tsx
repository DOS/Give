import Link from "next/link"

import { Badge } from "@/components/ui/Badge"
import { ShieldIcon } from "@/components/ui/icons"
import { formatDateTime, formatVnd } from "@/lib/format"
import { statementHref } from "@/lib/statement"
import { disbursedPercent, unexplainedTotal, type CampaignTransparencySummary } from "@/lib/transparency"

/**
 * 3-Second Transparency Summary Box near the top of `/campaigns/[slug]`
 * (DOS/Give#314).
 *
 * Surfaces statement freshness, disbursed share + public invoice/receipt
 * evidence count, unexplained transaction count, and direct jump to
 * `/campaigns/[slug]/statement`. Driven strictly by
 * `give.campaign_transparency_summary` — zero PII, zero raw account numbers.
 */
export function TransparencySummaryBox({
  slug,
  summary,
  showImpactReportLink = summary.has_impact_report,
}: {
  slug: string
  summary: CampaignTransparencySummary
  /** Only render the `#bao-cao-tong-ket` anchor when the report section is actually mounted. */
  showImpactReportLink?: boolean
}) {
  const pct = disbursedPercent(summary)
  const unexplained = unexplainedTotal(summary)
  const statementUrl = statementHref(slug, "all")

  return (
    <section
      aria-labelledby="transparency-summary-heading"
      data-transparency-summary
      className="card border-border bg-surface/60 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldIcon width={20} height={20} className="mt-0.5 shrink-0 text-primary" />
          <div>
            <h2 id="transparency-summary-heading" className="text-base font-semibold text-fg">
              Tóm tắt minh bạch sao kê
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {summary.last_statement_at
                ? `Sao kê cập nhật lúc ${formatDateTime(summary.last_statement_at)}`
                : "Chưa có giao dịch sao kê nào được ghi nhận"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showImpactReportLink && (
            <Link
              href="#bao-cao-tong-ket"
              className="inline-flex min-h-9 items-center rounded bg-primary-soft px-3 py-1 text-sm font-semibold text-primary hover:underline"
            >
              Đã có báo cáo tổng kết →
            </Link>
          )}
          <Link
            href={statementUrl}
            className="inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline"
          >
            Xem sao kê đầy đủ →
          </Link>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-sm font-medium text-muted">Đã giải ngân</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg font-bold text-fg tabular-nums">{pct !== null ? `${pct}%` : "—"}</span>
            <span className="text-sm text-muted tabular-nums">{formatVnd(summary.disbursed_total)}</span>
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-sm font-medium text-muted">Chứng từ hóa đơn công khai</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg font-bold text-fg tabular-nums">{summary.evidence_count}</span>
            <span className="text-sm text-muted">ảnh hóa đơn / biên nhận</span>
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-sm font-medium text-muted">Giao dịch chưa giải trình</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={unexplained === 0 ? "brand" : "warning"}>
              {unexplained === 0 ? "0 chưa giải trình" : `${unexplained} chưa giải trình`}
            </Badge>
            {unexplained > 0 && (
              <span className="text-sm text-muted tabular-nums">
                ({summary.unexplained_inbound_count} vào · {summary.unexplained_out_count} ra)
              </span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}
