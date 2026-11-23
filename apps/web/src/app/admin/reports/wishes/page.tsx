import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge, type BadgeTone } from "@/components/ui/Badge"
import { ButtonLink, buttonClass } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { Field } from "@/components/ui/Field"
import { ChevronDownIcon, HeartIcon } from "@/components/ui/icons"
import { FilterNav, TabNav } from "@/components/ui/Tabs"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import {
  listReportedContributionMessages,
  parseWishReportStatus,
  WISH_HIDDEN_ROLE_LABELS,
  WISH_REASON_MAX,
  WISH_REPORT_STATUS_LABELS,
  WISH_REPORT_STATUSES,
  WISH_REPORTS_LIMIT,
  wishDonorName,
  wishReportsHref,
  type ReportedWishRow,
  type WishReportStatus,
} from "@/lib/donor-wishes"
import { MODERATION_ROLES } from "@/lib/evidence-moderation"
import { formatDateTime, formatVnd } from "@/lib/format"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, Fact, Facts, ItemCard, ItemList } from "../../_components/ui"
import { moderateReportedWish } from "./actions"

export const metadata: Metadata = { title: "Báo cáo lời chúc", robots: { index: false } }

const COUNT = new Intl.NumberFormat("vi-VN")

const REPORT_STATUS_TONES: Record<WishReportStatus, BadgeTone> = {
  open: "info",
  resolved: "brand",
  dismissed: "neutral",
}

/**
 * Moderator/admin queue for reported donor wishes (DOS/Give#320).
 * Strictly `dbAs(session.accessToken)` — zero `dbService()` and zero raw PII.
 */
export default async function AdminWishReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
} = {}) {
  const params = searchParams ? await searchParams : {}
  const status = parseWishReportStatus(params)
  const session = await requireSession(wishReportsHref(status))
  const db = dbAs(session.accessToken)
  if (!(await isStaff(db, MODERATION_ROLES))) notFound()

  const { reports, totalCount } = await listReportedContributionMessages(db, {
    status,
    limit: WISH_REPORTS_LIMIT,
  })

  return (
    <AdminPage
      title="Báo cáo lời chúc"
      intro={
        <p>
          Người dùng đã đăng nhập báo cáo lời chúc không phù hợp trên Tường lời chúc. Ẩn lời chúc chỉ che nội dung lời
          chúc khỏi trang công khai và chốt toàn bộ báo cáo đang mở của lời chúc đó; số tiền ủng hộ trên sao kê không
          thay đổi. Nếu khôi phục một lời chúc vẫn còn báo cáo đang mở, hãy bấm Bác bỏ báo cáo để đóng hàng chờ.
        </p>
      }
    >
      <TabNav
        label="Loại báo cáo"
        items={[
          { href: "/admin/reports", label: "Báo cáo chiến dịch", current: false },
          { href: "/admin/reports/comments", label: "Báo cáo bình luận", current: false },
          { href: "/admin/reports/wishes", label: "Báo cáo lời chúc", current: true },
        ]}
      />

      <FilterNav
        label="Lọc trạng thái báo cáo lời chúc"
        items={WISH_REPORT_STATUSES.map((value) => ({
          href: wishReportsHref(value),
          label: WISH_REPORT_STATUS_LABELS[value],
          current: status === value,
        }))}
      />

      <AdminSection id="wish-reports" title={WISH_REPORT_STATUS_LABELS[status]} count={totalCount}>
        {reports.length === 0 ? (
          <EmptyState
            title={
              status === "open"
                ? "Không có báo cáo lời chúc nào chờ xử lý."
                : "Không có báo cáo lời chúc nào khớp bộ lọc."
            }
            icon={<HeartIcon width={40} height={40} />}
          >
            {status === "open"
              ? "Lời chúc bị người xem báo cáo sẽ hiện ở đây để đội kiểm duyệt xem xét."
              : "Chọn trạng thái khác để xem các báo cáo lời chúc tương ứng."}
          </EmptyState>
        ) : (
          <>
            {totalCount > reports.length && (
              <p className="mb-4 text-sm text-muted tabular-nums">
                Đang hiển thị {COUNT.format(reports.length)} báo cáo {status === "open" ? "sớm nhất" : "mới nhất"} trên
                tổng số {COUNT.format(totalCount)} báo cáo.
              </p>
            )}
            <ItemList>
              {reports.map((report) => (
                <WishReportCard key={report.report_id} report={report} />
              ))}
            </ItemList>
          </>
        )}
      </AdminSection>
    </AdminPage>
  )
}

function WishReportCard({ report }: { report: ReportedWishRow }) {
  const isHidden = report.message_hidden_at !== null
  const isOpen = report.status === "open"
  const donorLabel = wishDonorName(report.donor_display_name, report.is_anonymous)
  const hiddenRoleLabel = report.message_hidden_role ? WISH_HIDDEN_ROLE_LABELS[report.message_hidden_role] : null

  return (
    <ItemCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={REPORT_STATUS_TONES[report.status]}>{WISH_REPORT_STATUS_LABELS[report.status]}</Badge>
            <Badge tone={isHidden ? "warning" : "neutral"}>
              {isHidden ? (hiddenRoleLabel ? `Đã ẩn · ${hiddenRoleLabel}` : "Đã ẩn") : "Đang hiển thị"}
            </Badge>
          </div>
          <h3 className="mt-2 text-h3 break-words">{report.campaign_title}</h3>
        </div>
        <ButtonLink
          href={`/campaigns/${encodeURIComponent(report.campaign_slug)}#tuong-loi-chuc`}
          variant="secondary"
          target="_blank"
        >
          Xem chiến dịch<span className="sr-only">: {report.campaign_title} (mở thẻ mới)</span>
        </ButtonLink>
      </div>

      <Facts columns={3}>
        <Fact label="Người ủng hộ">{donorLabel}</Fact>
        <Fact label="Số tiền đã khớp">
          <span className="tabular-nums">{formatVnd(report.amount)}</span>
        </Fact>
        <Fact label="Thời điểm báo cáo">{formatDateTime(report.created_at)}</Fact>
      </Facts>

      <div className="space-y-2 rounded-md bg-surface p-4">
        <p className="text-sm font-medium text-muted">Nội dung lời chúc</p>
        <p className="max-w-[68ch] break-words whitespace-pre-wrap text-fg">
          {report.message ?? <span className="text-muted">(không có nội dung)</span>}
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-muted">Lý do báo cáo</p>
        <p className="mt-1 max-w-[68ch] break-words whitespace-pre-wrap text-fg">{report.reason}</p>
      </div>

      {isHidden && report.message_hide_reason && (
        <div>
          <p className="text-sm font-medium text-muted">Lý do ẩn hiện tại</p>
          <p className="mt-1 max-w-[68ch] break-words whitespace-pre-wrap text-fg">{report.message_hide_reason}</p>
        </div>
      )}

      {!isOpen && (
        <Facts columns={2} className="border-t border-border pt-6">
          <Fact label="Người xử lý">{report.resolved_by_name ?? "—"}</Fact>
          <Fact label="Thời điểm xử lý">{formatDateTime(report.resolved_at)}</Fact>
        </Facts>
      )}

      {isOpen ? (
        <div className="space-y-4 border-t border-border pt-6">
          {isHidden && (
            <Callout tone="warning">
              <p className="max-w-[68ch] text-sm">
                Lời chúc này hiện đã bị ẩn khỏi trang công khai. Bấm “Xác nhận ẩn & chốt báo cáo” để nâng thành quyết
                định kiểm duyệt và đóng báo cáo, hoặc “Bác bỏ báo cáo” nếu không có vi phạm.
              </p>
            </Callout>
          )}
          <div className="max-w-[640px]">
            <ActionForm
              action={moderateReportedWish.bind(null, report.contribution_id)}
              className="space-y-4"
              resetOnSuccess
            >
              <Field
                htmlFor={`wish-report-reason-${report.report_id}`}
                hintId={`wish-report-reason-hint-${report.report_id}`}
                label="Lý do xử lý (không bắt buộc, lưu nhật ký kiểm toán)"
                hint={`Tối đa ${WISH_REASON_MAX} ký tự.`}
              >
                <textarea
                  id={`wish-report-reason-${report.report_id}`}
                  aria-describedby={`wish-report-reason-hint-${report.report_id}`}
                  name="reason"
                  rows={2}
                  maxLength={WISH_REASON_MAX}
                  placeholder="Ví dụ: Lời chúc vi phạm quy định cộng đồng / Không phát hiện vi phạm."
                  className="field"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <SubmitButton name="action" value="hide" className={isHidden ? "btn-secondary" : "btn-danger"}>
                  {isHidden ? "Xác nhận ẩn & chốt báo cáo" : "Ẩn lời chúc & chốt báo cáo"}
                </SubmitButton>
                <SubmitButton name="action" value="dismiss_reports" className="btn-secondary">
                  Bác bỏ báo cáo
                </SubmitButton>
                {isHidden && (
                  <SubmitButton name="action" value="restore" className="btn-secondary">
                    Khôi phục lời chúc (giữ báo cáo mở)
                  </SubmitButton>
                )}
              </div>
            </ActionForm>
          </div>
        </div>
      ) : (
        <div className="border-t border-border pt-6">
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded text-sm font-medium text-fg hover:text-primary [&::-webkit-details-marker]:hidden">
              <span>{isHidden ? "Khôi phục lời chúc" : "Ẩn lời chúc"}</span>
              <ChevronDownIcon width={16} height={16} className="shrink-0 group-open:rotate-180" />
            </summary>
            <div className="mt-4 max-w-[640px]">
              <ActionForm
                action={moderateReportedWish.bind(null, report.contribution_id)}
                confirm={
                  isHidden
                    ? "Khôi phục lời chúc này để hiển thị lại trên Tường lời chúc?"
                    : "Ẩn lời chúc này khỏi trang công khai?"
                }
                className="space-y-4"
                resetOnSuccess
              >
                <input type="hidden" name="action" value={isHidden ? "restore" : "hide"} />
                <Field
                  htmlFor={`wish-visibility-reason-${report.report_id}`}
                  hintId={`wish-visibility-reason-hint-${report.report_id}`}
                  label={isHidden ? "Lý do khôi phục (không bắt buộc)" : "Lý do ẩn (không bắt buộc)"}
                  hint={`Tối đa ${WISH_REASON_MAX} ký tự. Ghi vào nhật ký kiểm toán.`}
                >
                  <textarea
                    id={`wish-visibility-reason-${report.report_id}`}
                    aria-describedby={`wish-visibility-reason-hint-${report.report_id}`}
                    name="reason"
                    rows={2}
                    maxLength={WISH_REASON_MAX}
                    placeholder={
                      isHidden
                        ? "Ví dụ: Đã rà soát lại, lời chúc không vi phạm."
                        : "Ví dụ: Xác nhận vi phạm sau khi kiểm tra bổ sung."
                    }
                    className="field"
                  />
                </Field>
                <SubmitButton className={buttonClass({ variant: isHidden ? "secondary" : "danger" })}>
                  {isHidden ? "Khôi phục lời chúc" : "Ẩn lời chúc"}
                </SubmitButton>
              </ActionForm>
            </div>
          </details>
        </div>
      )}
    </ItemCard>
  )
}
