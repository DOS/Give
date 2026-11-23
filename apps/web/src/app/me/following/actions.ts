"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { unfollowCampaign, unfollowOrganizerByHandle } from "@/lib/follows"
import { isUuid } from "@/lib/ids"
import {
  isReservedOrganizerHandle,
  isValidOrganizerHandleFormat,
  normalizeOrganizerHandle,
  organizerProfileHref,
} from "@/lib/organizer-handle"
import { SLUG_PATTERN } from "@/lib/slug"
import { dbAs } from "@/lib/supabase"

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const INVALID_CAMPAIGN = "Không tìm thấy chiến dịch cần hủy theo dõi."
const INVALID_ORGANIZER = "Không tìm thấy hồ sơ người tổ chức công khai."

function formText(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === "string" ? value : ""
}

/**
 * Unfollows a campaign from `/me/following` under the signed-in user's own JWT (RLS).
 */
export async function unfollowFollowedCampaign(_state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)

  const campaignId = formText(form, "campaign_id").trim()
  const slug = formText(form, "campaign_slug").trim()
  if (!isUuid(campaignId)) return fail(INVALID_CAMPAIGN)

  const db = dbAs(session.accessToken)
  try {
    await unfollowCampaign(db, session.user.id, campaignId)
  } catch (error: unknown) {
    const err = error as DbErrorLike | null
    if (err?.code?.startsWith("PGRST30")) return fail(SIGNED_OUT)
    return fail(dbErrorMessage(err))
  }

  revalidatePath("/me/following")
  revalidatePath("/me/contributions")
  if (SLUG_PATTERN.test(slug) && slug.length <= 80) {
    revalidatePath(`/campaigns/${slug}`)
  }
  return done("Đã hủy theo dõi chiến dịch.")
}

/**
 * Unfollows an organizer from `/me/following` strictly by normalized public handle
 * (zero `organizer_id` or `user_id` exposure).
 */
export async function unfollowFollowedOrganizer(_state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)

  const handle = normalizeOrganizerHandle(formText(form, "handle"))
  if (!isValidOrganizerHandleFormat(handle) || isReservedOrganizerHandle(handle)) {
    return fail(INVALID_ORGANIZER)
  }

  const db = dbAs(session.accessToken)
  try {
    await unfollowOrganizerByHandle(db, handle)
  } catch (error: unknown) {
    const err = error as DbErrorLike | null
    if (err?.code?.startsWith("PGRST30")) return fail(SIGNED_OUT)
    return fail(dbErrorMessage(err))
  }

  revalidatePath("/me/following")
  revalidatePath("/me/contributions")
  revalidatePath(organizerProfileHref(handle))
  return done("Đã hủy theo dõi người tổ chức.")
}
