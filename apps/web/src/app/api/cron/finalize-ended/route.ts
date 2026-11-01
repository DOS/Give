import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"

export const dynamic = "force-dynamic"

/**
 * Vercel Cron (every 5 minutes, see vercel.json): live give campaigns whose
 * end time has passed close. The RPC is idempotent (a closed campaign is not
 * picked again) and skips rows another run has locked.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { data, error } = await dbService().rpc("finalize_ended_campaigns")
  if (error) {
    console.error("finalize_ended_campaigns failed", error.code, error.message)
    return NextResponse.json({ error: "finalize_failed" }, { status: 500 })
  }
  return NextResponse.json({ finalized: data as number })
}
