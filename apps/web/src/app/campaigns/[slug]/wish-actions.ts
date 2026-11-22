"use server"

import { revalidatePath } from "next/cache"

import type { WishHeartActionState } from "@/components/campaign/WishHeartButton"
import { getSession } from "@/lib/auth/session"
import { moderateWishSchema, reportWishSchema, type WishModerationAction } from "@/lib/donor-wishes"
import {
  done,
  fail,
  WISH_HEART_MESSAGES,
  WISH_MODERATION_MESSAGES,
  WISH_REPORT_MESSAGES,
  wishDbErrorMessage,
  type ActionResult,
} from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { SLUG_PATTERN } from "@/lib/slug"
import { dbAs } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * Campaign Donor Wishes Wall mutations (DOS/Give#320).
 *
 * Every RPC is SECURITY DEFINER, granted to `authenticated`, and reads
 * `auth.uid()` strictly from the verified JWT passed via `dbAs(session.accessToken)`
 * (never `dbService()`).
 */

const SIGNED_OUT_EXPIRED = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

function revalidateCampaignPath(slug: string) {
  if (SLUG_PATTERN.test(slug) && slug.length <= 80) {
    revalidatePath(`/campaigns/${slug}`)
  } else {
    revalidatePath("/campaigns/[slug]", "page")
  }
}

/** Atomically toggles the signed-in user's heart reaction on a public wish. */
export async function toggleWishHeart(
  contributionId: string,
  slug: string,
  prevState: WishHeartActionState,
  _form: FormData
): Promise<WishHeartActionState> {
  const session = await getSession()
  if (!session) {
    return { ...prevState, error: WISH_HEART_MESSAGES.GIVE_AUTH_REQUIRED }
  }
  if (!isUuid(contributionId)) {
    return { ...prevState, error: WISH_HEART_MESSAGES.GIVE_WISH_NOT_FOUND }
  }

  const { data, error } = await dbAs(session.accessToken).rpc("toggle_contribution_heart", {
    p_contribution_id: contributionId,
  })
  if (error) {
    return { ...prevState, error: wishDbErrorMessage(error, WISH_HEART_MESSAGES) }
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { hearted?: boolean; heart_count?: number | string } | null | undefined
  if (!row || typeof row.hearted !== "boolean") {
    return { ...prevState, error: "Có lỗi xảy ra. Hãy thử lại sau." }
  }

  revalidateCampaignPath(slug)
  return {
    hearted: row.hearted,
    heartCount: Math.max(0, Number(row.heart_count) || 0),
  }
}

/** Signed-in visitor reports another donor's visible wish on a public campaign. */
export async function reportWish(
  contributionId: string,
  slug: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(WISH_REPORT_MESSAGES.GIVE_AUTH_REQUIRED)
  if (!isUuid(contributionId)) return fail(WISH_REPORT_MESSAGES.GIVE_WISH_NOT_FOUND)

  const parsed = reportWishSchema.safeParse(formFields(form, ["reason"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const { error } = await dbAs(session.accessToken).rpc("report_contribution_message", {
    p_contribution_id: contributionId,
    p_reason: parsed.data.reason,
  })
  if (error) return fail(wishDbErrorMessage(error, WISH_REPORT_MESSAGES))

  revalidateCampaignPath(slug)
  revalidatePath("/admin/reports/wishes")
  return done("Cảm ơn bạn. Đội kiểm duyệt Give đã nhận báo cáo lời chúc và sẽ xem xét.")
}

function moderationDoneMessage(action: WishModerationAction, resolvedReports: number): string {
  switch (action) {
    case "hide":
      return resolvedReports > 0
        ? `Đã ẩn lời chúc khỏi trang công khai và chốt ${resolvedReports} báo cáo đang mở.`
        : "Đã ẩn lời chúc khỏi trang công khai."
    case "restore":
      return "Đã khôi phục lời chúc trên trang công khai."
    case "dismiss_reports":
      return resolvedReports > 0
        ? `Đã bác bỏ ${resolvedReports} báo cáo đang mở của lời chúc này.`
        : "Không còn báo cáo đang mở nào của lời chúc này."
  }
}

/**
 * Campaign owner, active accepted co-organizer editor, or non-self moderator/admin
 * hides or restores a donor wish directly from `/campaigns/[slug]`.
 */
export async function moderateWishFromCampaign(
  contributionId: string,
  slug: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT_EXPIRED)
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

  revalidateCampaignPath(slug)
  revalidatePath("/admin/reports/wishes")
  return done(moderationDoneMessage(parsed.data.action, resolvedReports))
}
