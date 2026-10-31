import { NextResponse, type NextRequest } from "next/server"

import { cookieName, cookieOptions, REFRESH_TTL_SECONDS, SESSION_ACCESS, SESSION_REFRESH } from "@/lib/auth/cookies"
import { loadOidcConfig, refreshTokens } from "@/lib/auth/oidc"
import { needsRefresh } from "@/lib/auth/token"

/**
 * Keeps the session's access token fresh. When it is missing or about to
 * expire and a refresh token exists, rotate both and hand the new access
 * token to this request too, so server components render signed in.
 */
export async function proxy(request: NextRequest) {
  const { hostname } = request.nextUrl
  const accessName = cookieName(SESSION_ACCESS, hostname)
  const refreshName = cookieName(SESSION_REFRESH, hostname)
  const access = request.cookies.get(accessName)?.value
  const refresh = request.cookies.get(refreshName)?.value

  if (!refresh || !needsRefresh(access)) return NextResponse.next()

  try {
    const tokens = await refreshTokens(loadOidcConfig(request.nextUrl.origin), refresh)
    request.cookies.set(accessName, tokens.access_token)
    const response = NextResponse.next({ request })
    response.cookies.set(accessName, tokens.access_token, cookieOptions(hostname, tokens.expires_in))
    if (tokens.refresh_token) {
      response.cookies.set(refreshName, tokens.refresh_token, cookieOptions(hostname, REFRESH_TTL_SECONDS))
    }
    return response
  } catch (error) {
    // Only a refresh token the issuer rejected ends the session. A network
    // error or 5xx keeps the cookies so the next request can try again.
    const rejected = error instanceof Error && /_(400|401)$/.test(error.message)
    if (!rejected) return NextResponse.next()
    request.cookies.delete(accessName)
    const response = NextResponse.next({ request })
    response.cookies.set(accessName, "", cookieOptions(hostname, 0))
    response.cookies.set(refreshName, "", cookieOptions(hostname, 0))
    return response
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|auth/).*)"],
}
