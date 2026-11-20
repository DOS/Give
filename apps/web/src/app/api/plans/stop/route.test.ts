import { createHash } from "node:crypto"

import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { signStopToken } from "@/server/plans/stop-link"
import { fakeDb, op, type Call, type Result } from "@/test/fake-db"

const SECRET = "test-secret-at-least-16"
const TOKEN = "cd".repeat(32)
const HASH = createHash("sha256").update(Buffer.from(TOKEN, "hex")).digest("hex")

const state = vi.hoisted(() => ({ result: {} as Result, calls: [] as Call[] }))

vi.mock("@/lib/supabase", () => ({
  dbService: () => fakeDb(() => state.result, state.calls),
}))

const { GET, POST } = await import("./route")

let signed: string

function post(query: string, body: Record<string, string> | null) {
  const form = body ? new URLSearchParams(body).toString() : undefined
  return new NextRequest(`https://give.vn/api/plans/stop${query}`, {
    method: "POST",
    headers: body ? { "content-type": "application/x-www-form-urlencoded" } : {},
    body: form,
  })
}

const q = () => `?t=${encodeURIComponent(signed)}`

beforeEach(() => {
  vi.stubEnv("GIVE_RATE_LIMIT_SECRET", SECRET)
  signed = signStopToken(TOKEN, SECRET)!
  state.result = {
    data: [{ state: "stopped", campaign_title: "Nước sạch", campaign_slug: "nuoc-sach", amount: 200000 }],
  }
  state.calls.length = 0
  vi.spyOn(console, "error").mockImplementation(() => {})
  return () => vi.unstubAllEnvs()
})

describe("GET /api/plans/stop", () => {
  it("only shows the confirmation page, so prefetching stops nothing", () => {
    const response = GET(new NextRequest(`https://give.vn/api/plans/stop${q()}`))
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(`https://give.vn/plans/stop?t=${encodeURIComponent(signed)}`)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow")
    expect(state.calls).toHaveLength(0)
  })

  it("drops a link whose signature does not check out", () => {
    const response = GET(new NextRequest(`https://give.vn/api/plans/stop?t=${TOKEN}.AAAAAAAAAAAAAAAAAAAAAA`))
    expect(response.headers.get("location")).toBe("https://give.vn/plans/stop")
  })
})

describe("POST /api/plans/stop", () => {
  it("answers a mail client's one-click unsubscribe (RFC 8058) with the token's hash", async () => {
    const response = await POST(post(q(), { "List-Unsubscribe": "One-Click" }))
    expect(response.status).toBe(200)
    expect(state.calls.map((c) => c.target)).toEqual(["rpc:cancel_donation_plan_by_token"])
    expect(op(state.calls[0], "args")).toEqual([{ p_token_hash: `\\x${HASH}` }])
  })

  it("sends the page's form back to the page with the result and the token, so the page can confirm it", async () => {
    const response = await POST(post("", { t: signed }))
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(
      `https://give.vn/plans/stop?t=${encodeURIComponent(signed)}&result=done`
    )
  })

  it.each([
    ["expired", "expired", 410],
    ["invalid", "invalid", 404],
    ["unexpected", "invalid", 404],
  ])("maps the state %s", async (dbState, result, status) => {
    state.result = { data: [{ state: dbState, campaign_title: null, campaign_slug: null, amount: null }] }
    const page = await POST(post("", { t: signed }))
    expect(page.headers.get("location")).toBe(`https://give.vn/plans/stop?result=${result}`)
    const oneClick = await POST(post(q(), { "List-Unsubscribe": "One-Click" }))
    expect(oneClick.status).toBe(status)
  })

  it.each([
    ["a malformed token", "?t=nope"],
    ["a forged signature", `?t=${TOKEN}.AAAAAAAAAAAAAAAAAAAAAA`],
    ["no token", ""],
  ])("never calls the database with %s", async (_name, query) => {
    const oneClick = await POST(post(query, { "List-Unsubscribe": "One-Click" }))
    expect(oneClick.status).toBe(400)
    const page = await POST(post(query, null))
    expect(page.headers.get("location")).toBe("https://give.vn/plans/stop?result=invalid")
    expect(state.calls).toHaveLength(0)
  })

  it("refuses every link when the server has no secret", async () => {
    vi.stubEnv("GIVE_RATE_LIMIT_SECRET", "")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    const response = await POST(post(q(), { "List-Unsubscribe": "One-Click" }))
    expect(response.status).toBe(400)
    expect(state.calls).toHaveLength(0)
  })

  it("asks to try again when the database fails", async () => {
    state.result = { error: { code: "57014", message: "timeout" } }
    const page = await POST(post("", { t: signed }))
    expect(page.headers.get("location")).toBe(`https://give.vn/plans/stop?t=${encodeURIComponent(signed)}&result=error`)
    const oneClick = await POST(post(q(), { "List-Unsubscribe": "One-Click" }))
    expect(oneClick.status).toBe(503)
  })
})
