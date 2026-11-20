"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { dbErrorMessage, done, fail, PLAN_MESSAGES, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { periodLabel, planUpdateSchema } from "@/lib/plans"
import { dbAs, dbService } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * A donor changes or stops their monthly plan (DOS/Give#276). The plan
 * functions run as the service role with the donor's id as an argument.
 * getSession() decodes the cookie without verifying it, so the plan is first
 * read with the donor's own token: PostgREST verifies the token and RLS
 * returns only the donor's own plans, proving both the user and the plan
 * before the service-role call runs.
 */

const SESSION_EXPIRED = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_FOUND = PLAN_MESSAGES.GIVE_PLAN_NOT_FOUND

interface OwnPlan {
  id: string
  status: string
}

type Proven = { ok: true; userId: string; plan: OwnPlan } | { ok: false; result: ActionResult }

async function proveOwnPlan(planId: string): Promise<Proven> {
  const session = await getSession()
  if (!session) return { ok: false, result: fail(SESSION_EXPIRED) }
  if (!isUuid(planId)) return { ok: false, result: fail(NOT_FOUND) }
  const { data, error } = await dbAs(session.accessToken)
    .from("donation_plans")
    .select("id, status")
    .eq("id", planId)
    .eq("contributor_user_id", session.user.id)
    .maybeSingle()
  if (error) {
    return {
      ok: false,
      result: fail(error.code?.startsWith("PGRST30") ? SESSION_EXPIRED : dbErrorMessage(error, PLAN_MESSAGES)),
    }
  }
  if (!data) return { ok: false, result: fail(NOT_FOUND) }
  return { ok: true, userId: session.user.id, plan: data as OwnPlan }
}

/** New amount and day, from the next donation the plan issues on. */
export async function updatePlan(planId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = planUpdateSchema.safeParse(formFields(form, ["amount", "day_of_month"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const proven = await proveOwnPlan(planId)
  if (!proven.ok) return proven.result
  if (proven.plan.status !== "active") return fail(PLAN_MESSAGES.GIVE_PLAN_ENDED)

  const { data, error } = await dbService()
    .rpc("update_donation_plan", {
      p_plan_id: planId,
      p_user_id: proven.userId,
      p_amount: parsed.data.amount,
      p_day_of_month: parsed.data.day_of_month,
    })
    .select("plan_id, amount, day_of_month, next_period")
    .single()
  if (error) return fail(dbErrorMessage(error, PLAN_MESSAGES))
  const nextPeriod = (data as { next_period?: string } | null)?.next_period

  revalidatePath("/me/contributions")
  return done(
    nextPeriod
      ? `Đã lưu. Số tiền và ngày mới áp dụng từ mã ủng hộ tháng ${periodLabel(nextPeriod)}; mã đã tạo giữ nguyên.`
      : "Đã lưu. Số tiền và ngày mới áp dụng từ mã ủng hộ tiếp theo; mã đã tạo giữ nguyên."
  )
}

/** Stops the plan; this month's donation stays valid. */
export async function cancelPlan(planId: string, _state: ActionResult, _form: FormData): Promise<ActionResult> {
  const proven = await proveOwnPlan(planId)
  if (!proven.ok) return proven.result
  if (proven.plan.status !== "active") return done("Kế hoạch này đã dừng.")

  const { error } = await dbService().rpc("cancel_donation_plan", { p_plan_id: planId, p_user_id: proven.userId })
  if (error) return fail(dbErrorMessage(error, PLAN_MESSAGES))

  revalidatePath("/me/contributions")
  return done("Đã dừng ủng hộ hằng tháng. Mã ủng hộ đã có của tháng này vẫn dùng được nếu bạn muốn chuyển khoản.")
}
