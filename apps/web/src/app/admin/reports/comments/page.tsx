import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge, type BadgeTone } from "@/components/ui/Badge"
import { ButtonLink, buttonClass } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { Field } from "@/components/ui/Field"
import { ChevronDownIcon, MessageIcon } from "@/components/ui/icons"
import { FilterNav, TabNav } from "@/components/ui/Tabs"
import { requireSession } from "@/lib/auth/session"
import {
  COMMENT_MODERATION_REASON_MAX,
  COMMENT_REPORT_REASON_LABELS,
  COMMENT_REPORT_STATUS_LABELS,
  COMMENT_REPORT_STATUSES,
  COMMENT_REPORTS_PAGE_SIZE,
  COMMENT_STATUS_LABELS,
  commentAuthorName,
  commentModerationHistoryLabel,
  commentModerationHistoryReason,
  commentReportActionLabel,
  commentReportsHref,
  listCommentModerationHistoryByComment,
  listCommentReports,
  parseCommentReportFilters,
  type CommentModerationHistoryRow,
  type CommentReportRow,
  type CommentReportStatus,
  type ReportedCommentStatus,
} from "@/lib/campaign-comments"
import { isStaff } from "@/lib/campaigns"
import { MODERATION_ROLES } from "@/lib/evidence-moderation"
import { formatDateTime } from "@/lib/format"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, Fact, Facts, ItemCard, ItemList } from "../../_components/ui"
import { moderateComment, resolveCommentReport } from "./actions"

export const metadata: Metadata = { title: "Báo cáo bình luận", robots: { index: false } }

const REPORT_STATUS_TONES: Record<CommentReportStatus, BadgeTone> = {
  open: "info",
  actioned: "brand",
  dismissed: "neutral",
}

const COMMENT_STATUS_TONES: Record<ReportedCommentStatus, BadgeTone> = {
  visible: "neutral",
  hidden: "warning",
  deleted: "danger",
}

/**
 * Moderator queue for reported campaign comments (DOS/Give#250, #262).
 * Moderator/admin staff only; everyone else gets a 404.
 */
export default async function AdminCommentReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
} = {}) {
  const params = searchParams ? await searchParams : {}
  const { status, page: requestedPage, campaignId } = parseCommentReportFilters(params)
  const session = await requireSession(commentReportsHref({ status, page: requestedPage, campaignId }))
  const db = dbAs(session.accessToken)
  if (!(await isStaff(db, MODERATION_ROLES))) notFound()

  const offset = (requestedPage - 1) * COMMENT_REPORTS_PAGE_SIZE
  const { reports, totalCount } = await listCommentReports(db, {
    status,
    campaignId,
    limit: COMMENT_REPORTS_PAGE_SIZE,
    offset,
  })
  // Postgres count(*) OVER () returns 0 rows when OFFSET >= total, so probe page 1
  // when a later page is empty to redirect cleanly to the last valid page.
  if (reports.length === 0 && requestedPage > 1) {
    const probe = await listCommentReports(db, { status, campaignId, limit: 1, offset: 0 })
    const lastPage = Math.max(1, Math.ceil(probe.totalCount / COMMENT_REPORTS_PAGE_SIZE))
    redirect(commentReportsHref({ status, page: lastPage, campaignId }))
  }
  const totalPages = Math.max(1, Math.ceil(totalCount / COMMENT_REPORTS_PAGE_SIZE))
  if (totalCount > 0 && requestedPage > totalPages) {
    redirect(commentReportsHref({ status, page: totalPages, campaignId }))
  }

  const historyByComment = await listCommentModerationHistoryByComment(
    db,
    reports.map((report) => report.comment_id)
  )

  return (
    <AdminPage
      title="Báo cáo bình luận"
      intro={
        <p>
          Người dùng đã đăng nhập báo cáo bình luận vi phạm quy định cộng đồng. Bạn có thể ẩn bình luận (bình luận biến
          khỏi trang công khai và mọi báo cáo đang mở của bình luận đó được chốt), bác bỏ báo cáo nếu không có vi phạm,
          hoặc hiện lại bình luận đã ẩn. Nếu tác giả đã xóa bình luận, chỉ có thể bác bỏ để đóng báo cáo. Mọi quyết định
          đều ghi vào nhật ký kiểm toán.
        </p>
      }
    >
      <TabNav
        label="Loại báo cáo"
        items={[
          { href: "/admin/reports", label: "Báo cáo chiến dịch", current: false },
          { href: "/admin/reports/comments", label: "Báo cáo bình luận", current: true },
          { href: "/admin/reports/wishes", label: "Báo cáo lời chúc", current: false },
        ]}
      />

      <FilterNav
        label="Lọc trạng thái báo cáo bình luận"
        items={COMMENT_REPORT_STATUSES.map((value) => ({
          href: commentReportsHref({ status: value, page: 1, campaignId }),
          label: COMMENT_REPORT_STATUS_LABELS[value],
          current: status === value,
        }))}
      />

      {campaignId && (
        <Callout tone="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">Đang lọc báo cáo bình luận của một chiến dịch cụ thể.</p>
            <ButtonLink href={commentReportsHref({ status, page: 1 })} variant="secondary" size="sm">
              Xem tất cả chiến dịch
            </ButtonLink>
          </div>
        </Callout>
      )}

      <AdminSection id="comment-reports" title={COMMENT_REPORT_STATUS_LABELS[status]} count={totalCount}>
        {reports.length === 0 ? (
          <EmptyState
            title={
              status === "open"
                ? "Không có báo cáo bình luận nào chờ xử lý."
                : "Không có báo cáo bình luận nào khớp bộ lọc."
            }
            icon={<MessageIcon width={40} height={40} />}
          >
            {status === "open"
              ? "Bình luận bị người xem báo cáo sẽ hiện ở đây để đội kiểm duyệt xem xét."
              : "Chọn trạng thái khác để xem các báo cáo bình luận tương ứng."}
          </EmptyState>
        ) : (
          <>
            <ItemList>
              {reports.map((report) => (
                <CommentReportCard
                  key={report.report_id}
                  report={report}
                  history={report.comment_id ? (historyByComment.get(report.comment_id) ?? []) : []}
                />
              ))}
            </ItemList>

            {totalPages > 1 && (
              <nav
                aria-label="Phân trang báo cáo bình luận"
                className="flex flex-wrap items-center justify-between gap-4"
              >
                <p className="text-sm text-muted tabular-nums">
                  Trang {requestedPage} / {totalPages} ({totalCount} báo cáo)
                </p>
                <div className="flex flex-wrap gap-2">
                  {requestedPage > 1 && (
                    <ButtonLink
                      href={commentReportsHref({ status, page: requestedPage - 1, campaignId })}
                      variant="secondary"
                    >
                      Trang trước
                    </ButtonLink>
                  )}
                  {requestedPage < totalPages && (
                    <ButtonLink
                      href={commentReportsHref({ status, page: requestedPage + 1, campaignId })}
                      variant="secondary"
                    >
                      Trang sau
                    </ButtonLink>
                  )}
                </div>
              </nav>
            )}
          </>
        )}
      </AdminSection>
    </AdminPage>
  )
}

function CommentReportCard({
  report,
  history,
}: {
  report: CommentReportRow
  history: readonly CommentModerationHistoryRow[]
}) {
  const isDeleted = report.comment_status === "deleted" || report.comment_id === null
  const isHidden = report.comment_status === "hidden"
  const isOpen = report.status === "open"

  return (
    <ItemCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={REPORT_STATUS_TONES[report.status]}>{COMMENT_REPORT_STATUS_LABELS[report.status]}</Badge>
            <Badge tone={COMMENT_STATUS_TONES[report.comment_status]}>
              {COMMENT_STATUS_LABELS[report.comment_status]}
            </Badge>
            {report.comment_parent_id !== null && <Badge tone="neutral">Phản hồi</Badge>}
          </div>
          <h3 className="mt-2 text-h3 break-words">{report.campaign_title}</h3>
        </div>
        <ButtonLink
          href={`/campaigns/${encodeURIComponent(report.campaign_slug)}#binh-luan`}
          variant="secondary"
          target="_blank"
        >
          Xem chiến dịch<span className="sr-only">: {report.campaign_title} (mở thẻ mới)</span>
        </ButtonLink>
      </div>

      <Facts columns={3}>
        <Fact label="Tác giả bình luận">{commentAuthorName(report.comment_author_name)}</Fact>
        <Fact label="Lý do báo cáo">{COMMENT_REPORT_REASON_LABELS[report.reason_code] ?? report.reason_code}</Fact>
        <Fact label="Thời điểm báo cáo">{formatDateTime(report.created_at)}</Fact>
        {report.comment_created_at && <Fact label="Đăng bình luận">{formatDateTime(report.comment_created_at)}</Fact>}
        {report.comment_deleted_at && <Fact label="Tác giả đã xóa">{formatDateTime(report.comment_deleted_at)}</Fact>}
      </Facts>

      <div className="space-y-2 rounded-md bg-surface p-4">
        <p className="text-sm font-medium text-muted">
          {isDeleted ? "Bản sao nội dung bình luận trước khi bị tác giả xóa" : "Nội dung bình luận"}
        </p>
        <p className="max-w-[68ch] break-words whitespace-pre-wrap text-fg">
          {report.comment_body ?? <span className="text-muted">(không có nội dung)</span>}
        </p>
      </div>

      {report.details && (
        <div>
          <p className="text-sm font-medium text-muted">Chi tiết từ người báo cáo</p>
          <p className="mt-1 max-w-[68ch] break-words whitespace-pre-wrap text-fg">{report.details}</p>
        </div>
      )}

      {!isOpen && (
        <Facts columns={3} className="border-t border-border pt-6">
          <Fact label="Kết quả">{commentReportActionLabel(report.action_taken)}</Fact>
          <Fact label="Người xử lý">{report.handled_by_name ?? "—"}</Fact>
          <Fact label="Thời điểm xử lý">{formatDateTime(report.handled_at)}</Fact>
          {report.resolution_note && (
            <Fact label="Ghi chú kiểm duyệt" wide>
              <p className="max-w-[68ch] break-words whitespace-pre-wrap">{report.resolution_note}</p>
            </Fact>
          )}
        </Facts>
      )}

      {!isDeleted && history.length > 0 && <CommentModerationHistory history={history} reportId={report.report_id} />}

      {isOpen ? (
        <div className="space-y-4 border-t border-border pt-6">
          {isDeleted && (
            <Callout tone="neutral">
              <p className="max-w-[68ch] text-sm">
                Tác giả đã xóa bình luận này; nội dung phía trên là bản sao lưu tại thời điểm báo cáo. Bạn không thể ẩn
                bình luận đã xóa, chỉ có thể bác bỏ để đóng báo cáo.
              </p>
            </Callout>
          )}
          {isHidden && (
            <Callout tone="warning">
              <p className="max-w-[68ch] text-sm">
                Bình luận này hiện đã bị ẩn khỏi trang công khai. Bạn có thể chốt báo cáo theo trạng thái đã ẩn hoặc bác
                bỏ báo cáo.
              </p>
            </Callout>
          )}
          <div className="max-w-[640px]">
            <ActionForm action={resolveCommentReport.bind(null, report.report_id)} className="space-y-4" resetOnSuccess>
              <Field
                htmlFor={`comment-report-resolve-${report.report_id}`}
                hintId={`comment-report-resolve-hint-${report.report_id}`}
                label="Lý do xử lý (bắt buộc, lưu nhật ký kiểm toán)"
                hint={`Tối đa ${COMMENT_MODERATION_REASON_MAX} ký tự.`}
              >
                <textarea
                  id={`comment-report-resolve-${report.report_id}`}
                  aria-describedby={`comment-report-resolve-hint-${report.report_id}`}
                  name="reason"
                  rows={2}
                  required
                  maxLength={COMMENT_MODERATION_REASON_MAX}
                  placeholder={
                    isDeleted
                      ? "Ví dụ: Tác giả đã chủ động xóa bình luận vi phạm."
                      : "Ví dụ: Bình luận chứa ngôn từ xúc phạm / Không phát hiện vi phạm."
                  }
                  className="field"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {!isDeleted && (
                  <SubmitButton name="action" value="hide" className={isHidden ? "btn-secondary" : "btn-danger"}>
                    {isHidden ? "Chốt theo trạng thái đã ẩn" : "Ẩn bình luận"}
                  </SubmitButton>
                )}
                <SubmitButton name="action" value="dismiss" className="btn-secondary">
                  Bác bỏ báo cáo
                </SubmitButton>
              </div>
            </ActionForm>
          </div>
        </div>
      ) : (
        report.comment_id && (
          <div className="border-t border-border pt-6">
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded text-sm font-medium text-fg hover:text-primary [&::-webkit-details-marker]:hidden">
                <span>{isHidden ? "Hiện lại bình luận" : "Ẩn bình luận"}</span>
                <ChevronDownIcon width={16} height={16} className="shrink-0 group-open:rotate-180" />
              </summary>
              <div className="mt-4 max-w-[640px]">
                <ActionForm
                  action={moderateComment.bind(null, report.comment_id)}
                  confirm={
                    isHidden ? "Hiện lại bình luận này trên trang công khai?" : "Ẩn bình luận này khỏi trang công khai?"
                  }
                  className="space-y-4"
                  resetOnSuccess
                >
                  <input type="hidden" name="action" value={isHidden ? "unhide" : "hide"} />
                  <Field
                    htmlFor={`comment-visibility-reason-${report.report_id}`}
                    hintId={`comment-visibility-reason-hint-${report.report_id}`}
                    label={isHidden ? "Lý do hiện lại (bắt buộc)" : "Lý do ẩn (bắt buộc)"}
                    hint={`Tối đa ${COMMENT_MODERATION_REASON_MAX} ký tự. Ghi vào nhật ký kiểm toán.`}
                  >
                    <textarea
                      id={`comment-visibility-reason-${report.report_id}`}
                      aria-describedby={`comment-visibility-reason-hint-${report.report_id}`}
                      name="reason"
                      rows={2}
                      required
                      maxLength={COMMENT_MODERATION_REASON_MAX}
                      placeholder={
                        isHidden
                          ? "Ví dụ: Đã rà soát lại, nội dung không vi phạm quy định."
                          : "Ví dụ: Xác nhận vi phạm sau khi kiểm tra bổ sung."
                      }
                      className="field"
                    />
                  </Field>
                  <SubmitButton className={buttonClass({ variant: isHidden ? "secondary" : "danger" })}>
                    {isHidden ? "Hiện lại bình luận" : "Ẩn bình luận"}
                  </SubmitButton>
                </ActionForm>
              </div>
            </details>
          </div>
        )
      )}
    </ItemCard>
  )
}

function CommentModerationHistory({
  history,
  reportId,
}: {
  history: readonly CommentModerationHistoryRow[]
  reportId: string
}) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded font-medium text-fg hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="tabular-nums">
          Lịch sử kiểm duyệt ({history.length})<span className="sr-only"> cho báo cáo {reportId}</span>
        </span>
        <ChevronDownIcon width={20} height={20} className="shrink-0 group-open:rotate-180" />
      </summary>
      <ol className="mt-2 divide-y divide-border border-t border-border">
        {history.map((entry) => {
          const reason = commentModerationHistoryReason(entry)
          return (
            <li key={String(entry.id)} className="space-y-1 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold text-fg">{commentModerationHistoryLabel(entry.action)}</span>
                <span className="text-muted">{entry.actor_display_name ?? "Hệ thống"}</span>
                <time dateTime={entry.created_at} className="text-muted tabular-nums">
                  {formatDateTime(entry.created_at)}
                </time>
              </div>
              {reason && <p className="max-w-[68ch] break-words whitespace-pre-wrap text-fg">{reason}</p>}
            </li>
          )
        })}
      </ol>
    </details>
  )
}
