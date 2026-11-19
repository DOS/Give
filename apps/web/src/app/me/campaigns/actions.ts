"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getSession, type Session } from "@/lib/auth/session"
import { checkSubmitAccount } from "@/lib/campaign-account"
import { canPostUpdate, isEditableStatus, type CampaignStatus, type CampaignType } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, SUBMIT_MESSAGES, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { campaignMediaPrefix, detectImageType, MAX_COVER_BYTES, mediaPath, reencodeCover } from "@/lib/media"
import { dbAs, dbService, MEDIA_BUCKET } from "@/lib/supabase"
import { campaignContentSchema, firstError, formFields, milestoneSchema, updateSchema } from "@/lib/validation"

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_EDITABLE = "Chỉ sửa được chiến dịch đang là bản nháp hoặc cần chỉnh sửa."
const NOT_FOUND = "Không tìm thấy chiến dịch của bạn."
const INVALID_YOUTUBE =
  "Liên kết YouTube không hợp lệ. Hãy dán liên kết của một video YouTube (không phải danh sách phát hay kênh) hoặc mã video 11 ký tự."
const YOUTUBE_ALT_TOO_LONG = "Mô tả video tối đa 200 ký tự."
const UNLOCK_NOTE_TOO_LONG = "Ghi chú khi đạt mốc tối đa 500 ký tự."

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"])
const YOUTUBE_NOCOOKIE_HOSTS = new Set(["youtube-nocookie.com", "www.youtube-nocookie.com"])
const RESERVED_EMBED_IDS = new Set(["videoseries", "live_stream"])

const CANCEL_MESSAGES: Record<string, string> = {
  GIVE_TRANSITION_NOT_ALLOWED:
    "Không hủy được chiến dịch: chiến dịch không còn ở trạng thái cho phép hủy (có thể vừa được mở công khai). Hãy tải lại trang.",
}

interface OwnedCampaign {
  id: string
  slug: string
  type: CampaignType
  status: CampaignStatus
  organizer_id: string
  cover_media_id: string | null
}

/**
 * Loads a campaign with the caller's own token through
 * give.managed_campaigns() (the table hides organizer_id from clients) and
 * checks that the caller organizes it: staff see every campaign there.
 * PostgREST verifies the token, so a forged one fails here before anything
 * else runs.
 */
async function ownedCampaign(
  session: Session,
  campaignId: string
): Promise<{ campaign: OwnedCampaign; error: null } | { campaign: null; error: string }> {
  if (!isUuid(campaignId)) return { campaign: null, error: NOT_FOUND }
  const { data, error } = await dbAs(session.accessToken)
    .rpc("managed_campaigns", { p_campaign_id: campaignId })
    .select("id, slug, type, status, organizer_id, cover_media_id")
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

function isValidVideoId(id: string): boolean {
  return YOUTUBE_ID_RE.test(id) && !RESERVED_EMBED_IDS.has(id.toLowerCase())
}

function parseYoutubeId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (isValidVideoId(trimmed)) {
    return trimmed
  }

  let url: URL
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      url = new URL(trimmed)
      if (url.protocol !== "https:" && url.protocol !== "http:") return null
    } else if (/^(?:(?:www|m)\.)?(?:youtu\.be|youtube\.com|youtube-nocookie\.com)\//i.test(trimmed)) {
      url = new URL(`https://${trimmed}`)
    } else {
      return null
    }
  } catch {
    return null
  }

  if (url.username || url.password || url.port) return null
  if (url.searchParams.has("list") || url.searchParams.has("channel")) return null

  const host = url.hostname.toLowerCase()
  const segments = url.pathname.split("/").filter(Boolean)

  if (host === "youtu.be" || host === "www.youtu.be") {
    if (segments.length !== 1) return null
    return isValidVideoId(segments[0]) ? segments[0] : null
  }

  if (YOUTUBE_HOSTS.has(host)) {
    if (segments.length === 1 && segments[0] === "watch") {
      const vParams = url.searchParams.getAll("v")
      if (vParams.length !== 1) return null
      return isValidVideoId(vParams[0]) ? vParams[0] : null
    }
    if (segments.length === 2 && (segments[0] === "shorts" || segments[0] === "embed")) {
      return isValidVideoId(segments[1]) ? segments[1] : null
    }
    return null
  }

  if (YOUTUBE_NOCOOKIE_HOSTS.has(host)) {
    if (segments.length === 2 && segments[0] === "embed") {
      return isValidVideoId(segments[1]) ? segments[1] : null
    }
    return null
  }

  return null
}

function parseMilestoneForm(form: FormData):
  | {
      data: {
        title: string
        target_amount: number
        description: string | null
        unlock_note: string | null
      }
      error: null
    }
  | { data: null; error: string } {
  const parsed = milestoneSchema.safeParse(formFields(form, ["title", "target_amount", "description"]))
  if (!parsed.success) return { data: null, error: firstError(parsed.error) }
  const rawUnlockNote = String(form.get("unlock_note") ?? "").trim()
  if (rawUnlockNote.length > 500) return { data: null, error: UNLOCK_NOTE_TOO_LONG }
  return {
    data: {
      ...parsed.data,
      unlock_note: rawUnlockNote === "" ? null : rawUnlockNote,
    },
    error: null,
  }
}

export async function saveYoutubeVideo(
  campaignId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (!isEditableStatus(campaign.status)) return fail(NOT_EDITABLE)

  const rawYoutube = String(form.get("youtube_id") ?? form.get("youtube_url") ?? "")
  const youtubeId = parseYoutubeId(rawYoutube)
  if (!youtubeId) return fail(INVALID_YOUTUBE)

  const rawAlt = String(form.get("alt") ?? "").trim()
  if (rawAlt.length > 200) return fail(YOUTUBE_ALT_TOO_LONG)
  const alt = rawAlt === "" ? null : rawAlt

  const service = dbService()
  const mediaId = randomUUID()
  const inserted = await service
    .from("campaign_media")
    .insert({ id: mediaId, campaign_id: campaign.id, kind: "youtube", youtube_id: youtubeId, alt, sort_order: 0 })
    .select("created_at")
    .maybeSingle()
  if (inserted.error) return fail(dbErrorMessage(inserted.error))

  let cleanupQuery = service
    .from("campaign_media")
    .delete()
    .eq("campaign_id", campaign.id)
    .eq("kind", "youtube")
    .neq("id", mediaId)
  const createdAt = (inserted.data as { created_at?: string } | null)?.created_at
  if (createdAt) cleanupQuery = cleanupQuery.lte("created_at", createdAt)
  const cleanup = await cleanupQuery
  if (cleanup.error) {
    try {
      await service
        .from("campaign_media")
        .delete()
        .eq("id", mediaId)
        .eq("campaign_id", campaign.id)
        .eq("kind", "youtube")
    } catch {
      // Best-effort rollback cleanup.
    }
    return fail(dbErrorMessage(cleanup.error))
  }

  refresh(campaign)
  return done("Đã lưu video giới thiệu.")
}

export async function removeYoutubeVideo(
  campaignId: string,
  _state: ActionResult = null,
  _form?: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (!isEditableStatus(campaign.status)) return fail(NOT_EDITABLE)

  const { error } = await dbService()
    .from("campaign_media")
    .delete()
    .eq("campaign_id", campaign.id)
    .eq("kind", "youtube")
  if (error) return fail(dbErrorMessage(error))

  refresh(campaign)
  return done("Đã gỡ video giới thiệu.")
}

export async function addMilestone(campaignId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (!isEditableStatus(campaign.status)) return fail(NOT_EDITABLE)
  const parsed = parseMilestoneForm(form)
  if (!parsed.data) return fail(parsed.error)

  const { error } = await dbAs(session.accessToken)
    .from("campaign_milestones")
    .insert({ campaign_id: campaign.id, ...parsed.data, sort_order: 0 })
  if (error) return fail(dbErrorMessage(error))
  refresh(campaign)
  return done("Đã thêm mốc.")
}

export async function updateMilestone(
  campaignId: string,
  milestoneId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(campaignId) || !isUuid(milestoneId)) return fail(NOT_FOUND)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (!isEditableStatus(campaign.status)) return fail(NOT_EDITABLE)

  const parsed = parseMilestoneForm(form)
  if (!parsed.data) return fail(parsed.error)

  const { data, error } = await dbAs(session.accessToken)
    .from("campaign_milestones")
    .update(parsed.data)
    .eq("id", milestoneId)
    .eq("campaign_id", campaign.id)
    .select("id")
  if (error) return fail(dbErrorMessage(error))
  if (!data?.length) return fail("Không lưu được mốc này. Hãy tải lại trang.")

  refresh(campaign)
  return done("Đã lưu mốc.")
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
    try {
      await storage.remove([path])
    } catch {
      // Best-effort rollback cleanup.
    }
    return fail(dbErrorMessage(inserted.error))
  }

  const rollbackNewCover = async () => {
    try {
      await service.from("campaign_media").delete().eq("id", mediaId)
    } catch {
      // Best-effort rollback cleanup.
    }
    try {
      await storage.remove([path])
    } catch {
      // Best-effort rollback cleanup.
    }
  }

  // Optimistic compare-and-swap on cover_media_id so overlapping uploads swap
  // atomically and each winner deletes only the exact cover row it replaced
  // (never an uncommitted sibling or a newer upload, which ON DELETE SET NULL
  // would clobber).
  let current = campaign
  let prevCoverId = current.cover_media_id
  let swapped = false
  let contended = false

  for (let attempt = 0; attempt < 3; attempt++) {
    const query = dbAs(session.accessToken).from("campaigns").update({ cover_media_id: mediaId }).eq("id", current.id)
    const updated = await (
      prevCoverId === null ? query.is("cover_media_id", null) : query.eq("cover_media_id", prevCoverId)
    ).select("id")

    if (updated.error) {
      await rollbackNewCover()
      return fail(dbErrorMessage(updated.error))
    }
    if (updated.data?.length) {
      swapped = true
      break
    }
    if (attempt === 2) break

    const reloaded = await ownedCampaign(session, current.id)
    if (!reloaded.campaign) {
      await rollbackNewCover()
      return fail(reloaded.error)
    }
    if (!isEditableStatus(reloaded.campaign.status)) {
      await rollbackNewCover()
      return fail(NOT_EDITABLE)
    }
    if (reloaded.campaign.cover_media_id === prevCoverId) break
    contended = true
    current = reloaded.campaign
    prevCoverId = current.cover_media_id
  }

  if (!swapped) {
    await rollbackNewCover()
    return fail(contended ? "Không cập nhật được ảnh bìa do có thay đổi đồng thời. Hãy thử lại." : NOT_EDITABLE)
  }

  if (prevCoverId !== null) {
    try {
      const stale = await service
        .from("campaign_media")
        .delete()
        .eq("id", prevCoverId)
        .eq("campaign_id", current.id)
        .select("storage_path")
      const stalePaths = ((stale.data ?? []) as { storage_path: string | null }[])
        .map((row) => row.storage_path)
        .filter((p): p is string => Boolean(p))
      if (stalePaths.length > 0) await storage.remove(stalePaths)
    } catch (error) {
      console.error("uploadCover cleanup failed", error)
    }
  }

  refresh(current)
  return done("Đã cập nhật ảnh bìa.")
}

async function transition(
  session: Session,
  campaign: OwnedCampaign,
  toStatus: CampaignStatus,
  reason?: string | null,
  messages?: Record<string, string>
): Promise<ActionResult | null> {
  const { error } = await dbAs(session.accessToken).rpc("transition_campaign", {
    p_campaign_id: campaign.id,
    p_to_status: toStatus,
    p_reason: reason ?? null,
  })
  return error ? fail(dbErrorMessage(error, messages)) : null
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
  // Every campaign needs a usable bound account before review (give: DOS/Give#32,
  // back: DOS/Give#85); give.transition_campaign re-checks it under its locks.
  let problem
  try {
    problem = await checkSubmitAccount(
      dbAs(session.accessToken),
      campaign.id,
      session.user.id,
      campaign.type,
      campaign.status
    )
  } catch (error) {
    return fail(dbErrorMessage(error as { message?: string; code?: string }))
  }
  if (problem) return fail(problem)
  const failed = await transition(session, campaign, "in_review", null, SUBMIT_MESSAGES)
  if (failed) return failed
  refresh(campaign)
  revalidatePath("/admin")
  return done("Đã gửi duyệt. Kiểm duyệt viên sẽ xem chiến dịch của bạn.")
}

export async function cancelCampaign(campaignId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const { campaign, error: loadError } = await ownedCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  const reason =
    String(form.get("reason") ?? "")
      .trim()
      .slice(0, 500) || null
  const failed = await transition(session, campaign, "cancelled", reason, CANCEL_MESSAGES)
  if (failed) return failed
  refresh(campaign)
  revalidatePath("/admin")
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
  try {
    const storage = dbService().storage.from(MEDIA_BUCKET)
    const prefix = campaignMediaPrefix(campaign.id)
    const listed = await storage.list(prefix, { limit: 1000 })
    const paths = (listed.data ?? []).map((object) => `${prefix}/${object.name}`)
    if (paths.length) await storage.remove(paths)
  } catch (error) {
    console.error("deleteDraft cleanup failed", error)
  }

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
