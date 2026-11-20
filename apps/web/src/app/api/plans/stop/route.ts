import { NextResponse, type NextRequest } from "next/server"

import { STOP_TOKEN_PARAM } from "@/lib/plans"
import { dbService } from "@/lib/supabase"
import { byteaHex, verifiedStopTokenHash } from "@/server/plans/stop-link"

export const dynamic = "force-dynamic"

/**
 * The stop link of monthly plan reminders (DOS/Give#276, design 4.3.4). Mail
 * clients POST here for one-click unsubscribe (RFC 8058, the List-Unsubscribe
 * header of plan_reminder and plan_followup); the page /plans/stop posts its
 * form here too. A GET (a link scanner, or a person opening the header link)
 * only shows that page, so prefetching an email never stops a plan. The
 * link's HMAC is checked before any database call; the database then checks
 * the token itself (single use, 60 days, plan still active) in
 * give.cancel_donation_plan_by_token.
 */

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" }

type StopResult = "done" | "expired" | "invalid"

/** What give.cancel_donation_plan_by_token answered, for the page and for a one-click POST. */
const RESULTS: Record<string, { result: StopResult; status: number }> = {
  stopped: { result: "done", status: 200 },
  expired: { result: "expired", status: 410 },
  invalid: { result: "invalid", status: 404 },
}

function pageUrl(request: NextRequest, query: Record<string, string>) {
  const url = new URL("/plans/stop", request.nextUrl.origin)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return url
}

export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get(STOP_TOKEN_PARAM)
  const keep: Record<string, string> = token && verifiedStopTokenHash(token) ? { [STOP_TOKEN_PARAM]: token } : {}
  return NextResponse.redirect(pageUrl(request, keep), { status: 303, headers: HEADERS })
}

export async function POST(request: NextRequest) {
  let form: FormData | null = null
  try {
    form = await request.formData()
  } catch {
    form = null
  }
  const fromForm = form?.get(STOP_TOKEN_PARAM)
  const token =
    typeof fromForm === "string" && fromForm !== "" ? fromForm : request.nextUrl.searchParams.get(STOP_TOKEN_PARAM)
  const oneClick = form?.get("List-Unsubscribe") === "One-Click"

  const hash = verifiedStopTokenHash(token)
  if (!token || !hash) {
    return oneClick
      ? new NextResponse("invalid", { status: 400, headers: HEADERS })
      : NextResponse.redirect(pageUrl(request, { result: "invalid" }), { status: 303, headers: HEADERS })
  }

  const { data, error } = await dbService().rpc("cancel_donation_plan_by_token", { p_token_hash: byteaHex(hash) })
  if (error) {
    console.error("cancel_donation_plan_by_token failed", error.code, error.message)
    return oneClick
      ? new NextResponse("error", { status: 503, headers: HEADERS })
      : NextResponse.redirect(pageUrl(request, { [STOP_TOKEN_PARAM]: token, result: "error" }), {
          status: 303,
          headers: HEADERS,
        })
  }
  const row = (Array.isArray(data) ? data[0] : data) as { state?: unknown } | null | undefined
  const outcome = (typeof row?.state === "string" && RESULTS[row.state]) || RESULTS.invalid
  return oneClick
    ? new NextResponse(outcome.result, { status: outcome.status, headers: HEADERS })
    : NextResponse.redirect(pageUrl(request, { result: outcome.result }), { status: 303, headers: HEADERS })
}
