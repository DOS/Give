"use server"

import { revalidatePath } from "next/cache"

import {
  bindingHasTransactions,
  canAskSwap,
  listCampaignSwaps,
  pendingSwap,
  SWAP_REASON_MAX,
} from "@/lib/account-swaps"
import { getSession } from "@/lib/auth/session"
import { getCampaignById, getOrganizer } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { accountUnusableReason, activeBinding, activeBindingsOfCampaign, getAccount } from "@/lib/receiving-accounts"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * The organizer's side of an account swap (DOS/Give#55): ask finance to
 * replace the receiving account of a give campaign that may hold money, or
 * withdraw the request while it waits.
 *
 * Like the other money actions (app/me/accounts/actions.ts), the RPCs run as
 * the service role and trust the actor id passed in, so every action first
 * reads with the user's own token, which PostgREST verifies, and stops on any
 * error. The database repeats every check under its locks.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

/** The organizer has nothing to swap: the campaign holds no account. */
const NO_BINDING = "Chiến dịch chưa gắn tài khoản nhận nào, nên không có gì để đổi. Hãy gắn tài khoản."

export async function requestAccountSwap(
  campaignId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(campaignId)) return fail(dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" }))
  const accountId = String(form.get("account_id") ?? "")
  if (!isUuid(accountId)) return fail("Chọn tài khoản mới.")
  const reason = String(form.get("reason") ?? "").trim()
  if (!reason) return fail("Ghi lý do tài khoản cũ không dùng được nữa (ví dụ: ngân hàng đã đóng tài khoản).")
  if (reason.length > SWAP_REASON_MAX) return fail(`Lý do tối đa ${SWAP_REASON_MAX} ký tự.`)

  const db = dbAs(session.accessToken)
  let campaign, account, bindings, organizer, requests
  try {
    ;[campaign, account, bindings, organizer, requests] = await Promise.all([
      getCampaignById(db, campaignId),
      getAccount(db, accountId),
      activeBindingsOfCampaign(db, campaignId),
      getOrganizer(db, session.user.id),
      listCampaignSwaps(db, campaignId),
    ])
  } catch (error) {
    return fail(dbErrorMessage(error as { message?: string; code?: string }))
  }
  // Staff can read every campaign and account; the request is the owner's alone.
  if (!campaign || campaign.organizer_id !== session.user.id) {
    return fail(dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" }))
  }
  if (!account || account.owner_user_id !== session.user.id) {
    return fail(dbErrorMessage({ message: "GIVE_ACCOUNT_NOT_FOUND" }))
  }
  const bound = bindings[0]
  if (!bound) return fail(NO_BINDING)
  if (bound.receiving_account_id === account.id) return fail(dbErrorMessage({ message: "GIVE_SWAP_SAME_ACCOUNT" }))
  let hasTransactions
  try {
    hasTransactions = await bindingHasTransactions(db, bound.id)
  } catch (error) {
    return fail(dbErrorMessage(error as { message?: string; code?: string }))
  }
  if (!canAskSwap(campaign.status, campaign.type, hasTransactions)) {
    return fail(
      dbErrorMessage({
        message:
          campaign.status === "changes_requested" && campaign.type === "give"
            ? "GIVE_SWAP_USE_RELEASE"
            : "GIVE_SWAP_NOT_ALLOWED",
      })
    )
  }
  if (pendingSwap(requests)) return fail(dbErrorMessage({ message: "GIVE_SWAP_ALREADY_PENDING" }))
  const unusable = accountUnusableReason(account, organizer)
  if (unusable) return fail(`Tài khoản mới chưa dùng được: ${unusable}`)
  if (activeBinding(account)) return fail(dbErrorMessage({ message: "GIVE_ACCOUNT_ALREADY_BOUND" }))

  const { error } = await dbService().rpc("request_account_swap", {
    p_campaign_id: campaign.id,
    p_new_receiving_account_id: account.id,
    p_actor_id: session.user.id,
    p_reason: reason,
  })
  if (error) return fail(dbErrorMessage(error, { GIVE_BINDING_NOT_FOUND: NO_BINDING }))

  revalidatePath(`/me/campaigns/${campaign.id}`)
  revalidatePath("/admin/account-swaps")
  return done(
    "Đã gửi yêu cầu đổi tài khoản. Bộ phận tài chính sẽ xem xét; trong lúc chờ, chiến dịch vẫn dùng tài khoản đang gắn."
  )
}

export async function cancelAccountSwap(
  requestId: string,
  campaignId: string,
  _state: ActionResult,
  _form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(requestId) || !isUuid(campaignId)) return fail(dbErrorMessage({ message: "GIVE_SWAP_NOT_FOUND" }))

  const db = dbAs(session.accessToken)
  let campaign, requests
  try {
    ;[campaign, requests] = await Promise.all([getCampaignById(db, campaignId), listCampaignSwaps(db, campaignId)])
  } catch (error) {
    return fail(dbErrorMessage(error as { message?: string; code?: string }))
  }
  if (!campaign || campaign.organizer_id !== session.user.id || !requests.some((r) => r.id === requestId)) {
    return fail(dbErrorMessage({ message: "GIVE_SWAP_NOT_FOUND" }))
  }

  const { error } = await dbService().rpc("cancel_account_swap", {
    p_request_id: requestId,
    p_actor_id: session.user.id,
  })
  if (error) return fail(dbErrorMessage(error))

  revalidatePath(`/me/campaigns/${campaign.id}`)
  revalidatePath("/admin/account-swaps")
  return done("Đã rút yêu cầu đổi tài khoản.")
}
