import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const SECRET = "0123456789abcdef0123"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
}))

vi.mock("@/lib/supabase", () => ({
  dbService: () => fakeDb((call) => state.handler(call), state.calls),
}))

const { GET } = await import("./route")

function request(authorization?: string) {
  const headers: Record<string, string> = {}
  if (authorization !== undefined) headers.authorization = authorization
  return new NextRequest("http://localhost/api/cron/reprocess-inbound", { headers })
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET)
  state.handler = () => undefined
  state.calls.length = 0
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// The processing itself is tested in src/server/inbound/index.test.ts.
describe("GET /api/cron/reprocess-inbound", () => {
  it.each([
    ["no header", undefined],
    ["a wrong secret", `Bearer ${SECRET}x`],
    ["the secret without Bearer", SECRET],
  ])("refuses %s without touching the database", async (_name, authorization) => {
    const response = await GET(request(authorization))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "unauthorized" })
    expect(state.calls).toHaveLength(0)
  })

  it("refuses every request when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "")
    const response = await GET(request("Bearer "))
    expect(response.status).toBe(401)
    expect(state.calls).toHaveLength(0)
  })

  it("with no channel processor yet, only counts pending events and writes nothing", async () => {
    state.handler = () => ({ count: 4 })
    for (let run = 0; run < 2; run += 1) {
      const response = await GET(request(`Bearer ${SECRET}`))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ processed: 0, failed: 0, waiting: 4 })
    }
    expect(state.calls.map((c) => c.target)).toEqual(["inbound_events", "inbound_events"])
    expect(op(state.calls[0], "select")).toEqual(["id", { count: "exact", head: true }])
    expect(op(state.calls[0], "is")).toEqual(["processed_at", null])
    expect(op(state.calls[0], "eq")).toEqual(["signature_valid", true])
  })

  it("answers 500 without details when the events cannot be read", async () => {
    state.handler = () => ({ error: { code: "42501", message: "permission denied for table inbound_events" } })
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "reprocess_failed" })
  })
})
