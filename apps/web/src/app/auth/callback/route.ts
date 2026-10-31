import { NextResponse, type NextRequest } from "next/server"

import {
  cookieName,
  cookieOptions,
  FLOW_NONCE,
  FLOW_RETURN,
  FLOW_STATE,
  FLOW_VERIFIER,
  REFRESH_TTL_SECONDS,
  SESSION_ACCESS,
  SESSION_REFRESH,
} from "@/lib/auth/cookies"
import { exchangeCode, loadOidcConfig, verifyIdToken } from "@/lib/auth/oidc"
import { appOrigin } from "@/lib/auth/origin"
import { safeReturnPath } from "@/lib/return-path"

export async function GET(request: NextRequest) {
  const { hostname, origin, searchParams } = request.nextUrl
  const read = (base: string) => request.cookies.get(cookieName(base, hostname))?.value

  const fail = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/?login_error=${reason}`, request.url))
    clearFlow(response, hostname)
    return response
  }

  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const expectedState = read(FLOW_STATE)
  const nonce = read(FLOW_NONCE)
  const verifier = read(FLOW_VERIFIER)

  if (searchParams.get("error")) return fail("denied")
  if (!code || !state || !expectedState || !nonce || !verifier || state !== expectedState) {
    return fail("state")
  }

  try {
    const cfg = loadOidcConfig(appOrigin(origin))
    const tokens = await exchangeCode(cfg, code, verifier)
    if (!tokens.id_token || !tokens.refresh_token) return fail("tokens")
    await verifyIdToken(cfg, tokens.id_token, nonce)

    const response = NextResponse.redirect(new URL(safeReturnPath(read(FLOW_RETURN)), request.url))
    response.headers.set("Cache-Control", "no-store")
    clearFlow(response, hostname)
    response.cookies.set(
      cookieName(SESSION_ACCESS, hostname),
      tokens.access_token,
      cookieOptions(hostname, tokens.expires_in)
    )
    response.cookies.set(
      cookieName(SESSION_REFRESH, hostname),
      tokens.refresh_token,
      cookieOptions(hostname, REFRESH_TTL_SECONDS)
    )
    return response
  } catch {
    return fail("exchange")
  }
}

function clearFlow(response: NextResponse, hostname: string) {
  for (const base of [FLOW_STATE, FLOW_NONCE, FLOW_VERIFIER, FLOW_RETURN]) {
    response.cookies.set(cookieName(base, hostname), "", cookieOptions(hostname, 0))
  }
}
