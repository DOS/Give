"use server"

import { revalidatePath } from "next/cache"

import type { FollowActionState } from "@/components/FollowButton"
import { getSession } from "@/lib/auth/session"
import { dbErrorMessage } from "@/lib/errors"
import { followCampaign, getCampaignFollowerCount, unfollowCampaign } from "@/lib/follows"
import { isUuid } from "@/lib/ids"
import { SLUG_PATTERN } from "@/lib/slug"
import { dbAs } from "@/lib/supabase"

const SIGNED_OUT = "Hãy đăng nhập để theo dõi chiến dịch."
const INVALID_TARGET = "Không tìm thấy chiến dịch công khai để theo dõi."

/**
 * Toggles the signed-in user's follow on a publicly visible campaign
 * (live/ended or opted-in future pre-launch teaser; DOS/Give#315).
 * Runs strictly under the user's own JWT (RLS on `give.campaign_follows`).
 */
export async function toggleCampaignFollow(
  campaignId: string,
  slug: string,
  state: FollowActionState,
  form: FormData
): Promise<FollowActionState> {
  const session = await getSession()
  if (!session) return { ...state, error: SIGNED_OUT }
  if (!isUuid(campaignId)) return { ...state, error: INVALID_TARGET }

  const intent = String(form.get("intent") ?? "")
  if (intent !== "follow" && intent !== "unfollow") {
    return { ...state, error: "Thao tác không hợp lệ." }
  }

  const db = dbAs(session.accessToken)
  try {
    if (intent === "follow") {
      await followCampaign(db, session.user.id, campaignId)
    } else {
      await unfollowCampaign(db, session.user.id, campaignId)
    }
    const nextCount = await getCampaignFollowerCount(db, campaignId).catch(() =>
      Math.max(0, state.count + (intent === "follow" ? 1 : -1))
    )
    if (SLUG_PATTERN.test(slug) && slug.length <= 80) revalidatePath(`/campaigns/${slug}`)
    revalidatePath("/me/contributions")
    return { following: intent === "follow", count: nextCount }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string } | null
    if (err?.code?.startsWith("PGRST30")) {
      return { ...state, error: "Phiên đăng nhập đã hết. Hãy đăng nhập lại." }
    }
    return {
      ...state,
      error: err?.code === "42501" ? "Chiến dịch này hiện không mở công khai để theo dõi." : dbErrorMessage(err),
    }
  }
}
