import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface PurgeCounts {
  deleted_accounts: number
  cleared: number
  expired_tokens: number
}

function purgeCounts(data: unknown): PurgeCounts | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null
  const { deleted_accounts, cleared, expired_tokens } = data as Record<string, unknown>
  return typeof deleted_accounts === "number" && typeof cleared === "number" && typeof expired_tokens === "number"
    ? { deleted_accounts, cleared, expired_tokens }
    : null
}

/**
 * Vercel Cron (daily, see vercel.json): email outbox retention
 * (DOS/Give#254). give.purge_outbox clears the address and payload of rows
 * whose account was deleted and of rows settled more than 30 days ago (the
 * row and its idempotency key stay), and deletes expired guest tracking
 * tokens. It works in batches; a backlog clears over the following days.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { data, error } = await dbService().rpc("purge_outbox")
  if (error) {
    console.error("purge_outbox failed", error.code, error.message)
    return NextResponse.json({ error: "purge_failed" }, { status: 500 })
  }
  const counts = purgeCounts(data)
  if (!counts) {
    console.error("purge_outbox answered unexpectedly")
    return NextResponse.json({ error: "purge_failed" }, { status: 500 })
  }
  return NextResponse.json(counts)
}
