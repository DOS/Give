import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { purgeUntilDone } from "@/server/email/purge"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Vercel Cron (daily, see vercel.json): email outbox retention
 * (DOS/Give#254). give.purge_outbox clears the address and payload of rows
 * whose account was deleted and of rows settled more than 30 days ago (the
 * row and its idempotency key stay), and deletes expired guest tracking
 * tokens. One call works for about 4 s (under the API's 8 s statement
 * timeout) and commits; the route calls again while it says there is more,
 * for up to PURGE_BUDGET_MS. A larger backlog clears over the next days.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  return purgeUntilDone(Date.now)
}
