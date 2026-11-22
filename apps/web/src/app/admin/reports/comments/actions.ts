"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import {
  moderateCommentSchema,
  resolveCommentReportSchema,
  type CommentModerationAction,
  type CommentReportResolveAction,
} from "@/lib/campaign-comments"
import {
  COMMENT_MODERATION_MESSAGES,
  COMMENT_REPORT_RESOLVE_MESSAGES,
  commentDbErrorMessage,
  done,
  fail,
  type ActionResult,
} from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { dbAs } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * Moderator/admin actions on `/admin/reports/comments` (DOS/Give#250, #262).
 *
 * Both RPCs run with the staff member's own JWT (`dbAs(session.accessToken)`):
 * PostgREST verifies the token, and the database checks `give.lock_staff_role`
 * (`moderator` | `admin`), enforces `GIVE_SELF_REVIEW`, and writes `give.audit_log`.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

function resolveDoneMessage(action: CommentReportResolveAction, resolved: number): string {
  if (resolved === 0) return "Báo cáo này đã được xử lý trước đó."
  return action === "hide"
    ? `Đã ẩn bình luận và chốt ${resolved} báo cáo đang mở.`
    : `Đã bác bỏ ${resolved} báo cáo bình luận.`
}

function moderateDoneMessage(action: CommentModerationAction, resolved: number): string {
  switch (action) {
    case "hide":
      return resolved > 0 ? `Đã ẩn bình luận và chốt ${resolved} báo cáo đang mở.` : "Đã ẩn bình luận."
    case "unhide":
      return "Đã hiện lại bình luận trên trang công khai."
    case "dismiss_reports":
      return resolved > 0
        ? `Đã bác bỏ ${resolved} báo cáo của bình luận này.`
        : "Không còn báo cáo đang mở nào của bình luận này."
  }
}

/** Resolves an open comment report by hiding the comment or dismissing the report. */
export async function resolveCommentReport(
  reportId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(reportId)) return fail(COMMENT_MODERATION_MESSAGES.GIVE_REPORT_NOT_FOUND)

  const parsed = resolveCommentReportSchema.safeParse(formFields(form, ["action", "reason"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const { data, error } = await dbAs(session.accessToken).rpc("resolve_comment_report", {
    p_report_id: reportId,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason,
  })
  if (error) return fail(commentDbErrorMessage(error, COMMENT_REPORT_RESOLVE_MESSAGES))

  revalidatePath("/admin/reports/comments")
  revalidatePath("/campaigns/[slug]", "page")
  return done(resolveDoneMessage(parsed.data.action, typeof data === "number" ? data : 0))
}

/** Directly hides, unhides, or dismisses reports on a live/hidden comment. */
export async function moderateComment(commentId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(commentId)) return fail(COMMENT_MODERATION_MESSAGES.GIVE_COMMENT_NOT_FOUND)

  const parsed = moderateCommentSchema.safeParse(formFields(form, ["action", "reason"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const { data, error } = await dbAs(session.accessToken).rpc("moderate_campaign_comment", {
    p_comment_id: commentId,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason,
  })
  if (error) return fail(commentDbErrorMessage(error, COMMENT_MODERATION_MESSAGES))

  revalidatePath("/admin/reports/comments")
  revalidatePath("/campaigns/[slug]", "page")
  return done(moderateDoneMessage(parsed.data.action, typeof data === "number" ? data : 0))
}
