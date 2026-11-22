"use client"

import { useEffect, useRef, useState } from "react"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Markdown } from "@/components/Markdown"
import { Badge } from "@/components/ui/Badge"
import { buttonClass } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import type { CampaignStatus } from "@/lib/campaigns"
import type { ActionResult } from "@/lib/errors"
import { formatDateTime } from "@/lib/format"
import {
  canEditImpactReport,
  IMPACT_HIGHLIGHT_FIELD_MAX,
  IMPACT_HIGHLIGHTS_MAX,
  IMPACT_SUMMARY_MAX,
  type CampaignImpactReport,
  type ImpactHighlight,
} from "@/lib/transparency"

type SaveImpactReportAction = (state: ActionResult, formData: FormData) => Promise<ActionResult>

interface HighlightRow extends ImpactHighlight {
  key: number
}

function initialRows(highlights: readonly ImpactHighlight[]): HighlightRow[] {
  if (highlights.length === 0) return [{ key: 1, label: "", value: "" }]
  return highlights.map((item, idx) => ({ key: idx + 1, label: item.label, value: item.value }))
}

/**
 * Closing Impact Report editor inside `/me/campaigns/[id]` (DOS/Give#314).
 *
 * Accessible to both the owning organizer and accepted co-organizer editors
 * (#264 narrative scope) when the campaign is in `closed`, `succeeded`, or
 * `settling`. Uses Give's safe `<Markdown>` component for preview (no raw HTML).
 */
export function ImpactReportSection({
  campaignStatus,
  report,
  action,
}: {
  campaignStatus: CampaignStatus
  report: CampaignImpactReport | null
  action: SaveImpactReportAction
}) {
  const editable = canEditImpactReport(campaignStatus)
  const published = report?.published_at !== null && report?.published_at !== undefined

  const [summary, setSummary] = useState(report?.summary ?? "")
  const [rows, setRows] = useState<HighlightRow[]>(() => initialRows(report?.highlights ?? []))
  const [nextKey, setNextKey] = useState(() => (report?.highlights.length ?? 1) + 2)
  const [previewMode, setPreviewMode] = useState(false)
  const lastSyncedRef = useRef<string | null>(report?.updated_at ?? null)

  // Re-sync local draft fields with server-normalized values after save/revalidation
  // without remounting ActionForm (which preserves status/alert feedback).
  useEffect(() => {
    const updatedAt = report?.updated_at ?? null
    if (updatedAt === lastSyncedRef.current) return
    lastSyncedRef.current = updatedAt
    setSummary(report?.summary ?? "")
    const nextRows = initialRows(report?.highlights ?? [])
    setRows(nextRows)
    setNextKey(nextRows.length + 2)
  }, [report])

  const addRow = () => {
    if (rows.length >= IMPACT_HIGHLIGHTS_MAX) return
    setRows((prev) => [...prev, { key: nextKey, label: "", value: "" }])
    setNextKey((k) => k + 1)
  }

  const removeRow = (key: number) => {
    setRows((prev) => (prev.length <= 1 ? [{ key, label: "", value: "" }] : prev.filter((r) => r.key !== key)))
  }

  const updateRow = (key: number, field: "label" | "value", text: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: text } : r)))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {published ? (
          <Badge tone="brand">Đã công bố {formatDateTime(report.published_at)}</Badge>
        ) : report ? (
          <Badge tone="warning">Bản nháp — chưa công khai</Badge>
        ) : (
          <Badge tone="neutral">Chưa có báo cáo</Badge>
        )}
        {report?.updated_at && (
          <span className="text-sm text-muted">Cập nhật lần cuối: {formatDateTime(report.updated_at)}</span>
        )}
      </div>

      {!editable ? (
        <div className="space-y-4">
          <Callout tone="info" title="Báo cáo tổng kết đang ở chế độ chỉ đọc">
            Chỉ viết hoặc cập nhật báo cáo tổng kết khi chiến dịch ở trạng thái đã kết thúc, đạt mục tiêu hoặc đang đối
            soát.
          </Callout>
          {report && (
            <div className="space-y-4 rounded-md border border-border bg-surface/50 p-4">
              {report.highlights.length > 0 && (
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {report.highlights.map((item, idx) => (
                    <div key={`${item.label}-${idx}`} className="rounded border border-border bg-bg p-3">
                      <dt className="text-xs font-medium text-muted">{item.label}</dt>
                      <dd className="mt-1 text-base font-bold text-fg tabular-nums">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="max-w-[68ch]">
                <Markdown>{report.summary}</Markdown>
              </div>
            </div>
          )}
        </div>
      ) : (
        <ActionForm action={action} className="space-y-6 [&>*]:max-w-160">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {previewMode ? (
                <span className="label mb-0">Nội dung báo cáo tổng kết (Xem trước Markdown)</span>
              ) : (
                <label htmlFor="impact-summary" className="label mb-0">
                  Nội dung báo cáo tổng kết (Markdown)
                </label>
              )}
              <button
                type="button"
                onClick={() => setPreviewMode((v) => !v)}
                className="text-sm font-medium text-primary hover:underline"
              >
                {previewMode ? "Quay lại chỉnh sửa" : "Xem trước Markdown"}
              </button>
            </div>

            {previewMode ? (
              <>
                <input type="hidden" name="summary" value={summary} />
                <div className="mt-2 min-h-40 rounded-md border border-border bg-surface p-4">
                  {summary.trim() ? (
                    <Markdown>{summary}</Markdown>
                  ) : (
                    <p className="text-sm text-muted">Chưa có nội dung để xem trước.</p>
                  )}
                </div>
              </>
            ) : (
              <textarea
                id="impact-summary"
                name="summary"
                className="mt-2 field"
                rows={8}
                required
                maxLength={IMPACT_SUMMARY_MAX}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                aria-describedby="impact-summary-hint"
                placeholder="Tóm tắt kết quả đạt được, cách sử dụng nguồn quỹ, khó khăn đã vượt qua và lời cảm ơn người ủng hộ…"
              />
            )}
            <p id="impact-summary-hint" className="hint">
              Hỗ trợ Markdown cơ bản (tiêu đề, in đậm, danh sách, liên kết); HTML thô không được hiển thị. Tối đa{" "}
              {IMPACT_SUMMARY_MAX.toLocaleString("vi-VN")} ký tự.
            </p>
          </div>

          <fieldset className="space-y-3">
            <legend className="label">
              Chỉ số tác động nổi bật (tối đa {IMPACT_HIGHLIGHTS_MAX} mục, không bắt buộc)
            </legend>
            <p className="hint mt-0">
              Ví dụ: tiêu đề “Học sinh nhận học bổng”, giá trị “120 em”. Các chỉ số này hiển thị nổi bật đầu báo cáo.
            </p>
            <div className="space-y-3">
              {rows.map((row, idx) => (
                <div key={row.key} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div>
                    <label htmlFor={`highlight-label-${row.key}`} className="text-xs font-medium text-muted">
                      Tiêu đề #{idx + 1}
                    </label>
                    <input
                      id={`highlight-label-${row.key}`}
                      name="highlight_label"
                      className="mt-1 field"
                      maxLength={IMPACT_HIGHLIGHT_FIELD_MAX}
                      value={row.label}
                      onChange={(e) => updateRow(row.key, "label", e.target.value)}
                      placeholder="Ví dụ: Phòng học hoàn thành"
                    />
                  </div>
                  <div>
                    <label htmlFor={`highlight-value-${row.key}`} className="text-xs font-medium text-muted">
                      Giá trị #{idx + 1}
                    </label>
                    <input
                      id={`highlight-value-${row.key}`}
                      name="highlight_value"
                      className="mt-1 field"
                      maxLength={IMPACT_HIGHLIGHT_FIELD_MAX}
                      value={row.value}
                      onChange={(e) => updateRow(row.key, "value", e.target.value)}
                      placeholder="Ví dụ: 3 phòng"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className={buttonClass({ variant: "secondary", size: "sm" })}
                    aria-label={`Xóa chỉ số ${idx + 1}`}
                  >
                    Xóa
                  </button>
                </div>
              ))}
            </div>
            {rows.length < IMPACT_HIGHLIGHTS_MAX && (
              <button type="button" onClick={addRow} className={buttonClass({ variant: "secondary", size: "sm" })}>
                + Thêm chỉ số nổi bật
              </button>
            )}
          </fieldset>

          {published ? (
            <div className="space-y-2">
              <p className="hint mt-0">
                Báo cáo đã công khai không thể chuyển lại thành bản nháp để bảo vệ tính minh bạch. Bạn có thể cập nhật
                nội dung công khai bất cứ lúc nào.
              </p>
              <SubmitButton name="intent" value="publish" className={buttonClass()}>
                Cập nhật báo cáo đã công bố
              </SubmitButton>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <SubmitButton name="intent" value="draft" className={buttonClass({ variant: "secondary" })}>
                Lưu bản nháp
              </SubmitButton>
              <SubmitButton
                name="intent"
                value="publish"
                confirm="Báo cáo tổng kết sau khi công bố sẽ hiển thị công khai và không thể chuyển lại thành bản nháp. Bạn có chắc muốn công bố?"
                className={buttonClass()}
              >
                Công bố báo cáo
              </SubmitButton>
            </div>
          )}
        </ActionForm>
      )}
    </div>
  )
}
