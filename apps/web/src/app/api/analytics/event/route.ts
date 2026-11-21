import { NextResponse, type NextRequest } from "next/server"

import { isBotUserAgent, sanitizeReferrer, type AnalyticsEventType } from "@/lib/analytics"
import { appOrigin, siteOrigin } from "@/lib/auth/origin"
import { giveErrorCode } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { dbService } from "@/lib/supabase"
import { checkAnalyticsRateLimit, deriveAnalyticsClientKey } from "@/server/analytics-rate-limit"

export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }
const MAX_BODY_BYTES = 2048

function emptyResponse(status: number, extraHeaders?: Record<string, string>) {
  return new NextResponse(null, { status, headers: { ...NO_STORE, ...extraHeaders } })
}

function errorResponse(error: string, status: number, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers: { ...NO_STORE, ...extraHeaders } })
}

function allowedOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>()
  if (request.nextUrl.origin && request.nextUrl.origin !== "null") {
    origins.add(request.nextUrl.origin)
  }
  const configured = siteOrigin()
  if (configured) origins.add(configured)
  const resolved = appOrigin(request.nextUrl.origin)
  if (resolved && resolved !== "null") origins.add(resolved)
  return origins
}

function isSameOriginRequest(request: NextRequest): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase()
  if (fetchSite && fetchSite !== "same-origin") return false

  const allowed = allowedOrigins(request)
  if (allowed.size === 0) return false

  const originHeader = request.headers.get("origin")?.trim()
  if (originHeader) {
    if (originHeader === "null") return false
    try {
      return allowed.has(new URL(originHeader).origin)
    } catch {
      return false
    }
  }

  // Fallback for clients that omit Origin on POST: require a matching Referer origin.
  const refererHeader = request.headers.get("referer")?.trim()
  if (!refererHeader) return false
  try {
    return allowed.has(new URL(refererHeader).origin)
  } catch {
    return false
  }
}

function ownHostnames(request: NextRequest): string[] {
  const hosts: string[] = []
  for (const origin of allowedOrigins(request)) {
    try {
      hosts.push(new URL(origin).hostname)
    } catch {
      // ignore malformed origin
    }
  }
  return hosts
}

/**
 * Privacy-safe campaign analytics ingestion endpoint (DOS/Give#252).
 *
 * Accepts same-origin `view` and `share_click` events, drops bot user agents
 * silently, enforces ephemeral zero-PII rate limits, strips referrers down to
 * safe hostnames (passing `null` for same-origin navigation), and records only
 * daily aggregate counters via `give.record_campaign_event`.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("forbidden", 403)
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""
  if (!contentType.startsWith("application/json")) {
    return errorResponse("unsupported_media_type", 415)
  }

  // Drop crawlers, link previewers, and automated clients silently without touching DB.
  if (isBotUserAgent(request.headers.get("user-agent"))) {
    return emptyResponse(204)
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return errorResponse("invalid_body", 400)
  }
  if (!rawBody || Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return errorResponse("invalid_body", 400)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return errorResponse("invalid_json", 400)
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return errorResponse("invalid_payload", 400)
  }

  const { campaignId, event, referrer } = parsed as Record<string, unknown>
  if (!isUuid(campaignId)) {
    return errorResponse("invalid_campaign_id", 400)
  }
  if (event !== "view" && event !== "share_click") {
    return errorResponse("invalid_event", 400)
  }
  if (referrer !== undefined && referrer !== null && typeof referrer !== "string") {
    return errorResponse("invalid_referrer", 400)
  }

  const eventType: AnalyticsEventType = event
  const clientKey = deriveAnalyticsClientKey(request.headers)
  const limit = checkAnalyticsRateLimit(clientKey, campaignId, eventType)
  if (!limit.allowed) {
    return errorResponse("rate_limited", 429, { "Retry-After": String(limit.retryAfterSeconds) })
  }

  const sanitizedReferrer = eventType === "view" ? sanitizeReferrer(referrer, ownHostnames(request)) : null

  try {
    const { error } = await dbService().rpc("record_campaign_event", {
      p_campaign_id: campaignId,
      p_event: eventType,
      p_referrer: sanitizedReferrer,
    })
    if (error) {
      const code = giveErrorCode(error)
      if (code === "GIVE_CAMPAIGN_NOT_FOUND" || error.code === "P0002") {
        return errorResponse("not_found", 404)
      }
      if (code === "GIVE_ANALYTICS_EVENT_INVALID" || error.code === "23514") {
        return errorResponse("invalid_event", 400)
      }
      // Log only error code, never headers, IP, referrer, or user agent.
      console.error("analytics event failed", error.code ?? "unknown")
      return errorResponse("unavailable", 503)
    }
  } catch {
    console.error("analytics event failed", "unexpected")
    return errorResponse("unavailable", 503)
  }

  return emptyResponse(204)
}
