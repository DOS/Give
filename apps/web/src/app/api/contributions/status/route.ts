import { NextResponse, type NextRequest } from "next/server"

import { getSession } from "@/lib/auth/session"
import { STATUS_TOKEN_HEADER, type ContributionStatus } from "@/lib/contributions"
import { dbAs, dbService } from "@/lib/supabase"
import { isDonationCode } from "@/server/vietqr"
import {
  donationCookieToken,
  guestContribution,
  guestStatus,
  hostnameFrom,
  isSessionRejected,
  ownStatus,
} from "@/server/contributions"

export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
}

/**
 * Status of one donation for its waiting page (section 4.1 step 9): only
 * `status` and `received_amount`, never other fields.
 *
 * - A caller holding a guest status token sends it in the
 *   x-give-status-token header (never in a URL); give.get_contribution_status
 *   checks it under the service role.
 * - The payment page sends `?code=<reference code>`. A signed-in donor reads
 *   their own donation under RLS; a guest is recognised by the status token
 *   cookie the donate action set for that code, so page script never sees
 *   the token.
 *
 * anon never reads give.contributions. A wrong, malformed or expired token,
 * or a code that is not the caller's, gets 404.
 */
export async function GET(request: NextRequest) {
  const headerToken = request.headers.get(STATUS_TOKEN_HEADER)
  let result: ContributionStatus | null = null
  try {
    if (headerToken !== null) {
      result = await guestStatus(dbService(), headerToken)
    } else {
      const code = request.nextUrl.searchParams.get("code")
      if (!isDonationCode(code)) return notFound()
      const session = await getSession()
      let sessionRejected = false
      if (session) {
        try {
          result = await ownStatus(dbAs(session.accessToken), session.user.id, code)
        } catch (error) {
          if (!isSessionRejected(error)) throw error
          sessionRejected = true
        }
      }
      if (!result) {
        const token = donationCookieToken(request.cookies, code, hostnameFrom(request.headers.get("host")))
        const guest = token ? await guestContribution(dbService(), code, token) : null
        if (guest) result = { status: guest.status, received_amount: guest.received_amount }
      }
      // A donor whose session ended, with no guest cookie for this code either.
      if (!result && sessionRejected) {
        return NextResponse.json({ error: "signed_out" }, { status: 401, headers: NO_STORE })
      }
    }
  } catch (error) {
    const { code, message } = (error ?? {}) as { code?: string; message?: string }
    console.error("contribution status failed", code, message)
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE })
  }
  if (!result) return notFound()
  return NextResponse.json(
    { status: result.status, received_amount: Number(result.received_amount) },
    { headers: NO_STORE }
  )
}
