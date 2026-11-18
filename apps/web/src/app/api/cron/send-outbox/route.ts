import { NextResponse, type NextRequest } from "next/server"

import { isAuthorizedCron } from "@/lib/cron"
import { dbService } from "@/lib/supabase"
import { emailSettingsFromEnv } from "@/server/email/provider"
import { sendDueEmails } from "@/server/email/outbox"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Vercel Cron (every minute, see vercel.json): sends due rows of the email
 * outbox (DOS/Give#254, design 5.3 "send-outbox"). give.claim_outbox leases
 * each row to one run, so overlapping runs never send the same row; a failed
 * send is retried with backoff and ends 'dead' (shown in /admin/emails)
 * after its last attempt. Outside Production the log transport mails nobody
 * unless real sending is switched on (server/email/provider). In Production
 * without SES credentials the job claims nothing, so queued emails wait
 * instead of being marked sent.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const settings = emailSettingsFromEnv()
  if (!settings.ok) {
    console.warn("send-outbox skipped: email is not configured", settings.missing.join(", "))
    return NextResponse.json({ error: "email_not_configured", missing: settings.missing }, { status: 503 })
  }
  try {
    const result = await sendDueEmails(dbService(), settings.transport, settings.options)
    return NextResponse.json({ delivery: settings.delivery, ...result })
  } catch (error) {
    const { code, message } = (error ?? {}) as { code?: string; message?: string }
    console.error("send-outbox failed", code, message)
    return NextResponse.json({ error: "send_failed" }, { status: 500 })
  }
}
