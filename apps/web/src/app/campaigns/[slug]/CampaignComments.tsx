import clsx from "clsx"
import Link from "next/link"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { ButtonLink, buttonClass } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { Field } from "@/components/ui/Field"
import { FlagIcon, MessageIcon } from "@/components/ui/icons"
import {
  campaignCommentsHref,
  COMMENT_BODY_MAX,
  COMMENT_HIDDEN_ROLE_LABELS,
  COMMENT_MODERATION_REASON_MAX,
  COMMENT_REPORT_DETAILS_MAX,
  COMMENT_REPORT_REASON_LABELS,
  COMMENT_REPORT_REASONS,
  commentAuthorInitial,
  COMMENTS_PAGE_SIZE,
  DELETED_AUTHOR_FALLBACK,
  type CampaignCommentRow,
  type CommentThread,
} from "@/lib/campaign-comments"
import { formatDateTime } from "@/lib/format"

import {
  createComment,
  deleteComment,
  editComment,
  hideCommentAsOrganizer,
  moderateCommentFromCampaign,
  reportComment,
} from "./comment-actions"

const DISCLOSURE_SUMMARY_CLASS =
  "inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded text-sm font-medium text-muted hover:text-fg hover:underline [&::-webkit-details-marker]:hidden"

/**
 * Public campaign comments section with one reply level, author edit/delete,
 * reporting, organizer hide, and staff moderation view (DOS/Give#250).
 *
 * All comment bodies are rendered strictly as React plain text (never HTML or
 * Markdown, no clickable links, no images).
 */
export function CampaignComments({
  campaignId,
  slug,
  threads,
  totalTopLevel,
  page,
  signedIn,
  ownCampaign,
  isModerator,
  showHidden,
}: {
  campaignId: string
  slug: string
  threads: readonly CommentThread[]
  totalTopLevel: number
  page: number
  signedIn: boolean
  ownCampaign: boolean
  isModerator: boolean
  showHidden: boolean
}) {
  const loginHref = `/auth/login?return_path=${encodeURIComponent(`/campaigns/${slug}`)}`
  const totalPages = Math.max(1, Math.ceil(totalTopLevel / COMMENTS_PAGE_SIZE))

  return (
    <section id="binh-luan" aria-labelledby="comments-heading" className="scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="comments-heading" className="flex flex-wrap items-center gap-3 text-h2">
          Bình luận
          {totalTopLevel > 0 && (
            <Badge size="md" className="tabular-nums">
              {totalTopLevel}
            </Badge>
          )}
        </h2>
        {isModerator && (
          <Link
            href={campaignCommentsHref(slug, { page: 1, showHidden: !showHidden })}
            className="hit-area shrink-0 text-sm font-semibold text-primary hover:underline"
          >
            {showHidden ? "Chỉ hiện bình luận công khai" : "Hiện bình luận đã ẩn"}
          </Link>
        )}
      </div>

      <div className="mt-6 max-w-[640px]">
        {signedIn ? (
          <ActionForm action={createComment.bind(null, campaignId, slug)} className="space-y-4" resetOnSuccess>
            <Field
              htmlFor="comment-new-body"
              hintId="comment-new-hint"
              label="Viết bình luận"
              hint={`Tối đa ${COMMENT_BODY_MAX} ký tự. Chỉ văn bản thuần, không chèn ảnh hay liên kết.`}
            >
              <textarea
                id="comment-new-body"
                aria-describedby="comment-new-hint"
                name="body"
                rows={3}
                required
                maxLength={COMMENT_BODY_MAX}
                placeholder="Chia sẻ lời động viên hoặc đặt câu hỏi cho người tổ chức…"
                className="field"
              />
            </Field>
            <SubmitButton className="btn-primary">Gửi bình luận</SubmitButton>
          </ActionForm>
        ) : (
          <div className="space-y-3 rounded-md bg-surface p-4 sm:p-6">
            <p className="text-fg">Đăng nhập bằng DOS ID để bình luận hoặc trả lời trên chiến dịch này.</p>
            <a href={loginHref} className={buttonClass({ variant: "secondary" })}>
              Đăng nhập để bình luận
            </a>
          </div>
        )}
      </div>

      {threads.length === 0 ? (
        page === 1 && totalTopLevel === 0 ? (
          <EmptyState title="Chưa có bình luận nào" icon={<MessageIcon width={40} height={40} />}>
            Hãy là người đầu tiên gửi lời động viên hoặc đặt câu hỏi cho chiến dịch này.
          </EmptyState>
        ) : (
          <div className="mt-6 space-y-4 border-t border-border pt-6">
            <p className="text-muted">Trang này không có bình luận.</p>
            <ButtonLink href={campaignCommentsHref(slug, { page: 1, showHidden })} variant="secondary">
              Về trang bình luận đầu tiên
            </ButtonLink>
          </div>
        )
      ) : (
        <ol className="mt-6 divide-y divide-border border-t border-border">
          {threads.map((thread) => (
            <li key={thread.root.id} className="py-6">
              <CommentItem
                comment={thread.root}
                campaignId={campaignId}
                slug={slug}
                isReply={false}
                signedIn={signedIn}
                ownCampaign={ownCampaign}
                isModerator={isModerator}
              />
              {thread.replies.length > 0 && (
                <ol
                  aria-label="Các phản hồi"
                  className="mt-4 ml-4 space-y-4 border-l border-border pl-4 sm:ml-12 sm:pl-6"
                >
                  {thread.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentItem
                        comment={reply}
                        campaignId={campaignId}
                        slug={slug}
                        isReply
                        signedIn={signedIn}
                        ownCampaign={ownCampaign}
                        isModerator={isModerator}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Phân trang bình luận"
          className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6"
        >
          <p className="text-sm text-muted tabular-nums">
            Trang {page} / {totalPages} ({totalTopLevel} bình luận)
          </p>
          <div className="flex flex-wrap gap-2">
            {page > 1 && (
              <ButtonLink href={campaignCommentsHref(slug, { page: page - 1, showHidden })} variant="secondary">
                Trang trước
              </ButtonLink>
            )}
            {page < totalPages && (
              <ButtonLink href={campaignCommentsHref(slug, { page: page + 1, showHidden })} variant="secondary">
                Trang sau
              </ButtonLink>
            )}
          </div>
        </nav>
      )}
    </section>
  )
}

function CommentItem({
  comment,
  campaignId,
  slug,
  isReply,
  signedIn,
  ownCampaign,
  isModerator,
}: {
  comment: CampaignCommentRow
  campaignId: string
  slug: string
  isReply: boolean
  signedIn: boolean
  ownCampaign: boolean
  isModerator: boolean
}) {
  const isVisible = comment.status === "visible"
  const isHidden = comment.status === "hidden"
  const hasAuthorName = Boolean(comment.author_display_name?.trim())
  const canReply = signedIn && !isReply && isVisible
  const canEditOrDelete = signedIn && comment.is_author && isVisible
  const canReport = signedIn && !comment.is_author && isVisible
  const canOrganizerHide = signedIn && ownCampaign && isVisible
  const canStaffModerate = signedIn && isModerator && !ownCampaign && !comment.is_author
  const hasActions = canReply || canEditOrDelete || canReport || canOrganizerHide || canStaffModerate

  const hiddenRoleLabel = comment.hidden_role ? COMMENT_HIDDEN_ROLE_LABELS[comment.hidden_role] : "Kiểm duyệt"

  return (
    <div className="flex items-start gap-3">
      <span
        className="inline-flex size-9 shrink-0 items-center justify-center rounded bg-surface text-sm font-bold text-muted"
        aria-hidden
      >
        {commentAuthorInitial(comment.author_display_name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {hasAuthorName ? (
            <span className="font-semibold break-words text-fg">{comment.author_display_name}</span>
          ) : (
            <span className="font-medium text-muted">{DELETED_AUTHOR_FALLBACK}</span>
          )}
          {comment.is_organizer && <Badge tone="brand">Người tổ chức</Badge>}
          {isHidden && <Badge tone="warning">Đã ẩn</Badge>}
          <time dateTime={comment.created_at} className="text-sm text-muted tabular-nums">
            {formatDateTime(comment.created_at)}
          </time>
          {comment.edited_at && (
            <span className="text-sm text-muted" title={`Chỉnh sửa lúc ${formatDateTime(comment.edited_at)}`}>
              (đã chỉnh sửa)
            </span>
          )}
        </div>

        <p className={clsx("mt-2 max-w-[68ch] break-words whitespace-pre-wrap", isHidden ? "text-muted" : "text-fg")}>
          {comment.body}
        </p>

        {isHidden && (
          <Callout tone="warning" className="mt-3 text-sm">
            <p className="max-w-[68ch] break-words">
              Đã ẩn bởi {hiddenRoleLabel}
              {comment.hidden_by_display_name ? ` (${comment.hidden_by_display_name})` : ""}
              {comment.hidden_at ? ` lúc ${formatDateTime(comment.hidden_at)}` : ""}.
            </p>
            {comment.hidden_reason && (
              <p className="max-w-[68ch] break-words whitespace-pre-wrap">Lý do: {comment.hidden_reason}</p>
            )}
          </Callout>
        )}

        {hasActions && (
          <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-1">
            {canReply && (
              <details className="group min-w-0 open:w-full">
                <summary className={DISCLOSURE_SUMMARY_CLASS}>Trả lời</summary>
                <div className="mt-2 max-w-[640px] border-t border-border pt-4 pb-2">
                  <ActionForm action={createComment.bind(null, campaignId, slug)} className="space-y-4" resetOnSuccess>
                    <input type="hidden" name="parent_id" value={comment.id} />
                    <Field
                      htmlFor={`comment-reply-${comment.id}`}
                      hintId={`comment-reply-hint-${comment.id}`}
                      label="Nội dung phản hồi"
                      hint={`Tối đa ${COMMENT_BODY_MAX} ký tự. Chỉ văn bản thuần.`}
                    >
                      <textarea
                        id={`comment-reply-${comment.id}`}
                        aria-describedby={`comment-reply-hint-${comment.id}`}
                        name="body"
                        rows={2}
                        required
                        maxLength={COMMENT_BODY_MAX}
                        placeholder="Viết phản hồi của bạn…"
                        className="field"
                      />
                    </Field>
                    <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>
                      Gửi phản hồi
                    </SubmitButton>
                  </ActionForm>
                </div>
              </details>
            )}

            {canEditOrDelete && (
              <>
                <details className="group min-w-0 open:w-full">
                  <summary className={DISCLOSURE_SUMMARY_CLASS}>Chỉnh sửa</summary>
                  <div className="mt-2 max-w-[640px] border-t border-border pt-4 pb-2">
                    <ActionForm action={editComment.bind(null, comment.id, slug)} className="space-y-4">
                      <Field
                        htmlFor={`comment-edit-${comment.id}`}
                        hintId={`comment-edit-hint-${comment.id}`}
                        label="Chỉnh sửa bình luận"
                        hint={`Tối đa ${COMMENT_BODY_MAX} ký tự.`}
                      >
                        <textarea
                          id={`comment-edit-${comment.id}`}
                          aria-describedby={`comment-edit-hint-${comment.id}`}
                          name="body"
                          rows={3}
                          required
                          maxLength={COMMENT_BODY_MAX}
                          defaultValue={comment.body}
                          className="field"
                        />
                      </Field>
                      <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>
                        Lưu chỉnh sửa
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </details>

                <ActionForm
                  action={deleteComment.bind(null, comment.id, slug)}
                  confirm={
                    isReply
                      ? "Xóa phản hồi này? Thao tác không thể hoàn tác."
                      : "Xóa bình luận này? Các phản hồi hiển thị bên dưới cũng sẽ bị xóa vĩnh viễn."
                  }
                >
                  <SubmitButton className="inline-flex min-h-11 items-center rounded text-sm font-medium text-danger hover:underline">
                    Xóa
                  </SubmitButton>
                </ActionForm>
              </>
            )}

            {canOrganizerHide && (
              <details className="group min-w-0 open:w-full">
                <summary className={DISCLOSURE_SUMMARY_CLASS}>Ẩn bình luận</summary>
                <div className="mt-2 max-w-[640px] border-t border-border pt-4 pb-2">
                  <ActionForm
                    action={hideCommentAsOrganizer.bind(null, comment.id, slug)}
                    confirm="Ẩn bình luận này khỏi trang công khai?"
                    className="space-y-4"
                  >
                    <Field
                      htmlFor={`comment-hide-reason-${comment.id}`}
                      hintId={`comment-hide-reason-hint-${comment.id}`}
                      label="Lý do ẩn (không bắt buộc)"
                      hint={`Tối đa ${COMMENT_MODERATION_REASON_MAX} ký tự. Bình luận sẽ ẩn ngay khỏi trang công khai và được ghi vào nhật ký kiểm toán.`}
                    >
                      <textarea
                        id={`comment-hide-reason-${comment.id}`}
                        aria-describedby={`comment-hide-reason-hint-${comment.id}`}
                        name="reason"
                        rows={2}
                        maxLength={COMMENT_MODERATION_REASON_MAX}
                        placeholder="Ví dụ: Nội dung quảng cáo không liên quan đến chiến dịch."
                        className="field"
                      />
                    </Field>
                    <SubmitButton className={buttonClass({ variant: "danger", size: "sm" })}>Ẩn bình luận</SubmitButton>
                  </ActionForm>
                </div>
              </details>
            )}

            {canStaffModerate && (
              <details className="group min-w-0 open:w-full">
                <summary className={DISCLOSURE_SUMMARY_CLASS}>
                  {isHidden ? "Hiện lại bình luận" : "Ẩn (kiểm duyệt)"}
                </summary>
                <div className="mt-2 max-w-[640px] border-t border-border pt-4 pb-2">
                  <ActionForm
                    action={moderateCommentFromCampaign.bind(null, comment.id, slug)}
                    confirm={
                      isHidden
                        ? "Hiện lại bình luận này trên trang công khai?"
                        : "Ẩn bình luận này theo quyền kiểm duyệt? Các báo cáo đang mở của bình luận này sẽ được chốt."
                    }
                    className="space-y-4"
                  >
                    <input type="hidden" name="action" value={isHidden ? "unhide" : "hide"} />
                    <Field
                      htmlFor={`comment-mod-reason-${comment.id}`}
                      hintId={`comment-mod-reason-hint-${comment.id}`}
                      label={isHidden ? "Lý do hiện lại (bắt buộc)" : "Lý do ẩn (bắt buộc)"}
                      hint={`Tối đa ${COMMENT_MODERATION_REASON_MAX} ký tự. Ghi vào nhật ký kiểm toán.`}
                    >
                      <textarea
                        id={`comment-mod-reason-${comment.id}`}
                        aria-describedby={`comment-mod-reason-hint-${comment.id}`}
                        name="reason"
                        rows={2}
                        required
                        maxLength={COMMENT_MODERATION_REASON_MAX}
                        placeholder={
                          isHidden
                            ? "Ví dụ: Đã kiểm tra lại, nội dung không vi phạm quy định."
                            : "Ví dụ: Ngôn từ xúc phạm, vi phạm quy định cộng đồng."
                        }
                        className="field"
                      />
                    </Field>
                    <SubmitButton className={buttonClass({ variant: isHidden ? "secondary" : "danger", size: "sm" })}>
                      {isHidden ? "Hiện lại bình luận" : "Ẩn bình luận"}
                    </SubmitButton>
                  </ActionForm>
                </div>
              </details>
            )}

            {canReport && (
              <details className="group min-w-0 open:w-full">
                <summary className={DISCLOSURE_SUMMARY_CLASS}>
                  <FlagIcon width={16} height={16} />
                  Báo cáo
                </summary>
                <div className="mt-2 max-w-[640px] border-t border-border pt-4 pb-2">
                  <ActionForm action={reportComment.bind(null, comment.id, slug)} className="space-y-6" resetOnSuccess>
                    <Field htmlFor={`comment-report-reason-${comment.id}`} label="Lý do báo cáo">
                      <select
                        id={`comment-report-reason-${comment.id}`}
                        name="reason_code"
                        required
                        defaultValue=""
                        className="field"
                      >
                        <option value="" disabled>
                          Chọn lý do…
                        </option>
                        {COMMENT_REPORT_REASONS.map((code) => (
                          <option key={code} value={code}>
                            {COMMENT_REPORT_REASON_LABELS[code]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      htmlFor={`comment-report-details-${comment.id}`}
                      hintId={`comment-report-details-hint-${comment.id}`}
                      label="Chi tiết (bắt buộc nếu chọn “Lý do khác”)"
                      hint={`Tối đa ${COMMENT_REPORT_DETAILS_MAX} ký tự. Báo cáo được giữ kín; người tổ chức và tác giả không biết ai báo cáo.`}
                    >
                      <textarea
                        id={`comment-report-details-${comment.id}`}
                        aria-describedby={`comment-report-details-hint-${comment.id}`}
                        name="details"
                        rows={2}
                        maxLength={COMMENT_REPORT_DETAILS_MAX}
                        placeholder="Nêu cụ thể dấu hiệu vi phạm…"
                        className="field"
                      />
                    </Field>
                    <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>
                      Gửi báo cáo
                    </SubmitButton>
                  </ActionForm>
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
