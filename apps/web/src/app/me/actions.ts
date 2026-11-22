"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { getOrganizer } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { isNavigableOrganizerHandle, organizerProfileHref } from "@/lib/organizer-handle"
import { publicProfileDbErrorMessage } from "@/lib/organizer-profile"
import { dbAs } from "@/lib/supabase"
import { firstError, formFields, organizerPublicProfileSchema } from "@/lib/validation"

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NO_ORGANIZER = "Hãy tạo hồ sơ người tổ chức trước khi thiết lập trang công khai."

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
