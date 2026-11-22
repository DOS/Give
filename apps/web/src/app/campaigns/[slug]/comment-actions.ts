"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import {
  createCommentSchema,
  editCommentSchema,
  hideCommentSchema,
  moderateCommentSchema,
  reportCommentSchema,
  type CommentModerationAction,
} from "@/lib/campaign-comments"
import {
  COMMENT_ACTION_MESSAGES,
  COMMENT_MODERATION_MESSAGES,
  COMMENT_ORGANIZER_HIDE_MESSAGES,
  COMMENT_REPORT_MESSAGES,
  commentDbErrorMessage,
  done,
  fail,
  type ActionResult,
} from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { SLUG_PATTERN } from "@/lib/slug"
import { dbAs } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * Campaign comment mutations (DOS/Give#250, #262).
 *
 * Every RPC is SECURITY DEFINER, granted to `authenticated`, and reads
 * `auth.uid()` from the verified JWT passed via `dbAs(session.accessToken)`.
 */

const SIGNED_OUT_COMMENT = "Hãy đăng nhập để thực hiện thao tác này."
const SIGNED_OUT_EXPIRED = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

function revalidateCampaignPath(slug: string) {
  if (SLUG_PATTERN.test(slug) && slug.length <= 80) {
    revalidatePath(`/campaigns/${slug}`)
  } else {
    revalidatePath("/campaigns/[slug]", "page")
  }
}

/** Posts a top-level comment or 1-level reply on a public campaign. */
export async function createComment(
  campaignId: string,
  slug: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail("Hãy đăng nhập để gửi bình luận.")
  if (!isUuid(campaignId)) return fail(COMMENT_ACTION_MESSAGES.GIVE_CAMPAIGN_NOT_FOUND)

  const parsed = createCommentSchema.safeParse(formFields(form, ["body", "parent_id"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const { error } = await dbAs(session.accessToken).rpc("create_campaign_comment", {
    p_campaign_id: campaignId,
    p_body: parsed.data.body,
    p_parent_id: parsed.data.parent_id,
  })
  if (error) return fail(commentDbErrorMessage(error, COMMENT_ACTION_MESSAGES))

  revalidateCampaignPath(slug)
  return done(parsed.data.parent_id ? "Đã gửi phản hồi." : "Đã đăng bình luận.")
}

/** Edits the signed-in author's own visible comment. */
export async function editComment(
  commentId: string,
  slug: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT_COMMENT)
  if (!isUuid(commentId)) return fail(COMMENT_ACTION_MESSAGES.GIVE_COMMENT_NOT_FOUND)

  const parsed = editCommentSchema.safeParse(formFields(form, ["body"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const { error } = await dbAs(session.accessToken).rpc("edit_campaign_comment", {
    p_comment_id: commentId,
    p_body: parsed.data.body,
  })
  if (error) return fail(commentDbErrorMessage(error, COMMENT_ACTION_MESSAGES))

  revalidateCampaignPath(slug)
  return done("Đã cập nhật bình luận.")
}

/** Deletes the signed-in author's own visible comment (cascades visible replies). */
export async function deleteComment(
  commentId: string,
  slug: string,
  _state: ActionResult,
  _form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT_COMMENT)
  if (!isUuid(commentId)) return fail(COMMENT_ACTION_MESSAGES.GIVE_COMMENT_NOT_FOUND)

  const { error } = await dbAs(session.accessToken).rpc("delete_campaign_comment", {
    p_comment_id: commentId,
  })
  if (error) return fail(commentDbErrorMessage(error, COMMENT_ACTION_MESSAGES))

  revalidateCampaignPath(slug)
  revalidatePath("/admin/reports/comments")
  return done("Đã xóa bình luận.")
}

/** Campaign organizer hides a comment on their own public campaign. */
export async function hideCommentAsOrganizer(
  commentId: string,
  slug: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT_EXPIRED)
  if (!isUuid(commentId)) return fail(COMMENT_ORGANIZER_HIDE_MESSAGES.GIVE_COMMENT_NOT_FOUND)

  const parsed = hideCommentSchema.safeParse(formFields(form, ["reason"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const { data, error } = await dbAs(session.accessToken).rpc("hide_campaign_comment", {
    p_comment_id: commentId,
    p_reason: parsed.data.reason,
  })
  if (error) return fail(commentDbErrorMessage(error, COMMENT_ORGANIZER_HIDE_MESSAGES))

  revalidateCampaignPath(slug)
  revalidatePath("/admin/reports/comments")
  return done(data === true ? "Đã ẩn bình luận khỏi trang công khai." : "Bình luận này đã được ẩn trước đó.")
}

/** Signed-in visitor reports another user's visible comment. */
export async function reportComment(
  commentId: string,
  slug: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail("Hãy đăng nhập để báo cáo bình luận.")
  if (!isUuid(commentId)) return fail(COMMENT_REPORT_MESSAGES.GIVE_COMMENT_NOT_FOUND)

  const parsed = reportCommentSchema.safeParse(formFields(form, ["reason_code", "details"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const { error } = await dbAs(session.accessToken).rpc("report_campaign_comment", {
    p_comment_id: commentId,
    p_reason_code: parsed.data.reason_code,
    p_details: parsed.data.details,
  })
  if (error) return fail(commentDbErrorMessage(error, COMMENT_REPORT_MESSAGES))

  revalidateCampaignPath(slug)
  revalidatePath("/admin/reports/comments")
  return done("Cảm ơn bạn. Đội kiểm duyệt Give đã nhận báo cáo bình luận và sẽ xem xét.")
}

function moderationDoneMessage(action: CommentModerationAction, resolvedReports: number): string {
  switch (action) {
    case "hide":
      return resolvedReports > 0 ? `Đã ẩn bình luận và chốt ${resolvedReports} báo cáo đang mở.` : "Đã ẩn bình luận."
    case "unhide":
      return "Đã hiện lại bình luận trên trang công khai."
    case "dismiss_reports":
      return resolvedReports > 0
        ? `Đã bác bỏ ${resolvedReports} báo cáo của bình luận này.`
        : "Không còn báo cáo đang mở nào của bình luận này."
  }
}

/** Moderator or admin directly hides/unhides a comment from the campaign page. */
export async function moderateCommentFromCampaign(
  commentId: string,
  slug: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT_EXPIRED)
  if (!isUuid(commentId)) return fail(COMMENT_MODERATION_MESSAGES.GIVE_COMMENT_NOT_FOUND)

  const parsed = moderateCommentSchema.safeParse(formFields(form, ["action", "reason"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const { data, error } = await dbAs(session.accessToken).rpc("moderate_campaign_comment", {
    p_comment_id: commentId,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason,
  })
  if (error) return fail(commentDbErrorMessage(error, COMMENT_MODERATION_MESSAGES))

  revalidateCampaignPath(slug)
  revalidatePath("/admin/reports/comments")
  return done(moderationDoneMessage(parsed.data.action, typeof data === "number" ? data : 0))
}
