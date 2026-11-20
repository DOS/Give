import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"
import { expirePlanDonations, sweepPlans } from "@/server/plans/jobs"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Vercel Cron (hourly, see vercel.json): monthly plans (DOS/Give#276, design
 * 4.3.4). give.issue_plan_donations issues this month's donation of each
 * plan whose day has come (one per plan and month, with one reminder), and
 * ends the plans of campaigns past their end date; a suspended campaign's
 * plans wait. Then give.expire_plan_donations marks past months' unpaid plan
 * donations 'expired' (listing only; money that arrives later still matches).
 * A run that stops early, or a run missed, is caught up by the next one;
 * past months are never issued late.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const db = dbService()
  try {
    const sweep = await sweepPlans(db, "issue_plan_donations")
    const expired = await expirePlanDonations(db)
    return NextResponse.json({ ...sweep.outcomes, done: sweep.done, expired })
  } catch {
    return NextResponse.json({ error: "issue_failed" }, { status: 500 })
  }
}
