"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getSession } from "@/lib/auth/session"
import { normalizeInviteToken, type AcceptedCampaignInvite } from "@/lib/campaign-members"
import { CAMPAIGN_MEMBER_MESSAGES, campaignMemberDbErrorMessage, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { SLUG_PATTERN } from "@/lib/slug"
import { dbAs } from "@/lib/supabase"

/**
 * Accepts a single-use co-organizer invite while signed in (DOS/Give#253, #264).
 *
 * Calls `give.accept_campaign_member_invite` strictly via `dbAs(session.accessToken)`
 * so the database derives `auth.uid()` from the verified JWT. Never uses `dbService()`
 * and never logs the raw token.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại để chấp nhận lời mời."

export async function acceptCampaignInvite(
  token: string,
  _state: ActionResult = null,
  _form?: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)

  const normalized = normalizeInviteToken(token)
  if (!normalized) return fail(CAMPAIGN_MEMBER_MESSAGES.GIVE_INVITE_INVALID)

  const { data, error } = await dbAs(session.accessToken).rpc("accept_campaign_member_invite", {
    p_token: normalized,
  })
  if (error) return fail(campaignMemberDbErrorMessage(error))

  const rows = Array.isArray(data) ? data : data ? [data] : []
  const accepted = rows[0] as AcceptedCampaignInvite | undefined
  if (!accepted || !isUuid(accepted.campaign_id)) {
    return fail("Chưa hoàn tất chấp nhận lời mời. Hãy thử lại.")
  }

  revalidatePath("/me/campaigns")
  revalidatePath(`/me/campaigns/${accepted.campaign_id}`)
  if (accepted.campaign_slug && SLUG_PATTERN.test(accepted.campaign_slug) && accepted.campaign_slug.length <= 80) {
    revalidatePath(`/campaigns/${accepted.campaign_slug}`)
  } else {
    revalidatePath("/campaigns/[slug]", "page")
  }

  redirect(`/me/campaigns/${accepted.campaign_id}`)
}
