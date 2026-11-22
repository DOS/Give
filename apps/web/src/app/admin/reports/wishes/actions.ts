"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { moderateWishSchema, type WishModerationAction } from "@/lib/donor-wishes"
import { done, fail, WISH_MODERATION_MESSAGES, wishDbErrorMessage, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { dbAs } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * Moderator/admin actions on `/admin/reports/wishes` (DOS/Give#320).
 *
 * Every RPC call runs with the staff member's own JWT (`dbAs(session.accessToken)`):
 * PostgREST verifies the token, and `give.moderate_contribution_message` locks
 * the caller's staff role (`give.lock_staff_role`), enforces `GIVE_SELF_REVIEW`,
 * and records every decision in `give.audit_log`.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

function doneMessage(action: WishModerationAction, resolvedReports: number): string {
  switch (action) {
    case "hide":
      return resolvedReports > 0
        ? `Đã ẩn lời chúc khỏi trang công khai và chốt ${resolvedReports} báo cáo đang mở.`
        : "Đã ẩn lời chúc khỏi trang công khai."
    case "restore":
      return "Đã khôi phục lời chúc trên trang công khai. Lưu ý: nếu vẫn còn báo cáo đang mở, hãy bấm Bác bỏ báo cáo để đóng hàng chờ."
    case "dismiss_reports":
      return resolvedReports > 0
        ? `Đã bác bỏ ${resolvedReports} báo cáo đang mở và giữ nguyên lời chúc.`
        : "Không còn báo cáo đang mở nào của lời chúc này."
  }
}

/** Moderator/admin hides, restores, or dismisses open reports on a reported donor wish. */
export async function moderateReportedWish(
  contributionId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(contributionId)) return fail(WISH_MODERATION_MESSAGES.GIVE_WISH_NOT_FOUND)

  const parsed = moderateWishSchema.safeParse(formFields(form, ["action", "reason"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const { data, error } = await dbAs(session.accessToken).rpc("moderate_contribution_message", {
    p_contribution_id: contributionId,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason,
  })
  if (error) return fail(wishDbErrorMessage(error, WISH_MODERATION_MESSAGES))

  const row = (Array.isArray(data) ? data[0] : data) as { resolved_reports?: number | string } | null | undefined
  const resolvedReports = Number(row?.resolved_reports) || 0

  revalidatePath("/admin/reports/wishes")
  revalidatePath("/campaigns/[slug]", "page")
  return done(doneMessage(parsed.data.action, resolvedReports))
}
