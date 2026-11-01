import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"

export const dynamic = "force-dynamic"

/**
 * Vercel Cron (daily at 09:00 Vietnam time, see vercel.json): organizers of campaigns with outgoing
 * transactions that are not explained yet get an explain_spending notice
 * (design 5.3, DOS/Give#22). The RPC creates at most one per campaign per
 * Vietnam day, so a repeated or overlapping run creates nothing new.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { data, error } = await dbService().rpc("remind_unexplained_spending")
  if (error) {
    console.error("remind_unexplained_spending failed", error.code, error.message)
    return NextResponse.json({ error: "remind_failed" }, { status: 500 })
  }
  return NextResponse.json({ reminded: data as number })
}
