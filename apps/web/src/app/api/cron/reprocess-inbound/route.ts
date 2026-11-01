import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"
import { reprocessPendingInboundEvents } from "@/server/inbound"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Vercel Cron (every 5 minutes, see vercel.json): pending inbound events are
 * processed again by their channel's processor. Processing and
 * give.complete_inbound_event are idempotent, so a duplicate or missed run is
 * harmless.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    const result = await reprocessPendingInboundEvents(dbService())
    if (result.waiting > 0) console.warn("inbound events waiting for a channel processor", result.waiting)
    return NextResponse.json(result)
  } catch (err) {
    console.error("reprocess-inbound failed", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "reprocess_failed" }, { status: 500 })
  }
}
