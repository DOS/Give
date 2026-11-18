import { NextResponse, type NextRequest } from "next/server"

import { isUuid } from "@/lib/ids"
import { dbService } from "@/lib/supabase"

export const dynamic = "force-dynamic"

/**
 * Unsubscribe from Give's notification emails (DOS/Give#254). Mail clients
 * POST here for one-click unsubscribe (RFC 8058, the List-Unsubscribe
 * header); the page /email/unsubscribe posts its form here too. A GET (a
 * link scanner, or a person opening the header link) only shows that page,
 * so prefetching an email never unsubscribes anyone. The token is the
 * email's own unsubscribe token; give.unsubscribe_email ignores it for
 * transactional emails.
 */

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" }

function pageUrl(request: NextRequest, query: Record<string, string>) {
  const url = new URL("/email/unsubscribe", request.nextUrl.origin)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return url
}

export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t")
  return NextResponse.redirect(pageUrl(request, isUuid(token ?? "") ? { t: token as string } : {}), {
    status: 303,
    headers: HEADERS,
  })
}

export async function POST(request: NextRequest) {
  let form: FormData | null = null
  try {
    form = await request.formData()
  } catch {
    form = null
  }
  const fromForm = form?.get("t")
  const token = typeof fromForm === "string" && fromForm !== "" ? fromForm : request.nextUrl.searchParams.get("t")
  const oneClick = form?.get("List-Unsubscribe") === "One-Click"

  if (!token || !isUuid(token)) {
    return oneClick
      ? new NextResponse("invalid", { status: 400, headers: HEADERS })
      : NextResponse.redirect(pageUrl(request, { result: "invalid" }), { status: 303, headers: HEADERS })
  }

  const { data, error } = await dbService().rpc("unsubscribe_email", { p_token: token })
  if (error) {
    console.error("unsubscribe_email failed", error.code, error.message)
    return oneClick
      ? new NextResponse("error", { status: 503, headers: HEADERS })
      : NextResponse.redirect(pageUrl(request, { t: token, result: "error" }), { status: 303, headers: HEADERS })
  }
  const result = data === true ? "done" : "invalid"
  return oneClick
    ? new NextResponse(result, { status: data === true ? 200 : 404, headers: HEADERS })
    : NextResponse.redirect(pageUrl(request, { result }), { status: 303, headers: HEADERS })
}
