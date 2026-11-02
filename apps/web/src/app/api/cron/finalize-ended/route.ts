import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"

export const dynamic = "force-dynamic"

interface FinalizeCounts {
  closed: number
  failed: number
}

/**
 * Vercel Cron (every 5 minutes, see vercel.json): live give campaigns whose
 * end time has passed close. The RPC is idempotent (a closed campaign is not
 * picked again) and skips rows another run has locked. Each campaign closes on
 * its own: one that fails stays live, is written to give.audit_log and is
 * counted in `failed`, and the next run tries it again.
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
  // A function with OUT parameters returns one row: PostgREST sends it as an object.
  const row = (Array.isArray(data) ? data[0] : data) as Partial<FinalizeCounts> | null
  const counts: FinalizeCounts = { closed: row?.closed ?? 0, failed: row?.failed ?? 0 }
  if (counts.failed > 0) console.error("campaigns failed to finalize; see give.audit_log", counts.failed)
  return NextResponse.json(counts)
}
