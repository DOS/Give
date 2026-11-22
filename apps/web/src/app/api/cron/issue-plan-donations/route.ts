import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"
import {
  expirePlanDonations,
  logPlanCronFailures,
  logPlanStepFailure,
  remainingBudget,
  sweepPlans,
  type PlanSweep,
} from "@/server/plans/jobs"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Vercel Cron (hourly, see vercel.json): monthly plans (DOS/Give#276, design
 * 4.3.4). give.issue_plan_donations issues this month's donation of each
 * plan whose day has come (one per plan and month, with one reminder), and
 * ends the plans of campaigns past their end date; a suspended campaign's
 * plans wait. Then give.expire_plan_donations marks past months' unpaid plan
 * donations 'expired' (listing only; money that arrives later still matches).
 * Both steps are isolated so a failure in one does not prevent the other from
 * running within the shared deadline; a run that stops early or is missed is
 * caught up by the next one, and past months are never issued late.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const db = dbService()
  const started = Date.now()
  let sweep: PlanSweep | null = null
  let sweepFailed = false
  try {
    sweep = await sweepPlans(db, "issue_plan_donations")
    logPlanCronFailures("issue-plan-donations", "issue_plan_donations", sweep)
  } catch (error: unknown) {
    sweepFailed = true
    logPlanStepFailure("issue-plan-donations", "issue_plan_donations", error)
  }

  // Both steps share one deadline; past it the expiry waits for the next run.
  const budgetLeft = remainingBudget(started)
  const expire = budgetLeft > 0 ? await expirePlanDonations(db, Date.now, budgetLeft) : null

  if (sweepFailed || !sweep || expire?.failed) {
    return NextResponse.json({ error: "issue_failed" }, { status: 500 })
  }
  return NextResponse.json({
    ...sweep.outcomes,
    done: sweep.done && expire !== null && expire.done,
    expired: expire ? expire.expired : null,
    ...(expire?.stalled ? { expire_stalled: true } : {}),
  })
}
