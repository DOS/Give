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
  return new NextRequest("http://localhost/api/cron/finalize-ended", { headers })
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET)
  state.handler = () => undefined
  state.calls.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/cron/finalize-ended", () => {
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

  it("closes ended campaigns once; a second run changes nothing", async () => {
    // give.finalize_ended_campaigns closes live give campaigns past ends_at.
    const campaigns = [
      { id: "a", status: "live", ended: true },
      { id: "b", status: "live", ended: true },
      { id: "c", status: "live", ended: false },
    ]
    state.handler = (call) => {
      if (call.target !== "rpc:finalize_ended_campaigns") return undefined
      const due = campaigns.filter((c) => c.status === "live" && c.ended)
      for (const c of due) c.status = "closed"
      return { data: { closed: due.length, failed: 0 } }
    }

    const first = await GET(request(`Bearer ${SECRET}`))
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ closed: 2, failed: 0 })
    const after = structuredClone(campaigns)

    const second = await GET(request(`Bearer ${SECRET}`))
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ closed: 0, failed: 0 })
    expect(campaigns).toEqual(after)
    expect(campaigns.map((c) => c.status)).toEqual(["closed", "closed", "live"])
    expect(state.calls.map((c) => c.target)).toEqual(["rpc:finalize_ended_campaigns", "rpc:finalize_ended_campaigns"])
    expect(op(state.calls[0], "args")).toEqual([undefined])
  })

  it("reports campaigns that failed to close while the others close", async () => {
    // Each campaign closes in its own subtransaction; a failure is counted and
    // written to give.audit_log, and the next run tries it again.
    state.handler = () => ({ data: { closed: 2, failed: 1 } })
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ closed: 2, failed: 1 })
    expect(error).toHaveBeenCalledWith(expect.stringContaining("failed to finalize"), 1)
  })

  it("reads the counts from a one-row array too", async () => {
    state.handler = () => ({ data: [{ closed: 1, failed: 0 }] })
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(await response.json()).toEqual({ closed: 1, failed: 0 })
  })

  it("reads the bare count of the function before the per-campaign version", async () => {
    state.handler = () => ({ data: 3 })
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ closed: 3, failed: 0 })
  })

  it.each([[null], ["3"], [{ closed: 1 }], [[]]])("answers 500 on an unexpected result %j", async (data) => {
    state.handler = () => ({ data })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "finalize_failed" })
  })

  it("answers 500 without details when the RPC fails", async () => {
    state.handler = () => ({ error: { code: "57014", message: "canceling statement due to statement timeout" } })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "finalize_failed" })
  })
})
