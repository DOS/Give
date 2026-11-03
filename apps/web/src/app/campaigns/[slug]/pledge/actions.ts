"use server"

import { redirect } from "next/navigation"

import { getSession } from "@/lib/auth/session"
import { dbErrorMessage, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { pledgeErrorMessage, pledgeSchema, PLEDGE_MESSAGES, shippingAddressSchema } from "@/lib/pledges"
import { dbAs, dbService } from "@/lib/supabase"
import { getPublicTier, ownPledgeById } from "@/server/pledges"

const NOT_ACCEPTING = PLEDGE_MESSAGES.GIVE_CAMPAIGN_NOT_ACCEPTING
const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

function rpcError(error: { code?: string; message?: string } | null): ActionResult {
  return fail(pledgeErrorMessage(error) ?? dbErrorMessage(error))
}

interface CreatedPledge {
  contribution_id: string
  reference_code: string
}

/**
 * Step 2 of section 4.2: the signed-in backer pledges to a live back
 * campaign (give.create_pledge) or, when `pledgeId` is their open pledge,
 * replaces it with this one (give.change_pledge, which cancels the old one in
 * the same transaction). Then opens the pledge's page. No money moves now:
 * the backer pays only once the campaign reaches its goal.
 */
export async function savePledge(
  campaignId: string,
  pledgeId: string | null,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  if (!isUuid(campaignId) || (pledgeId !== null && !isUuid(pledgeId))) return fail(NOT_ACCEPTING)
  const parsed = pledgeSchema.safeParse({
    tier: String(form.get("tier") ?? ""),
    amount: String(form.get("amount") ?? ""),
    anonymous: String(form.get("anonymous") ?? ""),
    public_name: String(form.get("public_name") ?? ""),
    message: String(form.get("message") ?? ""),
  })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ")
  const input = parsed.data

  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  // The pledge functions run as the service role and trust the user id they
  // are given. getSession() does not verify the token, so read with it first:
  // PostgREST rejects a forged or expired token there.
  const db = dbAs(session.accessToken)
  const { data: visible, error: readError } = await db.from("campaigns").select("id").eq("id", campaignId).maybeSingle()
  if (readError) return fail(dbErrorMessage(readError))
  if (!visible) return fail(NOT_ACCEPTING)

  // The address is asked for, and kept, only for a tier that ships something.
  let shipping: Record<string, string> | null = null
  if (input.tier) {
    const tier = await getPublicTier(db, campaignId, input.tier).catch(() => null)
    if (!tier) return fail(PLEDGE_MESSAGES.GIVE_REWARD_TIER_UNAVAILABLE)
    if (tier.requires_shipping) {
      const address = shippingAddressSchema.safeParse({
        recipient: String(form.get("ship_recipient") ?? ""),
        phone: String(form.get("ship_phone") ?? ""),
        address: String(form.get("ship_address") ?? ""),
      })
      if (!address.success)
        return fail(address.error.issues[0]?.message ?? PLEDGE_MESSAGES.GIVE_SHIPPING_ADDRESS_REQUIRED)
      shipping = address.data
    }
  }

  const fields = {
    p_user_id: session.user.id,
    p_amount: input.amount,
    p_reward_tier_id: input.tier,
    p_shipping_address: shipping,
    p_public_name: input.public_name,
    p_is_anonymous: input.anonymous,
    p_message: input.message,
  }
  const { data, error } = await (
    pledgeId
      ? dbService().rpc("change_pledge", { p_contribution_id: pledgeId, ...fields })
      : dbService().rpc("create_pledge", { p_campaign_id: campaignId, ...fields })
  )
    .select("contribution_id, reference_code")
    .single()
  if (error) return rpcError(error)
  redirect(`/me/pledges/${(data as CreatedPledge).reference_code}`)
}

/**
 * The backer cancels their open pledge (give.cancel_pledge), only while the
 * campaign is live and before ends_at. Replays of a cancelled pledge succeed.
 */
export async function cancelPledge(pledgeId: string, _state: ActionResult, _form: FormData): Promise<ActionResult> {
  if (!isUuid(pledgeId)) return fail(PLEDGE_MESSAGES.GIVE_PLEDGE_NOT_FOUND)
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  // Reading the pledge with the token proves it before the service-role call.
  let pledge
  try {
    pledge = await ownPledgeById(dbAs(session.accessToken), session.user.id, pledgeId)
  } catch (error) {
    return fail(dbErrorMessage(error as { code?: string; message?: string }))
  }
  if (!pledge) return fail(PLEDGE_MESSAGES.GIVE_PLEDGE_NOT_FOUND)

  const { error } = await dbService().rpc("cancel_pledge", { p_contribution_id: pledgeId, p_user_id: session.user.id })
  if (error) return rpcError(error)
  redirect(`/me/pledges/${pledge.reference_code}`)
}
