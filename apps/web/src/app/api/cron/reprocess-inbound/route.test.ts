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

  it("refuses every request when CRON_SECRET is too short to be one", async () => {
    vi.stubEnv("CRON_SECRET", "short")
    const response = await GET(request("Bearer short"))
    expect(response.status).toBe(401)
    expect(state.calls).toHaveLength(0)
  })

  it("runs the statement_import processor and counts other channels' events as waiting", async () => {
    // Four pending events of channels without a processor; none of statement_import.
    state.handler = (call) => (op(call, "select")?.[1] ? { count: 4 } : { data: [] })
    for (let run = 0; run < 2; run += 1) {
      const response = await GET(request(`Bearer ${SECRET}`))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ processed: 0, failed: 0, waiting: 4, parked: 4 })
    }
    expect(state.calls.every((c) => c.target === "inbound_events")).toBe(true)
    expect(op(state.calls[0], "select")).toEqual(["id", { count: "exact", head: true }])
    expect(state.calls[0].ops.filter(([name]) => name === "is")).toEqual([
      ["is", "processed_at", null],
      ["is", "parked_at", null],
    ])
    expect(op(state.calls[0], "eq")).toEqual(["signature_valid", true])
    expect(op(state.calls[0], "not")).toEqual(["channel", "in", "(statement_import)"])
    expect(op(state.calls[1], "in")).toEqual(["channel", ["statement_import"]])
    expect(op(state.calls[1], "eq")).toEqual(["signature_valid", true])
  })

  it("reports parked events so staff can retry them", async () => {
    // No pending events; three parked ones.
    state.handler = (call) => {
      if (!op(call, "select")?.[1]) return { data: [] }
      const parked = call.ops.some(([name, column]) => name === "not" && column === "parked_at")
      return { count: parked ? 3 : 0 }
    }
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(await response.json()).toEqual({ processed: 0, failed: 0, waiting: 0, parked: 3 })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("parked"), 3)
  })

  it("answers 500 without details when the events cannot be read", async () => {
    state.handler = () => ({ error: { code: "42501", message: "permission denied for table inbound_events" } })
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "reprocess_failed" })
  })
})
