import { NextResponse, type NextRequest } from "next/server"

import { cookieName, cookieOptions, SESSION_ACCESS, SESSION_REFRESH } from "@/lib/auth/cookies"
import { endIssuerSession } from "@/lib/auth/logout"
import { appOrigin } from "@/lib/auth/origin"

// POST only, so a cross-site link or image cannot sign people out.
export async function POST(request: NextRequest) {
  const { hostname, origin } = request.nextUrl
  const from = request.headers.get("origin")
  if (from && from !== origin) return new NextResponse(null, { status: 403 })
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin") return new NextResponse(null, { status: 403 })

  const accessName = cookieName(SESSION_ACCESS, hostname)
  const refreshName = cookieName(SESSION_REFRESH, hostname)
  // Ends the session at the issuer first; a failure is logged and the
  // cookies below are cleared anyway.
  await endIssuerSession(appOrigin(origin), {
    access: request.cookies.get(accessName)?.value,
    refresh: request.cookies.get(refreshName)?.value,
  }).catch(() => "failed")

  const response = NextResponse.redirect(new URL("/", request.url), 303)
  response.headers.set("Cache-Control", "no-store")
  response.cookies.set(accessName, "", cookieOptions(hostname, 0))
  response.cookies.set(refreshName, "", cookieOptions(hostname, 0))
  return response
}
