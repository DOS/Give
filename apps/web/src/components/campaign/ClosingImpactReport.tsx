import { Markdown } from "@/components/Markdown"
import { Badge } from "@/components/ui/Badge"
import { formatDate } from "@/lib/format"
import type { CampaignImpactReport } from "@/lib/transparency"

/**
 * Public Closing Impact Report section on `/campaigns/[slug]` (DOS/Give#314).
 *
 * Shown only for publicly visible campaigns when `published_at !== null`.
 * Renders highlights as plain text and summary through Give's safe `<Markdown>`
 * component (raw HTML disabled, unsafe link protocols dropped, third-party
 * images excluded).
 */
export function ClosingImpactReport({ report }: { report: CampaignImpactReport }) {
  if (!report.published_at) return null

  const updatedAfterPublish =
    report.updated_at && new Date(report.updated_at).getTime() - new Date(report.published_at).getTime() > 60_000

  return (
    <section id="bao-cao-tong-ket" aria-labelledby="impact-report-heading" className="scroll-mt-24">
      <div className="space-y-6 card p-4 sm:p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">Báo cáo tổng kết tác động</Badge>
            <span className="text-sm text-muted">
              Công bố ngày {formatDate(report.published_at)}
              {updatedAfterPublish ? ` · Cập nhật ${formatDate(report.updated_at)}` : ""}
            </span>
          </div>
          <h2 id="impact-report-heading" className="text-h2">
            Kết quả thực hiện chiến dịch
          </h2>
        </header>

        {report.highlights.length > 0 && (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-impact-highlights>
            {report.highlights.map((item, idx) => (
              <div key={`${item.label}-${idx}`} className="min-w-0 rounded-md bg-surface p-3">
                <dt className="text-sm font-medium break-words text-muted">{item.label}</dt>
                <dd className="mt-1 text-lg font-bold break-words text-fg tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="max-w-[68ch]">
          <Markdown>{report.summary}</Markdown>
        </div>
      </div>
    </section>
  )
}
