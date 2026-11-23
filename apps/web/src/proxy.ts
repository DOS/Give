import { NextResponse, type NextRequest } from "next/server"

import { cookieName, cookieOptions, REFRESH_TTL_SECONDS, SESSION_ACCESS, SESSION_REFRESH } from "@/lib/auth/cookies"
import { isDeadRefreshToken, loadOidcConfig, refreshTokens, tokenFailureLog } from "@/lib/auth/oidc"
import { appOrigin } from "@/lib/auth/origin"
import { needsRefresh } from "@/lib/auth/token"

export const EMBED_HEADER = "x-give-embed"

const EXACT_EMBED_RE = /^\/embed(?:\/|$)/
const ANY_CASE_EMBED_RE = /^\/embed(?:\/|$)/i

/**
 * Keeps the session's access token fresh. When it is missing or about to
 * expire and a refresh token exists, rotate both and hand the new access
 * token to this request too, so server components render signed in. The
 * refresh call gives up after TOKEN_TIMEOUT_MS (set in oidc.ts) and never
 * follows a redirect.
 *
 * Embed widget routes (`/embed`, `/embed/*`) stay strictly anonymous: `proxy()`
 * marks them with a trusted internal `x-give-embed` request header and returns
 * before touching cookies or OIDC refresh, while stripping any client-supplied
 * `x-give-embed` on every other route and rejecting mixed-case `/Embed*` paths
 * with 404 + `X-Frame-Options: DENY` (DOS/Give#335).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (ANY_CASE_EMBED_RE.test(pathname) && !EXACT_EMBED_RE.test(pathname)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "frame-ancestors 'none'",
        "X-Robots-Tag": "noindex, nofollow",
      },
    })
  }
  if (EXACT_EMBED_RE.test(pathname)) {
    const embedHeaders = new Headers(request.headers)
    embedHeaders.set(EMBED_HEADER, "1")
    return NextResponse.next({ request: { headers: embedHeaders } })
  }

  const hadSpoofedEmbed = request.headers.has(EMBED_HEADER)
  if (hadSpoofedEmbed) request.headers.delete(EMBED_HEADER)

  const { hostname } = request.nextUrl
  const accessName = cookieName(SESSION_ACCESS, hostname)
  const refreshName = cookieName(SESSION_REFRESH, hostname)
  const access = request.cookies.get(accessName)?.value
  const refresh = request.cookies.get(refreshName)?.value

  if (!refresh || !needsRefresh(access)) {
    return hadSpoofedEmbed ? NextResponse.next({ request: { headers: new Headers(request.headers) } }) : NextResponse.next()
  }

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
      console.warn("auth.refresh.failed", tokenFailureLog(error))
      return hadSpoofedEmbed
        ? NextResponse.next({ request: { headers: new Headers(request.headers) } })
        : NextResponse.next()
    }
    request.cookies.delete(accessName)
    const response = NextResponse.next({ request })
    response.cookies.set(accessName, "", cookieOptions(hostname, 0))
    response.cookies.set(refreshName, "", cookieOptions(hostname, 0))
    return response
  }
}

export const config = {
  // Public covers, statement CSV exports, crawlers, and anonymous analytics ignore
  // the session, so they must never trigger token refresh or carry rotated session cookies.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots\\.txt(?:\\?|$)|sitemap\\.xml(?:\\?|$)|api/cron|api/analytics/|auth/|media/public/|campaigns/[^/]+/statement/export(?:/|\\?|$)).*)",
  ],
}
