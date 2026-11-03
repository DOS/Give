import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"

export const dynamic = "force-dynamic"

interface LapseCounts {
  lapsed: number
  refund_due: number
  failed: number
}

/** The function's OUT parameters come back as one object (or a one-row array). */
function lapseCounts(data: unknown): LapseCounts | null {
  const row: unknown = Array.isArray(data) && data.length === 1 ? data[0] : data
  if (typeof row !== "object" || row === null) return null
  const { lapsed, refund_due, failed } = row as Record<string, unknown>
  return typeof lapsed === "number" && typeof refund_due === "number" && typeof failed === "number"
    ? { lapsed, refund_due, failed }
    : null
}

/**
 * Vercel Cron (hourly, see vercel.json; design 5.3): pledges of succeeded
 * back campaigns still unpaid at payment_due_at end (section 4.2 step 5).
 * Nothing paid -> lapsed; part paid -> refund_due, and the creator owes that
 * money back within 14 days. Both release the tier slot and tell the backer
 * (and, for refund_due, the creator) through in-app notices. The RPC is
 * idempotent; each campaign runs on its own, and one that fails is written to
 * give.audit_log, counted in `failed` and tried again next hour.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { data, error } = await dbService().rpc("lapse_overdue_pledges")
  if (error) {
    console.error("lapse_overdue_pledges failed", error.code, error.message)
    return NextResponse.json({ error: "lapse_failed" }, { status: 500 })
  }
  const counts = lapseCounts(data)
  if (!counts) {
    console.error("lapse_overdue_pledges answered unexpectedly")
    return NextResponse.json({ error: "lapse_failed" }, { status: 500 })
  }
  if (counts.failed > 0) console.error("campaigns failed to lapse pledges; see give.audit_log", counts.failed)
  return NextResponse.json(counts)
}
