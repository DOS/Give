import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const TOKEN = "a".repeat(64)
const COOKIE_TOKEN = "0123456789abcdef".repeat(4)
// sha256(decode(COOKIE_TOKEN, 'hex')), as Postgres computes it.
const COOKIE_TOKEN_SHA256 = "4884fdaafea47c29fea7159d0daddd9c085d6200e1359e85bb81736af6b7c837"

const state = vi.hoisted(() => ({
  session: null as { user: { id: string; email: null; name: null }; accessToken: string } | null,
  anonHandler: (() => undefined) as Handler,
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  anonCalls: [] as Call[],
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => state.session) }))
vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) =>
    token
      ? fakeDb((call) => state.userHandler(call), state.userCalls)
      : fakeDb((call) => state.anonHandler(call), state.anonCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { GET } = await import("./route")

function request(options: { token?: string; code?: string; cookie?: string } = {}) {
  const url = new URL("http://localhost/api/contributions/status")
  if (options.code) url.searchParams.set("code", options.code)
  const headers: Record<string, string> = {}
  if (options.token !== undefined) headers["x-give-status-token"] = options.token
  if (options.cookie !== undefined) headers.cookie = options.cookie
  return new NextRequest(url, { headers })
}

beforeEach(() => {
  state.session = null
  state.anonHandler = () => undefined
  state.userHandler = () => undefined
  state.serviceHandler = () => undefined
  state.anonCalls.length = 0
  state.userCalls.length = 0
  state.serviceCalls.length = 0
})

// docs/Give-Technical-Design.md section 8, test 18, at the API level: the
// right token shows the status, a wrong or expired one gets 404, and anon
// never reads give.contributions (the DB side is DOS-Me's pgTAP test).
describe("GET /api/contributions/status (guest token)", () => {
  it("returns only status and received amount for the right token", async () => {
    state.serviceHandler = (call) =>
      call.target === "rpc:get_contribution_status"
        ? { data: { status: "received", received_amount: 200000, reference_code: "GVABCDEFG" } }
        : undefined
    const response = await GET(request({ token: TOKEN }))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ status: "received", received_amount: 200000 })
    expect(state.serviceCalls).toHaveLength(1)
    expect(op(state.serviceCalls[0], "args")).toEqual([{ p_status_token: TOKEN }])
    expect(op(state.serviceCalls[0], "select")).toEqual(["status, received_amount"])
  })

  it("gives 404 for a wrong or expired token (the RPC returns no row)", async () => {
    state.serviceHandler = () => ({ data: null })
    const response = await GET(request({ token: "b".repeat(64) }))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "not_found" })
  })

  it.each([
    ["", "short"],
    ["upper", "A".repeat(64)],
    ["non-hex", "g".repeat(64)],
    ["too long", "a".repeat(65)],
  ])("gives 404 for a malformed token (%s) without asking the database", async (_name, token) => {
    const response = await GET(request({ token }))
    expect(response.status).toBe(404)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("never reads contributions as anon", async () => {
    state.serviceHandler = () => ({ data: { status: "awaiting_transfer", received_amount: 0 } })
    await GET(request({ token: TOKEN }))
    await GET(request({ token: "c".repeat(64) }))
    await GET(request({ code: "GVABCDEFG" }))
    expect(state.anonCalls).toHaveLength(0)
    expect(state.serviceCalls.every((call) => call.target === "rpc:get_contribution_status")).toBe(true)
  })

  it("does not leak database errors", async () => {
    state.serviceHandler = () => ({ error: { code: "XX000", message: "internal detail" } })
    const response = await GET(request({ token: TOKEN }))
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain("internal")
  })
})

describe("GET /api/contributions/status (signed in)", () => {
  it("gives 404 without a session", async () => {
    const response = await GET(request({ code: "GVABCDEFG" }))
    expect(response.status).toBe(404)
  })

  it("gives 404 for a malformed code", async () => {
    state.session = { user: { id: USER, email: null, name: null }, accessToken: "jwt" }
    const response = await GET(request({ code: "GV0OIL123" }))
    expect(response.status).toBe(404)
    expect(state.userCalls).toHaveLength(0)
  })

  it("reads the donor's own donation under RLS", async () => {
    state.session = { user: { id: USER, email: null, name: null }, accessToken: "jwt" }
    state.userHandler = () => ({ data: { status: "awaiting_transfer", received_amount: 0 } })
    const response = await GET(request({ code: "GVABCDEFG" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "awaiting_transfer", received_amount: 0 })
    const call = state.userCalls[0]
    expect(call.target).toBe("contributions")
    expect(op(call, "select")).toEqual(["status, received_amount"])
    expect(call.ops).toContainEqual(["eq", "reference_code", "GVABCDEFG"])
    expect(call.ops).toContainEqual(["eq", "contributor_user_id", USER])
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("gives 404 for someone else's code", async () => {
    state.session = { user: { id: USER, email: null, name: null }, accessToken: "jwt" }
    state.userHandler = () => ({ data: null })
    expect((await GET(request({ code: "GVABCDEFG" }))).status).toBe(404)
  })

  it("gives 401 when PostgREST rejects the session token", async () => {
    state.session = { user: { id: USER, email: null, name: null }, accessToken: "jwt" }
    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWT expired" } })
    expect((await GET(request({ code: "GVABCDEFG" }))).status).toBe(401)
  })
})

describe("GET /api/contributions/status (guest cookie from the payment page)", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    data: {
      id: "33333333-3333-4333-8333-333333333333",
      campaign_id: "22222222-2222-4222-8222-222222222222",
      intended_amount: 200000,
      received_amount: 150000,
      reference_code: "GVABCDEFG",
      status: "received",
      created_at: "2026-11-01T00:00:00.000Z",
      status_token_hash: `\\x${COOKIE_TOKEN_SHA256}`,
      status_token_expires_at: "2999-01-01T00:00:00.000Z",
      ...overrides,
    },
  })

  it("returns only status and received amount when the cookie token matches the code", async () => {
    state.serviceHandler = () => row()
    const response = await GET(request({ code: "GVABCDEFG", cookie: `give_dn_GVABCDEFG=${COOKIE_TOKEN}` }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "received", received_amount: 150000 })
    expect(state.anonCalls).toHaveLength(0)
  })

  it("gives 404 for a cookie set for another code, without asking the database", async () => {
    const response = await GET(request({ code: "GVABCDEFG", cookie: `give_dn_GVABCDEFH=${COOKIE_TOKEN}` }))
    expect(response.status).toBe(404)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it.each([
    ["a token that is not this donation's", { status_token_hash: `\\x${"0".repeat(64)}` }],
    ["an expired token", { status_token_expires_at: "2000-01-01T00:00:00.000Z" }],
  ])("gives 404 for %s", async (_name, overrides) => {
    state.serviceHandler = () => row(overrides)
    const response = await GET(request({ code: "GVABCDEFG", cookie: `give_dn_GVABCDEFG=${COOKIE_TOKEN}` }))
    expect(response.status).toBe(404)
  })
})
