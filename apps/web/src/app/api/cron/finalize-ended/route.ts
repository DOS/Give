import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"

export const dynamic = "force-dynamic"

interface FinalizeCounts {
  closed: number
  failed: number
}

/**
 * The function's OUT parameters come back as one object (or a one-row
 * array). A bare number is the count of the function before DOS-Me
 * 20261103180000, which had no failure count.
 */
function finalizeCounts(data: unknown): FinalizeCounts | null {
  if (typeof data === "number") return { closed: data, failed: 0 }
  const row: unknown = Array.isArray(data) && data.length === 1 ? data[0] : data
  if (typeof row !== "object" || row === null) return null
  const { closed, failed } = row as Record<string, unknown>
  return typeof closed === "number" && typeof failed === "number" ? { closed, failed } : null
}

/**
 * Vercel Cron (every 5 minutes, see vercel.json): live campaigns whose end
 * time has passed are decided. A give campaign closes; a back campaign
 * succeeds when its pledges reach the goal (pledges become payment_due and
 * backers get a payment_due notice) and fails otherwise (pledges are
 * cancelled; DOS-Me 20261105150000, DOS/Give#30). The RPC is idempotent (a closed campaign is not
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
  const counts = finalizeCounts(data)
  if (!counts) {
    console.error("finalize_ended_campaigns answered unexpectedly")
    return NextResponse.json({ error: "finalize_failed" }, { status: 500 })
  }
  if (counts.failed > 0) console.error("campaigns failed to finalize; see give.audit_log", counts.failed)
  return NextResponse.json(counts)
}
