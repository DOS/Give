"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getSession } from "@/lib/auth/session"
import { dbErrorMessage, fail, PLAN_MESSAGES, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { planSignupSchema } from "@/lib/plans"
import { dbAs, dbService } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * A signed-in donor starts giving every month to a give campaign that allows
 * it (DOS/Give#276, design 4.3.4). give.create_donation_plan runs as the
 * service role with the donor's id as an argument and issues this month's
 * donation at once. getSession() decodes the cookie without verifying it, so
 * the campaign is first read with the donor's own token: PostgREST verifies
 * that token, proving the user id, before the service-role call runs.
 */

const SESSION_EXPIRED = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_ACCEPTING = PLAN_MESSAGES.GIVE_CAMPAIGN_NOT_ACCEPTING

interface CreatedPlan {
  plan_id: string
  contribution_id: string
  reference_code: string
  plan_period: string
  next_period: string
  reused: boolean
}

export async function startMonthlyPlan(
  campaignId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(PLAN_MESSAGES.GIVE_SIGN_IN_REQUIRED)
  if (!isUuid(campaignId)) return fail(NOT_ACCEPTING)

  const parsed = planSignupSchema.safeParse(
    formFields(form, ["amount", "day_of_month", "anonymous", "public_name", "message", "consent"])
  )
  if (!parsed.success) return fail(firstError(parsed.error))
  const input = parsed.data

  const visible = await dbAs(session.accessToken)
    .from("campaigns")
    .select("id, status")
    .eq("id", campaignId)
    .maybeSingle()
  if (visible.error) {
    return fail(
      visible.error.code?.startsWith("PGRST30") ? SESSION_EXPIRED : dbErrorMessage(visible.error, PLAN_MESSAGES)
    )
  }
  if (!visible.data || (visible.data as { status?: string }).status !== "live") return fail(NOT_ACCEPTING)

  const { data, error } = await dbService()
    .rpc("create_donation_plan", {
      p_campaign_id: campaignId,
      p_user_id: session.user.id,
      p_amount: input.amount,
      p_day_of_month: input.day_of_month,
      p_reminder_consent: input.consent === "on",
      p_is_anonymous: input.anonymous,
      p_public_name: input.public_name,
      p_message: input.message,
    })
    .select("plan_id, contribution_id, reference_code, plan_period, next_period, reused")
    .single()
  if (error) return fail(dbErrorMessage(error, PLAN_MESSAGES))
  const created = data as CreatedPlan

  revalidatePath("/me/contributions")
  // Signed up again in the month a cancelled plan already had a donation for:
  // that donation stands, so the donor goes to the overview instead.
  redirect(created.reused ? "/me/contributions" : `/donations/${created.reference_code}`)
}
