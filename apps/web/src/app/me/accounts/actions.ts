"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { getCampaignById, getOrganizer } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import {
  accountNameMatches,
  activeBinding,
  activeBindingsOfCampaign,
  getAccount,
  isBindableStatus,
  REGISTER_CHANNEL,
  registerAccountSchema,
} from "@/lib/receiving-accounts"
import { dbAs, dbService } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * Organizer actions on receiving accounts.
 *
 * The money RPCs run as the service role and take the acting user's id as an
 * argument, so they trust whatever id this file passes. The session user is
 * decoded from the cookie WITHOUT verification (lib/auth/token.ts), so every
 * action first reads with the user's own token and stops on any error:
 * PostgREST verifies that token, which proves the decoded id is genuine.
 * Those reads also give the person a clear message before the RPC, which
 * re-checks everything under its locks.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

/** Declares a bank account for receiving money; the page then shows its verification code. */
export async function registerAccount(_state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const parsed = registerAccountSchema.safeParse(
    formFields(form, ["bank_bin", "account_number", "account_name", "account_kind", "public_statement_url"])
  )
  if (!parsed.success) return fail(firstError(parsed.error))
  const input = parsed.data

  let organizer
  try {
    organizer = await getOrganizer(dbAs(session.accessToken), session.user.id)
  } catch (error) {
    return fail(dbErrorMessage(error as { message?: string; code?: string }))
  }
  if (!organizer) return fail("Hãy tạo hồ sơ người tổ chức trước khi khai báo tài khoản nhận.")
  if (!accountNameMatches(input.account_name, organizer.legal_name)) {
    return fail(
      `Tên chủ tài khoản phải trùng với tên pháp lý "${organizer.legal_name}" trong hồ sơ người tổ chức (không phân biệt dấu và hoa thường).`
    )
  }

  const { error } = await dbService().rpc("register_receiving_account", {
    p_owner_user_id: session.user.id,
    p_channel: REGISTER_CHANNEL,
    p_bank_bin: input.bank_bin,
    p_account_number: input.account_number,
    p_account_name: input.account_name,
    p_account_kind: input.account_kind,
    p_public_statement_url: input.public_statement_url,
  })
  if (error) return fail(dbErrorMessage(error))

  revalidatePath("/me/accounts")
  revalidatePath("/admin/accounts")
  return done("Đã khai báo tài khoản. Làm theo hướng dẫn chuyển khoản xác minh bên dưới.")
}

/**
 * Binds one of the organizer's verified accounts to one of their campaigns.
 * The campaign id comes from the form, so the campaign editor (DOS/Give#32)
 * can post the same field.
 */
export async function bindAccount(accountId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const campaignId = String(form.get("campaign_id") ?? "")
  if (!isUuid(accountId)) return fail(dbErrorMessage({ message: "GIVE_ACCOUNT_NOT_FOUND" }))
  if (!isUuid(campaignId)) return fail("Chọn chiến dịch để gắn tài khoản.")

  const db = dbAs(session.accessToken)
  let account, campaign, campaignBindings
  try {
    ;[account, campaign, campaignBindings] = await Promise.all([
      getAccount(db, accountId),
      getCampaignById(db, campaignId),
      activeBindingsOfCampaign(db, campaignId),
    ])
  } catch (error) {
    return fail(dbErrorMessage(error as { message?: string; code?: string }))
  }
  // Staff can read every account and campaign; binding is the owner's alone.
  if (!account || account.owner_user_id !== session.user.id) {
    return fail(dbErrorMessage({ message: "GIVE_ACCOUNT_NOT_FOUND" }))
  }
  if (!campaign || campaign.organizer_id !== session.user.id) {
    return fail(dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" }))
  }
  if (account.verification_status !== "verified") return fail(dbErrorMessage({ message: "GIVE_ACCOUNT_NOT_VERIFIED" }))
  if (!isBindableStatus(campaign.status)) return fail(dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_BINDABLE" }))
  const holder = activeBinding(account)
  if (holder && holder.campaign_id !== campaign.id) {
    return fail(dbErrorMessage({ message: "GIVE_ACCOUNT_ALREADY_BOUND" }))
  }
  // The database allows several accounts on one campaign; one is enough to
  // receive, and a second would split the statement across accounts.
  if (campaignBindings.some((b) => b.receiving_account_id !== account.id)) {
    return fail("Chiến dịch này đã có tài khoản nhận khác.")
  }

  const { error } = await dbService().rpc("bind_receiving_account", {
    p_receiving_account_id: account.id,
    p_campaign_id: campaign.id,
    p_actor_id: session.user.id,
  })
  if (error) return fail(dbErrorMessage(error))

  revalidatePath("/me/accounts")
  revalidatePath(`/me/campaigns/${campaign.id}`)
  return done(`Đã gắn tài khoản với chiến dịch "${campaign.title}".`)
}
