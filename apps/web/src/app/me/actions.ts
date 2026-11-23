"use server"

import { revalidatePath } from "next/cache"

import { getMyCampaignAmbassador, upsertMyCampaignAmbassador } from "@/lib/ambassadors"
import { getSession } from "@/lib/auth/session"
import { getOrganizer } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { isNavigableOrganizerHandle, organizerProfileHref } from "@/lib/organizer-handle"
import { publicProfileDbErrorMessage } from "@/lib/organizer-profile"
import { SLUG_PATTERN } from "@/lib/slug"
import { dbAs } from "@/lib/supabase"
import { firstError, formFields, organizerPublicProfileSchema } from "@/lib/validation"

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NO_ORGANIZER = "Hãy tạo hồ sơ người tổ chức trước khi thiết lập trang công khai."
const AMBASSADOR_LINK_NOT_FOUND = "Không tìm thấy liên kết đồng hành của bạn cho chiến dịch này."

export interface AmbassadorLeaderboardToggleState {
  showOnLeaderboard?: boolean
  message?: string
  error?: string
}

/**
 * Updates only the organizer's public profile fields (`handle` and `bio`).
 *
 * Never writes `legal_name`, `display_name`, `kind`, or verification columns,
 * so `give.organizers_reset_verification` leaves `verification_status` intact
 * (DOS/Give#251, #261).
 */
export async function updateOrganizerPublicProfile(_state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)

  const parsed = organizerPublicProfileSchema.safeParse(formFields(form, ["handle", "bio"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const db = dbAs(session.accessToken)
  let existing
  try {
    existing = await getOrganizer(db, session.user.id)
  } catch (error) {
    return fail(dbErrorMessage(error as DbErrorLike))
  }
  if (!existing) return fail(NO_ORGANIZER)

  const { error } = await db
    .from("organizers")
    .update({ handle: parsed.data.handle, bio: parsed.data.bio })
    .eq("user_id", session.user.id)
  if (error) return fail(publicProfileDbErrorMessage(error))

  revalidatePath("/me")
  revalidatePath("/start")
  revalidatePath("/")
  revalidatePath("/campaigns")
  revalidatePath("/campaigns/[slug]", "page")
  revalidatePath("/u/[handle]", "page")
  if (isNavigableOrganizerHandle(existing.handle)) {
    revalidatePath(organizerProfileHref(existing.handle))
  }
  if (parsed.data.handle && parsed.data.handle !== existing.handle) {
    revalidatePath(organizerProfileHref(parsed.data.handle))
  }

  return done(
    !parsed.data.handle && existing.handle ? "Đã lưu. Đường dẫn trang công khai đã được gỡ." : "Đã lưu hồ sơ công khai."
  )
}

/**
 * Toggles leaderboard visibility (`show_on_leaderboard`) for an existing
 * ambassador link from `/me` (DOS/Give#319, #331).
 *
 * Runs strictly under the caller's own JWT (`dbAs(session.accessToken)`) via
 * `give.get_my_campaign_ambassador` + `give.upsert_my_campaign_ambassador`
 * (zero `dbService()`). Preserves `display_name` from the database row and
 * works even after a campaign has ended.
 */
export async function toggleMyAmbassadorLeaderboard(
  state: AmbassadorLeaderboardToggleState,
  form: FormData
): Promise<AmbassadorLeaderboardToggleState> {
  const session = await getSession()
  if (!session) return { showOnLeaderboard: state.showOnLeaderboard, error: SIGNED_OUT }

  const campaignId = String(form.get("campaign_id") ?? "")
  const slug = String(form.get("campaign_slug") ?? "")
  const rawShow = String(form.get("show_on_leaderboard") ?? "")

  if (!isUuid(campaignId)) {
    return { showOnLeaderboard: state.showOnLeaderboard, error: AMBASSADOR_LINK_NOT_FOUND }
  }
  if (rawShow !== "true" && rawShow !== "false") {
    return { showOnLeaderboard: state.showOnLeaderboard, error: "Thao tác không hợp lệ." }
  }
  const nextShowOnLeaderboard = rawShow === "true"

  const db = dbAs(session.accessToken)
  let knownShowOnLeaderboard = state.showOnLeaderboard
  try {
    const existing = await getMyCampaignAmbassador(db, campaignId)
    if (!existing) {
      return { showOnLeaderboard: knownShowOnLeaderboard, error: AMBASSADOR_LINK_NOT_FOUND }
    }
    knownShowOnLeaderboard = existing.show_on_leaderboard

    const saved = await upsertMyCampaignAmbassador(db, {
      campaignId,
      displayName: existing.display_name,
      showOnLeaderboard: nextShowOnLeaderboard,
    })

    revalidatePath("/me")
    if (SLUG_PATTERN.test(slug) && slug.length <= 80) {
      revalidatePath(`/campaigns/${slug}`)
    }

    return {
      showOnLeaderboard: saved.show_on_leaderboard,
      message: saved.show_on_leaderboard
        ? "Đã hiện liên kết này trên bảng xếp hạng."
        : "Đã ẩn liên kết này khỏi bảng xếp hạng.",
    }
  } catch (error: unknown) {
    const err = error as DbErrorLike | null
    if (err?.code?.startsWith("PGRST30")) {
      return { showOnLeaderboard: knownShowOnLeaderboard, error: SIGNED_OUT }
    }
    return { showOnLeaderboard: knownShowOnLeaderboard, error: dbErrorMessage(err) }
  }
}
