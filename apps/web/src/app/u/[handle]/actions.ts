"use server"

import { revalidatePath } from "next/cache"

import type { FollowActionState } from "@/components/FollowButton"
import { getSession } from "@/lib/auth/session"
import { dbErrorMessage } from "@/lib/errors"
import { followOrganizerByHandle, getOrganizerFollowerCountByHandle, unfollowOrganizerByHandle } from "@/lib/follows"
import {
  isReservedOrganizerHandle,
  isValidOrganizerHandleFormat,
  normalizeOrganizerHandle,
  organizerProfileHref,
} from "@/lib/organizer-handle"
import { dbAs } from "@/lib/supabase"

const SIGNED_OUT = "Hãy đăng nhập để theo dõi người tổ chức."
const INVALID_TARGET = "Không tìm thấy hồ sơ người tổ chức công khai."

/**
 * Toggles the signed-in user's follow on a public organizer profile strictly
 * by public handle (DOS/Give#315). Never receives, queries, or returns
 * organizer `user_id`.
 */
export async function toggleOrganizerFollow(
  rawHandle: string,
  state: FollowActionState,
  form: FormData
): Promise<FollowActionState> {
  const session = await getSession()
  if (!session) return { ...state, error: SIGNED_OUT }

  const handle = normalizeOrganizerHandle(rawHandle)
  if (!isValidOrganizerHandleFormat(handle) || isReservedOrganizerHandle(handle)) {
    return { ...state, error: INVALID_TARGET }
  }

  const intent = String(form.get("intent") ?? "")
  if (intent !== "follow" && intent !== "unfollow") {
    return { ...state, error: "Thao tác không hợp lệ." }
  }

  const db = dbAs(session.accessToken)
  try {
    if (intent === "follow") {
      await followOrganizerByHandle(db, handle)
    } else {
      await unfollowOrganizerByHandle(db, handle)
    }
    const nextCount = await getOrganizerFollowerCountByHandle(db, handle).catch(() =>
      Math.max(0, state.count + (intent === "follow" ? 1 : -1))
    )
    revalidatePath(organizerProfileHref(handle))
    revalidatePath("/me/contributions")
    revalidatePath("/me/following")
    return { following: intent === "follow", count: nextCount }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string } | null
    if (err?.code?.startsWith("PGRST30")) {
      return { ...state, error: "Phiên đăng nhập đã hết. Hãy đăng nhập lại." }
    }
    return { ...state, error: dbErrorMessage(err) }
  }
}
