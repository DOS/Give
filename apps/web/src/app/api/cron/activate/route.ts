import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"

export const dynamic = "force-dynamic"

/**
 * Vercel Cron (every 5 minutes, see vercel.json): approved campaigns whose
 * start time has come go live. The RPC is idempotent and skips rows another
 * run has locked.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { data, error } = await dbService().rpc("activate_scheduled_campaigns")
  if (error) {
    console.error("activate_scheduled_campaigns failed", error.code, error.message)
    return NextResponse.json({ error: "activation_failed" }, { status: 500 })
  }
  return NextResponse.json({ activated: data as number })
}
