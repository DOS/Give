import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, type Call, type Handler } from "@/test/fake-db"

vi.mock("server-only", () => ({}))

const state = vi.hoisted(() => ({
  handler: (() => ({ data: [] })) as Handler,
  calls: [] as Call[],
}))

vi.mock("@/lib/supabase", () => ({
  dbService: () => fakeDb((call) => state.handler(call), state.calls),
}))

const { resetAnalyticsRateLimit } = await import("@/server/analytics-rate-limit")
const { POST } = await import("./route")

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
  url = "https://beta.give.vn/api/analytics/event"
) {
  const mergedHeaders: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": CHROME_UA,
    origin: "https://beta.give.vn",
    "sec-fetch-site": "same-origin",
    "x-real-ip": "203.0.113.55",
    ...headers,
  }
  const serialized = typeof body === "string" ? body : JSON.stringify(body)
  return new NextRequest(url, {
    method: "POST",
    headers: mergedHeaders,
    body: serialized,
  })
}

beforeEach(() => {
  state.calls.length = 0
  state.handler = () => ({ data: [] })
  resetAnalyticsRateLimit()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("POST /api/analytics/event", () => {
  it("records a view event with sanitized external referrer hostname", async () => {
    const response = await POST(
      makeRequest({
        campaignId: CAMPAIGN,
        event: "view",
        referrer: "https://l.facebook.com/l.php?u=https%3A%2F%2Fbeta.give.vn&fbclid=secret",
      })
    )

    expect(response.status).toBe(204)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(state.calls).toEqual([
      {
        target: "rpc:record_campaign_event",
        ops: [
          [
            "args",
            {
              p_campaign_id: CAMPAIGN,
              p_event: "view",
              p_referrer: "l.facebook.com",
            },
          ],
        ],
      },
    ])
  })

  it("passes p_referrer: null for same-origin navigation (give.vn / beta.give.vn / current host)", async () => {
    for (const referrer of [
      "https://give.vn/campaigns",
      "https://beta.give.vn/campaigns/xay-cau",
      "https://give-preview.vercel.app/campaigns",
    ]) {
      state.calls.length = 0
      const response = await POST(
        makeRequest(
          { campaignId: CAMPAIGN, event: "view", referrer },
          { origin: "https://give-preview.vercel.app" },
          "https://give-preview.vercel.app/api/analytics/event"
        )
      )
      expect(response.status).toBe(204)
      expect(state.calls[0]?.ops[0]?.[1]).toEqual({
        p_campaign_id: CAMPAIGN,
        p_event: "view",
        p_referrer: null,
      })
    }
  })

  it("records share_click with p_referrer: null even if client sends a referrer", async () => {
    const response = await POST(
      makeRequest({
        campaignId: CAMPAIGN,
        event: "share_click",
        referrer: "https://facebook.com/foo",
      })
    )

    expect(response.status).toBe(204)
    expect(state.calls[0]?.ops[0]?.[1]).toEqual({
      p_campaign_id: CAMPAIGN,
      p_event: "share_click",
      p_referrer: null,
    })
  })

  it("silently drops bot user agents with 204 without calling the database", async () => {
    const response = await POST(
      makeRequest(
        { campaignId: CAMPAIGN, event: "view" },
        { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }
      )
    )
    expect(response.status).toBe(204)
    expect(state.calls).toHaveLength(0)
  })

  it("rejects cross-origin, null-origin, and missing-origin requests with 403", async () => {
    const crossSite = await POST(
      makeRequest({ campaignId: CAMPAIGN, event: "view" }, { "sec-fetch-site": "cross-site" })
    )
    expect(crossSite.status).toBe(403)

    const evilOrigin = await POST(
      makeRequest({ campaignId: CAMPAIGN, event: "view" }, { origin: "https://evil.example" })
    )
    expect(evilOrigin.status).toBe(403)

    const nullOrigin = await POST(makeRequest({ campaignId: CAMPAIGN, event: "view" }, { origin: "null" }))
    expect(nullOrigin.status).toBe(403)

    const missingBoth = await POST(
      new NextRequest("https://beta.give.vn/api/analytics/event", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": CHROME_UA },
        body: JSON.stringify({ campaignId: CAMPAIGN, event: "view" }),
      })
    )
    expect(missingBoth.status).toBe(403)
    expect(state.calls).toHaveLength(0)
  })

  it("rejects non-JSON content types and invalid payloads", async () => {
    const wrongType = await POST(makeRequest({ campaignId: CAMPAIGN, event: "view" }, { "content-type": "text/plain" }))
    expect(wrongType.status).toBe(415)

    const badJson = await POST(makeRequest("{not-json"))
    expect(badJson.status).toBe(400)

    const badUuid = await POST(makeRequest({ campaignId: "not-a-uuid", event: "view" }))
    expect(badUuid.status).toBe(400)

    const badEvent = await POST(makeRequest({ campaignId: CAMPAIGN, event: "donate" }))
    expect(badEvent.status).toBe(400)

    const oversized = await POST(
      makeRequest(JSON.stringify({ campaignId: CAMPAIGN, event: "view", pad: "x".repeat(3000) }))
    )
    expect(oversized.status).toBe(413)

    const oversizedHeader = await POST(
      makeRequest({ campaignId: CAMPAIGN, event: "view" }, { "content-length": "9999999" })
    )
    expect(oversizedHeader.status).toBe(413)

    const wrongMediaPrefix = await POST(
      makeRequest({ campaignId: CAMPAIGN, event: "view" }, { "content-type": "application/json-patch+json" })
    )
    expect(wrongMediaPrefix.status).toBe(415)

    expect(state.calls).toHaveLength(0)
  })

  it("returns 429 with Retry-After once the rate limit is exceeded", async () => {
    for (let i = 0; i < 6; i++) {
      const ok = await POST(makeRequest({ campaignId: CAMPAIGN, event: "share_click" }))
      expect(ok.status).toBe(204)
    }
    const limited = await POST(makeRequest({ campaignId: CAMPAIGN, event: "share_click" }))
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(state.calls).toHaveLength(6)
  })

  it("maps GIVE_CAMPAIGN_NOT_FOUND to 404 and unexpected errors to 503 without logging PII", async () => {
    state.handler = () => ({ error: { code: "P0002", message: "GIVE_CAMPAIGN_NOT_FOUND" } })
    const missing = await POST(makeRequest({ campaignId: CAMPAIGN, event: "view" }))
    expect(missing.status).toBe(404)

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    state.handler = () => ({ error: { code: "57014", message: "statement timeout for 203.0.113.55" } })
    const failed = await POST(
      makeRequest({ campaignId: CAMPAIGN, event: "view", referrer: "https://secret.example/private" })
    )
    expect(failed.status).toBe(503)
    const logged = JSON.stringify(errSpy.mock.calls)
    expect(logged).toContain("57014")
    expect(logged).not.toContain("203.0.113.55")
    expect(logged).not.toContain("secret.example")
    expect(logged).not.toContain(CHROME_UA)
  })
})
