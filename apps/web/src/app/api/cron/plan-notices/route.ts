import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"
import { remainingBudget, sweepPlans } from "@/server/plans/jobs"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Vercel Cron (every 10 minutes, see vercel.json): monthly plan notices
 * (DOS/Give#276, design 4.3.4). give.plan_end_notices tells each donor once
 * that their plan ended, whatever ended it (the donor, the stop link, the
 * campaign closing or being cancelled, the organizer turning monthly giving
 * off, the end date); give.plan_followups sends the second reminder where
 * the campaign's account allows it (none until the Tingee channel lands).
 * Both write in-app notices that the outbox turns into emails, exactly once
 * each, however often this runs.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const db = dbService()
  const started = Date.now()
  try {
    // Both sweeps share one deadline, so the run ends inside maxDuration.
    const ended = await sweepPlans(db, "plan_end_notices")
    const followups = await sweepPlans(db, "plan_followups", Date.now, remainingBudget(started))
    return NextResponse.json({
      ended: ended.outcomes,
      followups: followups.outcomes,
      done: ended.done && followups.done,
    })
  } catch {
    return NextResponse.json({ error: "notices_failed" }, { status: 500 })
  }
}
