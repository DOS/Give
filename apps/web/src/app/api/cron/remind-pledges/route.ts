import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"

export const dynamic = "force-dynamic"

/**
 * Vercel Cron (hourly, see vercel.json): payment reminders on days 1, 3 and
 * 6 of a succeeded back campaign's payment window (section 4.2 step 5), as
 * in-app payment_reminder notices to backers who have not paid in full. The
 * RPC creates at most one per pledge and day and sends only the latest day
 * that has come, so a repeated or overlapping run creates nothing new and a
 * missed run is not sent late. Hourly keeps a reminder within an hour of its
 * day starting.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { data, error } = await dbService().rpc("remind_pledge_payments")
  if (error) {
    console.error("remind_pledge_payments failed", error.code, error.message)
    return NextResponse.json({ error: "remind_failed" }, { status: 500 })
  }
  if (typeof data !== "number") {
    console.error("remind_pledge_payments answered unexpectedly")
    return NextResponse.json({ error: "remind_failed" }, { status: 500 })
  }
  return NextResponse.json({ reminded: data })
}
