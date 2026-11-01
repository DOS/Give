import { NextResponse, type NextRequest } from "next/server"

import { cookieName, cookieOptions, REFRESH_TTL_SECONDS, SESSION_ACCESS, SESSION_REFRESH } from "@/lib/auth/cookies"
import { isDeadRefreshToken, loadOidcConfig, refreshTokens, TokenRequestError } from "@/lib/auth/oidc"
import { appOrigin } from "@/lib/auth/origin"
import { needsRefresh } from "@/lib/auth/token"

/**
 * Keeps the session's access token fresh. When it is missing or about to
 * expire and a refresh token exists, rotate both and hand the new access
 * token to this request too, so server components render signed in. The
 * refresh call gives up after TOKEN_TIMEOUT_MS (set in oidc.ts) and never
 * follows a redirect.
 */
export async function proxy(request: NextRequest) {
  const { hostname } = request.nextUrl
  const accessName = cookieName(SESSION_ACCESS, hostname)
  const refreshName = cookieName(SESSION_REFRESH, hostname)
  const access = request.cookies.get(accessName)?.value
  const refresh = request.cookies.get(refreshName)?.value

  if (!refresh || !needsRefresh(access)) return NextResponse.next()

  try {
    const tokens = await refreshTokens(loadOidcConfig(appOrigin(request.nextUrl.origin)), refresh)
    request.cookies.set(accessName, tokens.access_token)
    const response = NextResponse.next({ request })
    response.cookies.set(accessName, tokens.access_token, cookieOptions(hostname, tokens.expires_in))
    if (tokens.refresh_token) {
      response.cookies.set(refreshName, tokens.refresh_token, cookieOptions(hostname, REFRESH_TTL_SECONDS))
    }
    return response
  } catch (error) {
    // Only a refresh token the issuer rejected ends the session. Anything
    // else (a wrong client secret, a timeout, a 5xx, a network error) keeps
    // the cookies so the next request can try again, and is logged so a
    // config mistake fails loudly instead of signing everyone out.
    if (!isDeadRefreshToken(error)) {
      console.warn("auth.refresh.failed", refreshFailure(error))
      return NextResponse.next()
    }
    request.cookies.delete(accessName)
    const response = NextResponse.next({ request })
    response.cookies.set(accessName, "", cookieOptions(hostname, 0))
    response.cookies.set(refreshName, "", cookieOptions(hostname, 0))
    return response
  }
}

/** The status, error code and error name only: an error message could echo a token. */
function refreshFailure(error: unknown) {
  return {
    status: error instanceof TokenRequestError ? error.status : undefined,
    code: error instanceof TokenRequestError ? error.code : undefined,
    error: error instanceof Error ? error.name : undefined,
  }
}

export const config = {
  // Public covers ignore the session and are cacheable, so they must never
  // carry rotated session cookies.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|auth/|media/public/).*)"],
}
