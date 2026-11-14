import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { donationTrackingPath } from "@/lib/contributions"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const TOKEN = "0123456789abcdef".repeat(4)
// sha256(decode(TOKEN, 'hex')), as Postgres computes it.
const TOKEN_SHA256 = "4884fdaafea47c29fea7159d0daddd9c085d6200e1359e85bb81736af6b7c837"
const EXPIRES_AT = "2999-11-08T00:00:00.000Z"

const state = vi.hoisted(() => ({
  session: null as { user: { id: string; email: null; name: null }; accessToken: string } | null,
  anonHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  anonCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => state.session) }))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.anonHandler(call), state.anonCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { GET } = await import("./route")
const { GET: getStatus } = await import("@/app/api/contributions/status/route")

function row(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: "33333333-3333-4333-8333-333333333333",
      campaign_id: "22222222-2222-4222-8222-222222222222",
      intended_amount: 200000,
      received_amount: 200000,
      reference_code: "GVABCDEFG",
      status: "received",
      created_at: "2026-11-01T00:00:00.000Z",
      status_token_hash: `\\x${TOKEN_SHA256}`,
      status_token_expires_at: EXPIRES_AT,
      guest_name: "Private Guest",
      guest_email: "private@example.com",
      public_name: "Lan",
      message: "Private message",
      ...overrides,
    },
  }
}

function trackRequest({
  origin = "https://give.dos.me",
  code = "GVABCDEFG",
  token = TOKEN as string | null,
  headers = {} as Record<string, string>,
} = {}) {
  const url = new URL(`/donations/${encodeURIComponent(code)}/track`, origin)
  if (token !== null) url.searchParams.set("t", token)
  return new NextRequest(url, { headers })
}

beforeEach(() => {
  state.session = null
  state.anonHandler = () => undefined
  state.serviceHandler = () => row()
  state.anonCalls.length = 0
  state.serviceCalls.length = 0
})

describe("GET /donations/[code]/track (DOS/Give#50)", () => {
  it("sets the __Host- httpOnly cookie, redirects to the clean URL, and works across multiple devices", async () => {
    // Device B: fresh laptop browser with no cookie.
    const path = donationTrackingPath("GVABCDEFG", TOKEN)
    const response = await GET(new NextRequest(`https://give.dos.me${path}`), {
      params: Promise.resolve({ code: "GVABCDEFG" }),
    })

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("/donations/GVABCDEFG")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")

    // The secret token appears only in Set-Cookie, never in Location or other public headers or body.
    // (NextResponse.cookies also mirrors into Next's internal x-middleware-set-cookie header in memory.)
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() !== "set-cookie" && key.toLowerCase() !== "x-middleware-set-cookie") {
        expect(value, key).not.toContain(TOKEN)
      }
    }
    expect(await response.text()).toBe("")

    const setCookie = response.cookies.get("__Host-give_dn_GVABCDEFG")
    expect(setCookie).toMatchObject({
      name: "__Host-give_dn_GVABCDEFG",
      value: TOKEN,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(EXPIRES_AT),
    })

    // Device B follows the redirect and polls status using only that cookie: status only, no personal data.
    const statusRes = await getStatus(
      new NextRequest("https://give.dos.me/api/contributions/status?code=GVABCDEFG", {
        headers: { host: "give.dos.me", cookie: `__Host-give_dn_GVABCDEFG=${setCookie?.value}` },
      })
    )
    expect(statusRes.status).toBe(200)
    const statusBody = await statusRes.json()
    expect(statusBody).toEqual({ status: "received", received_amount: 200000 })
    for (const pii of ["Private Guest", "private@example.com", "Lan", "Private message"]) {
      expect(JSON.stringify(statusBody)).not.toContain(pii)
    }

    // Device C: a third device can open the same saved tracking link too.
    const thirdDevice = await GET(new NextRequest(`https://give.dos.me${path}`), {
      params: Promise.resolve({ code: "GVABCDEFG" }),
    })
    expect(thirdDevice.status).toBe(303)
    expect(thirdDevice.cookies.get("__Host-give_dn_GVABCDEFG")?.value).toBe(TOKEN)
    expect(state.anonCalls).toHaveLength(0)
  })

  it("uses a plain non-Secure cookie name on localhost", async () => {
    const response = await GET(trackRequest({ origin: "http://localhost:3150", headers: { host: "localhost:3150" } }), {
      params: Promise.resolve({ code: "GVABCDEFG" }),
    })
    expect(response.status).toBe(303)
    expect(response.cookies.get("give_dn_GVABCDEFG")).toMatchObject({
      name: "give_dn_GVABCDEFG",
      value: TOKEN,
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    })
  })

  it("never redirects off-site even if Host is spoofed", async () => {
    const response = await GET(trackRequest({ headers: { host: "evil.example" } }), {
      params: Promise.resolve({ code: "GVABCDEFG" }),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("/donations/GVABCDEFG")
  })

  it("drops the oldest guest cookies past 20, but re-opening an existing one evicts nothing", async () => {
    const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
    const twentyOther = Array.from({ length: 20 }, (_, i) => `__Host-give_dn_GVBBBBB${alphabet[i]}=x`).join("; ")
    const added = await GET(trackRequest({ headers: { cookie: twentyOther } }), {
      params: Promise.resolve({ code: "GVABCDEFG" }),
    })
    expect(added.cookies.get("__Host-give_dn_GVBBBBB2")?.maxAge).toBe(0)
    expect(added.cookies.get("__Host-give_dn_GVBBBBB2")?.secure).toBe(true)
    expect(added.cookies.get("__Host-give_dn_GVABCDEFG")?.value).toBe(TOKEN)

    const nineteenOtherPlusSame = [
      `__Host-give_dn_GVABCDEFG=${TOKEN}`,
      ...Array.from({ length: 19 }, (_, i) => `__Host-give_dn_GVBBBBB${alphabet[i]}=x`),
    ].join("; ")
    const reopened = await GET(trackRequest({ headers: { cookie: nineteenOtherPlusSame } }), {
      params: Promise.resolve({ code: "GVABCDEFG" }),
    })
    expect(reopened.cookies.getAll()).toHaveLength(1)
    expect(reopened.cookies.get("__Host-give_dn_GVABCDEFG")?.value).toBe(TOKEN)
  })

  it.each([
    ["a wrong token", { status_token_hash: `\\x${"0".repeat(64)}` }],
    ["an expired token", { status_token_expires_at: "2000-01-01T00:00:00.000Z" }],
    ["a signed-in donor's row (no guest token)", { status_token_hash: null, status_token_expires_at: null }],
    ["an unknown donation code", null],
  ])("returns 404 without setting or clearing cookies for %s", async (_name, overrides) => {
    state.serviceHandler = () => (overrides === null ? { data: null } : row(overrides))
    const response = await GET(trackRequest({ headers: { cookie: `__Host-give_dn_GVABCDEFG=${"f".repeat(64)}` } }), {
      params: Promise.resolve({ code: "GVABCDEFG" }),
    })
    expect(response.status).toBe(404)
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.cookies.getAll()).toHaveLength(0)
    const body = await response.text()
    expect(body).not.toContain(TOKEN)
    expect(body).not.toContain("Private Guest")
    expect(body).not.toContain("private@example.com")
  })

  it.each([
    ["missing token", "GVABCDEFG", null],
    ["short token", "GVABCDEFG", "short"],
    ["uppercase token", "GVABCDEFG", "A".repeat(64)],
    ["non-hex token", "GVABCDEFG", "g".repeat(64)],
    ["too-long token", "GVABCDEFG", "a".repeat(65)],
    ["malformed code", "GV0OIL123", TOKEN],
    ["path-traversal code", "..", TOKEN],
  ])("returns 404 without asking the database for %s", async (_name, code, token) => {
    const response = await GET(trackRequest({ code, token }), { params: Promise.resolve({ code }) })
    expect(response.status).toBe(404)
    expect(response.cookies.getAll()).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it.each([
    ["an image subresource", { "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" }],
    ["an iframe embed", { "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" }],
    ["a background fetch", { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" }],
  ])("refuses %s with 404 before querying or setting cookies", async (_name, headers) => {
    const response = await GET(trackRequest({ headers }), { params: Promise.resolve({ code: "GVABCDEFG" }) })
    expect(response.status).toBe(404)
    expect(response.cookies.getAll()).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("allows top-level browser navigations", async () => {
    const response = await GET(
      trackRequest({ headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } }),
      { params: Promise.resolve({ code: "GVABCDEFG" }) }
    )
    expect(response.status).toBe(303)
  })

  it("selects payment columns only and never logs the secret token on database failure", async () => {
    await GET(trackRequest(), { params: Promise.resolve({ code: "GVABCDEFG" }) })
    const selected = String(op(state.serviceCalls[0], "select")?.[0])
    expect(selected).not.toContain("*")
    for (const pii of ["guest_name", "guest_email", "public_name", "message", "is_anonymous"]) {
      expect(selected).not.toContain(pii)
    }

    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    state.serviceHandler = () => ({ error: { code: "XX000", message: `boom ${TOKEN}` } })
    const failed = await GET(trackRequest(), { params: Promise.resolve({ code: "GVABCDEFG" }) })
    expect(failed.status).toBe(503)
    expect(failed.headers.get("referrer-policy")).toBe("no-referrer")
    expect(failed.headers.get("cache-control")).toBe("private, no-store")
    expect(await failed.text()).not.toContain("boom")
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN)
    log.mockRestore()
  })
})
