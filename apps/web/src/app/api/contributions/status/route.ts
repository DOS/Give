import { NextResponse, type NextRequest } from "next/server"

import { getSession } from "@/lib/auth/session"
import { STATUS_TOKEN_HEADER, type ContributionStatus } from "@/lib/contributions"
import { dbAs, dbService } from "@/lib/supabase"
import { isDonationCode } from "@/server/vietqr"
import { guestStatus, ownStatus } from "@/server/contributions"

export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
}

/**
 * Status of one donation for its waiting page (section 4.1 step 9): only
 * `status` and `received_amount`, never other fields.
 *
 * - Guests send the status token create_donation returned, in the
 *   x-give-status-token header so it stays out of URLs and logs. The token is
 *   checked by give.get_contribution_status() under the service role; anon
 *   never reads give.contributions.
 * - Signed-in donors send `?code=<reference code>` and read their own
 *   donation under RLS with their own token.
 *
 * A wrong, malformed or expired token, or a code that is not the caller's,
 * gets 404.
 */
export async function GET(request: NextRequest) {
  const token = request.headers.get(STATUS_TOKEN_HEADER)
  let result: ContributionStatus | null = null
  try {
    if (token !== null) {
      result = await guestStatus(dbService(), token)
    } else {
      const code = request.nextUrl.searchParams.get("code")
      const session = await getSession()
      if (!session || !isDonationCode(code)) return notFound()
      result = await ownStatus(dbAs(session.accessToken), session.user.id, code)
    }
  } catch (error) {
    const { code, message } = (error ?? {}) as { code?: string; message?: string }
    // PostgREST rejected the session token (expired or invalid).
    if (code === "PGRST301" || code === "PGRST303") {
      return NextResponse.json({ error: "signed_out" }, { status: 401, headers: NO_STORE })
    }
    console.error("contribution status failed", code, message)
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE })
  }
  if (!result) return notFound()
  return NextResponse.json(
    { status: result.status, received_amount: Number(result.received_amount) },
    { headers: NO_STORE }
  )
}
