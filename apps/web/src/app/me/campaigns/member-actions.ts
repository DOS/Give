"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import {
  createInviteSchema,
  invitePath,
  normalizeInviteToken,
  type CreatedCampaignInvite,
} from "@/lib/campaign-members"
import { CAMPAIGN_MEMBER_MESSAGES, campaignMemberDbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { SLUG_PATTERN } from "@/lib/slug"
import { dbAs } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * Owner-only co-organizer invite & team management actions (DOS/Give#253, #264).
 *
 * Every RPC runs via `dbAs(session.accessToken)` so the database derives
 * `auth.uid()` directly from the verified JWT and enforces campaign ownership.
 * Never uses `dbService()` and never logs raw invite tokens.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

export type CreateInviteResult = {
  ok: boolean
  message: string
  invite?: {
    inviteId: string
    path: string
    expiresAt: string
  }
} | null

function revalidateCampaign(campaignId: string, slug?: string | null) {
  revalidatePath(`/me/campaigns/${campaignId}`)
  revalidatePath("/me/campaigns")
  if (slug && SLUG_PATTERN.test(slug) && slug.length <= 80) {
    revalidatePath(`/campaigns/${slug}`)
  } else {
    revalidatePath("/campaigns/[slug]", "page")
  }
}

/** Creates a single-use expiring co-organizer invite link (owner-only). */
export async function createCampaignInvite(
  campaignId: string,
  _state: CreateInviteResult,
  form: FormData
): Promise<CreateInviteResult> {
  const session = await getSession()
  if (!session) return { ok: false, message: SIGNED_OUT }
  if (!isUuid(campaignId)) return { ok: false, message: CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_OWNER_ONLY }

  const parsed = createInviteSchema.safeParse(formFields(form, ["expires_in_hours", "note"]))
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }

  const { data, error } = await dbAs(session.accessToken).rpc("create_campaign_member_invite", {
    p_campaign_id: campaignId,
    p_expires_in_hours: parsed.data.expires_in_hours,
    p_note: parsed.data.note,
  })
  if (error) return { ok: false, message: campaignMemberDbErrorMessage(error) }

  const rows = Array.isArray(data) ? data : data ? [data] : []
  const created = rows[0] as CreatedCampaignInvite | undefined
  const normalizedToken = normalizeInviteToken(created?.token)
  if (!created || !isUuid(created.invite_id) || !normalizedToken || !created.expires_at) {
    return { ok: false, message: "Chưa tạo được liên kết mời. Hãy thử lại." }
  }

  revalidatePath(`/me/campaigns/${campaignId}`)
  return {
    ok: true,
    message: "Đã tạo liên kết mời. Hãy sao chép và gửi ngay — liên kết này chỉ hiện một lần duy nhất.",
    invite: {
      inviteId: created.invite_id,
      path: invitePath(normalizedToken),
      expiresAt: created.expires_at,
    },
  }
}

/** Revokes a pending co-organizer invite (owner-only, idempotent). */
export async function revokeCampaignInvite(
  campaignId: string,
  inviteId: string,
  _state: ActionResult = null,
  _form?: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(campaignId) || !isUuid(inviteId)) {
    return fail(CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_OWNER_ONLY)
  }

  const { error } = await dbAs(session.accessToken).rpc("revoke_campaign_member_invite", {
    p_invite_id: inviteId,
  })
  if (error) return fail(campaignMemberDbErrorMessage(error))

  revalidatePath(`/me/campaigns/${campaignId}`)
  return done("Đã thu hồi liên kết mời.")
}

/** Removes an accepted co-organizer immediately revoking editor permissions (owner-only). */
export async function removeCampaignMember(
  campaignId: string,
  userId: string,
  slug: string | null = null,
  _state: ActionResult = null,
  _form?: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(campaignId) || !isUuid(userId)) {
    return fail(CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_MEMBER_NOT_FOUND)
  }

  const { error } = await dbAs(session.accessToken).rpc("remove_campaign_member", {
    p_campaign_id: campaignId,
    p_user_id: userId,
  })
  if (error) return fail(campaignMemberDbErrorMessage(error))

  revalidateCampaign(campaignId, slug)
  return done("Đã gỡ đồng tổ chức khỏi chiến dịch.")
}
