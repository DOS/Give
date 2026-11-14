import { NextResponse, type NextRequest } from "next/server"

import { isStatusToken, TRACKING_TOKEN_PARAM } from "@/lib/contributions"
import { dbService } from "@/lib/supabase"
import { donationCookie, donationCookiesToDrop, guestContributionAccess, hostnameFrom } from "@/server/contributions"
import { isDonationCode } from "@/server/vietqr"

export const dynamic = "force-dynamic"

const SECURITY_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
}

function plainText(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  })
}

function notFound() {
  return plainText("Không mở được khoản ủng hộ này. Đường dẫn theo dõi không hợp lệ hoặc đã hết hạn sau 7 ngày.", 404)
}

/**
 * Exchanges a guest's saved tracking link for the httpOnly status cookie on a
 * new browser or device, then 303-redirects to the clean `/donations/[code]`
 * URL so the secret token never stays in the address bar or leaks via Referer
 * (DOS/Give#50). The saved link remains reusable across devices until the
 * token expires.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // Refuse browser subresource requests (images, iframes, scripts, background
  // fetches) so another page cannot plant or evict guest donation cookies.
  // Browsers always send Sec-Fetch-Site with mode and dest; Node's fetch sends
  // Sec-Fetch-Mode alone.
  const site = request.headers.get("sec-fetch-site")
  const mode = request.headers.get("sec-fetch-mode")
  const dest = request.headers.get("sec-fetch-dest")
  if (site && (mode !== "navigate" || dest !== "document")) {
    return notFound()
  }

  const { code } = await params
  const token = request.nextUrl.searchParams.get(TRACKING_TOKEN_PARAM)
  if (!isDonationCode(code) || !isStatusToken(token)) return notFound()

  let access
  try {
    access = await guestContributionAccess(dbService(), code, token)
  } catch (error) {
    const { code: errCode, message } = (error ?? {}) as { code?: string; message?: string }
    console.error("donation tracking link failed", errCode, message?.replaceAll(token, "[redacted]"))
    return plainText("Tạm thời chưa mở được khoản ủng hộ này. Hãy thử lại sau ít phút.", 503)
  }
  if (!access) return notFound()

  const hostname = hostnameFrom(request.headers.get("host") ?? request.nextUrl.hostname)
  const cookie = donationCookie(code, hostname)
  const response = new NextResponse(null, {
    status: 303,
    headers: { ...SECURITY_HEADERS, Location: `/donations/${code}` },
  })
  const otherCookies = request.cookies
    .getAll()
    .map((c) => c.name)
    .filter((name) => name !== cookie.name)
  for (const name of donationCookiesToDrop(otherCookies)) {
    response.cookies.set(name, "", {
      ...cookie.options,
      secure: cookie.options.secure || name.startsWith("__Host-"),
      maxAge: 0,
    })
  }
  response.cookies.set(cookie.name, token, { ...cookie.options, expires: access.expiresAt })
  return response
}
