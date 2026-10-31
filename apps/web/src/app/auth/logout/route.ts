import { NextResponse, type NextRequest } from "next/server"

import { cookieName, cookieOptions, SESSION_ACCESS, SESSION_REFRESH } from "@/lib/auth/cookies"

// POST only, so a cross-site link or image cannot sign people out.
export async function POST(request: NextRequest) {
  const { hostname, origin } = request.nextUrl
  const from = request.headers.get("origin")
  if (from && from !== origin) return new NextResponse(null, { status: 403 })
  const response = NextResponse.redirect(new URL("/", request.url), 303)
  response.cookies.set(cookieName(SESSION_ACCESS, hostname), "", cookieOptions(hostname, 0))
  response.cookies.set(cookieName(SESSION_REFRESH, hostname), "", cookieOptions(hostname, 0))
  return response
}
