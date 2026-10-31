import { NextResponse, type NextRequest } from "next/server"

import {
  cookieName,
  cookieOptions,
  FLOW_NONCE,
  FLOW_RETURN,
  FLOW_STATE,
  FLOW_TTL_SECONDS,
  FLOW_VERIFIER,
} from "@/lib/auth/cookies"
import { buildAuthorizeUrl, loadOidcConfig, randomToken } from "@/lib/auth/oidc"
import { safeReturnPath } from "@/lib/return-path"

export async function GET(request: NextRequest) {
  const { hostname, origin } = request.nextUrl
  const returnPath = safeReturnPath(request.nextUrl.searchParams.get("return_path"))

  let cfg
  try {
    cfg = loadOidcConfig(origin)
  } catch {
    return NextResponse.redirect(new URL("/?login_error=unavailable", request.url))
  }

  const state = randomToken()
  const nonce = randomToken()
  const codeVerifier = randomToken()

  const response = NextResponse.redirect(buildAuthorizeUrl(cfg, { state, nonce, codeVerifier }))
  response.headers.set("Cache-Control", "no-store")
  const opts = cookieOptions(hostname, FLOW_TTL_SECONDS)
  response.cookies.set(cookieName(FLOW_STATE, hostname), state, opts)
  response.cookies.set(cookieName(FLOW_NONCE, hostname), nonce, opts)
  response.cookies.set(cookieName(FLOW_VERIFIER, hostname), codeVerifier, opts)
  response.cookies.set(cookieName(FLOW_RETURN, hostname), returnPath, opts)
  return response
}
