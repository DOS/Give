import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const BATCH_LIMIT = 10_000
const MAX_BATCHES = 5

/**
 * Vercel Cron (hourly at :20, see vercel.json): 48-hour closing-soon reminders
 * (DOS/Give#337). `give.remind_closing_campaigns()` caps each batch at 10,000
 * rows, so this route drains up to `MAX_BATCHES` full batches per run to clear
 * >10k backlogs promptly without timing out the serverless function.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const db = dbService()
  let totalReminded = 0

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    let data: unknown
    let error: { code?: string; message?: string } | null
    try {
      ;({ data, error } = await db.rpc("remind_closing_campaigns"))
    } catch (thrown) {
      console.error("remind_closing_campaigns threw", thrown)
      return NextResponse.json({ error: "remind_failed" }, { status: 500 })
    }
    if (error) {
      console.error("remind_closing_campaigns failed", error.code, error.message)
      return NextResponse.json({ error: "remind_failed" }, { status: 500 })
    }
    if (typeof data !== "number" || !Number.isInteger(data) || data < 0) {
      console.error("remind_closing_campaigns answered unexpectedly")
      return NextResponse.json({ error: "remind_failed" }, { status: 500 })
    }
    totalReminded += data
    if (data !== BATCH_LIMIT) break
  }

  return NextResponse.json({ reminded: totalReminded })
}
