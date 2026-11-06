"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { getCampaignById } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import {
  canUpdateFulfillment,
  FULFILLMENT_BATCH_MAX,
  FULFILLMENT_LABELS,
  FULFILLMENT_NOTE_MAX,
  isFulfillmentStatus,
} from "@/lib/fulfillment"
import { isUuid } from "@/lib/ids"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * The creator reports delivery of rewards (DOS/Give#83): one pledge or a
 * selection of up to 500, with one status and note.
 *
 * give.set_pledge_fulfillment runs as the service role and trusts the actor
 * id passed in, so the campaign is first read with the user's own token
 * (PostgREST verifies it). The database checks, under the campaign lock,
 * that every pledge is a paid pledge of this succeeded campaign.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

export async function setFulfillment(campaignId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const notFound = dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" })
  if (!isUuid(campaignId)) return fail(notFound)

  // A row's own button sends just that pledge; otherwise the ticked ones.
  const only = form.get("only")
  const ids = [...new Set(only ? [String(only)] : form.getAll("contribution_id").map(String))]
  if (ids.length === 0) return fail("Chọn ít nhất một lượt ủng hộ.")
  if (ids.length > FULFILLMENT_BATCH_MAX) return fail(dbErrorMessage({ message: "GIVE_FULFILLMENT_BATCH_INVALID" }))
  if (!ids.every(isUuid)) return fail(dbErrorMessage({ message: "GIVE_PLEDGE_NOT_FULFILLABLE" }))
  // Each row has its own status and note fields, named after the pledge.
  const suffix = only ? `_${ids[0]}` : ""
  const status = form.get(`status${suffix}`)
  if (!isFulfillmentStatus(status)) return fail(dbErrorMessage({ message: "GIVE_FULFILLMENT_STATUS_INVALID" }))
  const note = String(form.get(`note${suffix}`) ?? "").trim()
  if (note.length > FULFILLMENT_NOTE_MAX) return fail(dbErrorMessage({ message: "GIVE_FULFILLMENT_NOTE_TOO_LONG" }))

  let campaign
  try {
    campaign = await getCampaignById(dbAs(session.accessToken), campaignId)
  } catch (error) {
    return fail(dbErrorMessage(error as DbErrorLike))
  }
  if (!campaign || campaign.organizer_id !== session.user.id) return fail(notFound)
  if (!canUpdateFulfillment(campaign)) return fail(dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FULFILLING" }))

  const { data, error } = await dbService().rpc("set_pledge_fulfillment", {
    p_actor_id: session.user.id,
    p_campaign_id: campaign.id,
    p_contribution_ids: ids,
    p_status: status,
    p_note: note || null,
  })
  if (error) return fail(dbErrorMessage(error))

  revalidatePath(`/me/campaigns/${campaign.id}/fulfillment`)
  revalidatePath("/me/contributions")
  const n = typeof data === "number" ? data : ids.length
  return done(`Đã cập nhật ${n} lượt ủng hộ: ${FULFILLMENT_LABELS[status]}.`)
}
