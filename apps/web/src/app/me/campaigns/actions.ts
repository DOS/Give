"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getSession, type Session } from "@/lib/auth/session"
import { canPostUpdate, isEditableStatus, type CampaignStatus, type CampaignType } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { campaignMediaPrefix, detectImageType, MAX_COVER_BYTES, mediaPath, reencodeCover } from "@/lib/media"
import { dbAs, dbService, MEDIA_BUCKET } from "@/lib/supabase"
import { campaignContentSchema, firstError, formFields, milestoneSchema, updateSchema } from "@/lib/validation"

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_EDITABLE = "Chỉ sửa được chiến dịch đang là bản nháp hoặc cần chỉnh sửa."
const NOT_FOUND = "Không tìm thấy chiến dịch của bạn."

interface OwnedCampaign {
  id: string
  slug: string
  type: CampaignType
  status: CampaignStatus
  organizer_id: string
  cover_media_id: string | null
}

/**
 * Loads a campaign through RLS with the caller's own token and checks that
 * the caller organizes it. PostgREST verifies the token, so a forged one
 * fails here before anything else runs.
 */
async function ownedCampaign(
  session: Session,
  campaignId: string
): Promise<{ campaign: OwnedCampaign; error: null } | { campaign: null; error: string }> {
  if (!isUuid(campaignId)) return { campaign: null, error: NOT_FOUND }
  const { data, error } = await dbAs(session.accessToken)
    .from("campaigns")
    .select("id, slug, type, status, organizer_id, cover_media_id")
    .eq("id", campaignId)
    .maybeSingle()
  if (error) return { campaign: null, error: dbErrorMessage(error) }
  const campaign = data as OwnedCampaign | null
  if (!campaign || campaign.organizer_id !== session.user.id) return { campaign: null, error: NOT_FOUND }
  return { campaign, error: null }
}

function refresh(campaign: Pick<OwnedCampaign, "id" | "slug">) {
  revalidatePath(`/me/campaigns/${campaign.id}`)
  revalidatePath("/me/campaigns")
  revalidatePath(`/campaigns/${campaign.slug}`)
}

export async function saveContent(campaignId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (!isEditableStatus(campaign.status)) return fail(NOT_EDITABLE)

  const parsed = campaignContentSchema.safeParse(
    formFields(form, [
      "title",
      "summary",
      "story",
      "category_id",
      "beneficiary_name",
      "beneficiary_relation",
      "goal_amount",
      "min_contribution",
      "stretch_goal_amount",
      "starts_at",
      "ends_at",
      "payment_window_days",
    ])
  )
  if (!parsed.success) return fail(firstError(parsed.error))
  const values = parsed.data
  const isGive = campaign.type === "give"

  const { data, error } = await dbAs(session.accessToken)
    .from("campaigns")
    .update({
      ...values,
      // Beneficiaries belong to charity campaigns, stretch goals and the
      // payment window to reward projects.
      beneficiary_name: isGive ? values.beneficiary_name : null,
      beneficiary_relation: isGive ? values.beneficiary_relation : null,
      stretch_goal_amount: isGive ? null : values.stretch_goal_amount,
      payment_window_days: isGive ? 7 : values.payment_window_days,
      display_options: {
        progress_bar: form.get("show_progress_bar") === "on",
        backers_count: form.get("show_backers_count") === "on",
        time_remaining: form.get("show_time_remaining") === "on",
      },
    })
    .eq("id", campaign.id)
    .select("id")
  if (error) return fail(dbErrorMessage(error))
  if (!data?.length) return fail(NOT_EDITABLE)

  refresh(campaign)
  return done("Đã lưu nội dung.")
}

export async function addMilestone(campaignId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (!isEditableStatus(campaign.status)) return fail(NOT_EDITABLE)
  const parsed = milestoneSchema.safeParse(formFields(form, ["title", "target_amount", "description"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const { error } = await dbAs(session.accessToken)
    .from("campaign_milestones")
    .insert({ campaign_id: campaign.id, ...parsed.data, sort_order: 0 })
  if (error) return fail(dbErrorMessage(error))
  refresh(campaign)
  return done("Đã thêm mốc.")
}

export async function deleteMilestone(
  campaignId: string,
  milestoneId: string,
  _state: ActionResult,
  _form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(milestoneId)) return fail(NOT_FOUND)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (!isEditableStatus(campaign.status)) return fail(NOT_EDITABLE)

  const { data, error } = await dbAs(session.accessToken)
    .from("campaign_milestones")
    .delete()
    .eq("id", milestoneId)
    .eq("campaign_id", campaign.id)
    .select("id")
  if (error) return fail(dbErrorMessage(error))
  if (!data?.length) return fail("Không xóa được mốc này. Hãy tải lại trang.")
  refresh(campaign)
  return done("Đã xóa mốc.")
}

/**
 * Cover upload. Users cannot write the give-media bucket or campaign_media
 * directly, so after the RLS ownership check the server stores the object
 * and its media row with the service role, then sets the cover with the
 * user's own token, so RLS decides the final write. Any failure after the
 * upload removes what was written.
 */
export async function uploadCover(campaignId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (!isEditableStatus(campaign.status)) return fail(NOT_EDITABLE)

  const file = form.get("cover")
  if (!(file instanceof File) || file.size === 0) return fail("Chọn một ảnh.")
  if (file.size > MAX_COVER_BYTES) return fail("Ảnh tối đa 4 MB.")
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!detectImageType(bytes)) return fail("Chỉ nhận ảnh JPEG, PNG hoặc WebP.")
  // Re-encoding drops EXIF (GPS, device) before the image goes public.
  let cover: Uint8Array
  try {
    cover = await reencodeCover(bytes)
  } catch {
    return fail("Không đọc được ảnh này. Hãy thử ảnh khác.")
  }
  const alt =
    String(form.get("alt") ?? "")
      .trim()
      .slice(0, 200) || null

  const service = dbService()
  const storage = service.storage.from(MEDIA_BUCKET)
  const mediaId = randomUUID()
  const path = mediaPath(campaign.id, mediaId, "webp")

  const uploaded = await storage.upload(path, cover, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  })
  if (uploaded.error) return fail("Không tải được ảnh lên. Hãy thử lại.")

  const inserted = await service
    .from("campaign_media")
    .insert({ id: mediaId, campaign_id: campaign.id, kind: "image", storage_path: path, alt, sort_order: 0 })
  if (inserted.error) {
    await storage.remove([path])
    return fail(dbErrorMessage(inserted.error))
  }

  const updated = await dbAs(session.accessToken)
    .from("campaigns")
    .update({ cover_media_id: mediaId })
    .eq("id", campaign.id)
    .select("id")
  if (updated.error || !updated.data?.length) {
    await service.from("campaign_media").delete().eq("id", mediaId)
    await storage.remove([path])
    return fail(updated.error ? dbErrorMessage(updated.error) : NOT_EDITABLE)
  }

  // Drop the previous cover; it is no longer referenced.
  if (campaign.cover_media_id && campaign.cover_media_id !== mediaId) {
    const old = await service
      .from("campaign_media")
      .delete()
      .eq("id", campaign.cover_media_id)
      .eq("campaign_id", campaign.id)
      .select("storage_path")
    const oldPath = (old.data?.[0] as { storage_path: string | null } | undefined)?.storage_path
    if (oldPath) await storage.remove([oldPath])
  }

  refresh(campaign)
  return done("Đã cập nhật ảnh bìa.")
}

async function transition(
  session: Session,
  campaign: OwnedCampaign,
  toStatus: CampaignStatus,
  reason?: string | null
): Promise<ActionResult | null> {
  const { error } = await dbAs(session.accessToken).rpc("transition_campaign", {
    p_campaign_id: campaign.id,
    p_to_status: toStatus,
    p_reason: reason ?? null,
  })
  return error ? fail(dbErrorMessage(error)) : null
}

export async function submitForReview(
  campaignId: string,
  _state: ActionResult,
  _form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  const failed = await transition(session, campaign, "in_review")
  if (failed) return failed
  refresh(campaign)
  return done("Đã gửi duyệt. Kiểm duyệt viên sẽ xem chiến dịch của bạn.")
}

export async function cancelCampaign(campaignId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  const reason = String(form.get("reason") ?? "")
    .trim()
    .slice(0, 500)
  const failed = await transition(session, campaign, "cancelled", reason)
  if (failed) return failed
  refresh(campaign)
  return done("Đã hủy chiến dịch.")
}

/** Deletes a draft that was never submitted, with its media objects. */
export async function deleteDraft(campaignId: string, _state: ActionResult, _form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (campaign.status !== "draft") return fail("Chỉ xóa được bản nháp. Chiến dịch đã gửi duyệt thì dùng Hủy.")

  const { data, error } = await dbAs(session.accessToken)
    .from("campaigns")
    .delete()
    .eq("id", campaign.id)
    .eq("status", "draft")
    .select("id")
  if (error) return fail(dbErrorMessage(error))
  if (!data?.length) return fail("Không xóa được bản nháp này.")

  // RLS allowed the delete, so the caller owned everything under the
  // campaign's prefix; removing by prefix also catches covers uploaded
  // concurrently. Best effort: the draft is already gone.
  const storage = dbService().storage.from(MEDIA_BUCKET)
  const prefix = campaignMediaPrefix(campaign.id)
  const listed = await storage.list(prefix, { limit: 1000 })
  const paths = (listed.data ?? []).map((object) => `${prefix}/${object.name}`)
  if (paths.length) await storage.remove(paths)

  revalidatePath("/me/campaigns")
  redirect("/me/campaigns")
}

/** Publishes an update right away; published updates cannot be edited. */
export async function postUpdate(campaignId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (!canPostUpdate(campaign.status)) return fail("Không thể đăng cập nhật cho chiến dịch đã hủy hoặc đang tạm dừng.")
  const parsed = updateSchema.safeParse(formFields(form, ["title", "body"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const { error } = await dbAs(session.accessToken)
    .from("campaign_updates")
    .insert({
      campaign_id: campaign.id,
      author_id: session.user.id,
      ...parsed.data,
      visibility: "public",
      published_at: new Date().toISOString(),
    })
  if (error) return fail(dbErrorMessage(error))
  refresh(campaign)
  return done("Đã đăng cập nhật.")
}
