"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { dbErrorMessage, done, fail, OPEN_MESSAGES, REVIEW_MESSAGES, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { dbAs } from "@/lib/supabase"

/**
 * Staff actions. They run with the moderator's own token: the database
 * functions check the staff role, block self-review and record history and
 * audit rows, so this file adds no authority of its own.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

/** Approves a campaign; if its start time has come it also goes live now. */
export async function approveCampaign(
  campaignId: string,
  _state: ActionResult,
  _form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(campaignId)) return fail(dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" }))
  const db = dbAs(session.accessToken)

  const { data } = await db.from("campaigns").select("slug, starts_at, ends_at").eq("id", campaignId).maybeSingle()
  const campaign = data as { slug: string; starts_at: string | null; ends_at: string | null } | null
  if (!campaign) return fail(dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" }))
  // transition_campaign does not check dates on approval, and an approved
  // campaign past its end date would never go live; send it back instead.
  if (campaign.ends_at && new Date(campaign.ends_at) <= new Date()) {
    return fail("Chiến dịch đã quá ngày kết thúc. Hãy yêu cầu người tổ chức sửa ngày thay vì duyệt.")
  }

  const approved = await db.rpc("transition_campaign", { p_campaign_id: campaignId, p_to_status: "approved" })
  if (approved.error) return fail(dbErrorMessage(approved.error, REVIEW_MESSAGES))

  let message = "Đã duyệt. Chiến dịch sẽ tự mở khi tới ngày bắt đầu."
  if (!campaign.starts_at || new Date(campaign.starts_at) <= new Date()) {
    const live = await db.rpc("transition_campaign", { p_campaign_id: campaignId, p_to_status: "live" })
    message = live.error
      ? `Đã duyệt, nhưng chưa mở được: ${dbErrorMessage(live.error, OPEN_MESSAGES)}`
      : "Đã duyệt và mở chiến dịch công khai."
    if (!live.error) revalidatePath(`/campaigns/${campaign.slug}`)
  }
  revalidatePath("/admin")
  revalidatePath("/campaigns")
  revalidatePath("/")
  return done(message)
}

export async function requestChanges(campaignId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(campaignId)) return fail(dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" }))
  const reason = String(form.get("reason") ?? "")
    .trim()
    .slice(0, 2000)
  if (!reason) return fail("Ghi rõ người tổ chức cần sửa gì.")

  const { error } = await dbAs(session.accessToken).rpc("transition_campaign", {
    p_campaign_id: campaignId,
    p_to_status: "changes_requested",
    p_reason: reason,
  })
  if (error) return fail(dbErrorMessage(error))
  revalidatePath("/admin")
  return done("Đã gửi yêu cầu chỉnh sửa cho người tổ chức.")
}

/**
 * Sets an organizer's verification. The names and kind the moderator saw
 * travel with the form; the database refuses if the organizer changed them since.
 */
export async function setVerification(userId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(userId)) return fail(dbErrorMessage({ message: "GIVE_ORGANIZER_NOT_FOUND" }))
  const status = String(form.get("status") ?? "")
  if (status !== "verified" && status !== "rejected")
    return fail(dbErrorMessage({ message: "GIVE_VERIFICATION_STATUS_INVALID" }))

  const { error } = await dbAs(session.accessToken).rpc("set_organizer_verification", {
    p_user_id: userId,
    p_status: status,
    p_expected_legal_name: String(form.get("expected_legal_name") ?? ""),
    p_expected_display_name: String(form.get("expected_display_name") ?? ""),
    p_expected_kind: String(form.get("expected_kind") ?? ""),
    p_reason:
      String(form.get("reason") ?? "")
        .trim()
        .slice(0, 500) || null,
  })
  if (error) return fail(dbErrorMessage(error))
  revalidatePath("/admin")
  return done(status === "verified" ? "Đã xác minh người tổ chức." : "Đã từ chối xác minh.")
}
