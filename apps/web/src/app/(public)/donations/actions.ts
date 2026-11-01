"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { getSession } from "@/lib/auth/session"
import { donationSchema, isStatusToken } from "@/lib/contributions"
import { dbErrorMessage, fail, giveErrorCode, type ActionResult } from "@/lib/errors"
import { formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { dbAs, dbService } from "@/lib/supabase"
import { donationCookie } from "@/server/contributions"

const NOT_ACCEPTING = "Chiến dịch này hiện không nhận ủng hộ."

interface CreatedDonation {
  contribution_id: string
  reference_code: string
  status_token: string | null
  status_token_expires_at: string | null
}

/**
 * Step 5 of section 4.1: creates a donation awaiting its bank transfer and
 * opens its payment page. Anyone may donate; a signed-in donor's donation is
 * linked to their account, a guest gets a status token kept in a cookie for
 * that page.
 */
export async function donate(campaignId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  if (!isUuid(campaignId)) return fail(NOT_ACCEPTING)
  const parsed = donationSchema.safeParse({
    amount: String(form.get("amount") ?? ""),
    anonymous: String(form.get("anonymous") ?? ""),
    public_name: String(form.get("public_name") ?? ""),
    message: String(form.get("message") ?? ""),
  })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ")
  const input = parsed.data

  // create_donation runs as the service role and trusts the user id it is
  // given. getSession() does not verify the token, so read the campaign with
  // it first: PostgREST rejects a forged or expired token there.
  const session = await getSession()
  const { data: visible, error: readError } = await dbAs(session?.accessToken)
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .maybeSingle()
  if (readError) return fail(dbErrorMessage(readError))
  if (!visible) return fail(NOT_ACCEPTING)

  const { data, error } = await dbService()
    .rpc("create_donation", {
      p_campaign_id: campaignId,
      p_amount: input.amount,
      p_contributor_user_id: session?.user.id ?? null,
      p_public_name: input.public_name,
      p_is_anonymous: input.anonymous,
      p_message: input.message,
    })
    .select("contribution_id, reference_code, status_token, status_token_expires_at")
    .single()
  if (error) {
    if (giveErrorCode(error) === "GIVE_AMOUNT_BELOW_MINIMUM") {
      const min = Number(/GIVE_AMOUNT_BELOW_MINIMUM: (\d+)/.exec(error.message ?? "")?.[1])
      if (min > 0) return fail(`Số tiền ủng hộ tối thiểu là ${formatVnd(min)}.`)
    }
    return fail(dbErrorMessage(error))
  }
  const created = data as CreatedDonation

  if (!session) {
    if (!isStatusToken(created.status_token) || !created.status_token_expires_at) {
      return fail("Có lỗi xảy ra. Hãy thử lại sau.")
    }
    const hostname = ((await headers()).get("host") ?? "localhost").replace(/:\d+$/, "")
    const cookie = donationCookie(created.reference_code, hostname)
    ;(await cookies()).set(cookie.name, created.status_token, {
      ...cookie.options,
      expires: new Date(created.status_token_expires_at),
    })
  }
  redirect(`/donations/${created.reference_code}`)
}
