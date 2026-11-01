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
      return { data: due.length }
    }

    const first = await GET(request(`Bearer ${SECRET}`))
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ finalized: 2 })
    const after = structuredClone(campaigns)

    const second = await GET(request(`Bearer ${SECRET}`))
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ finalized: 0 })
    expect(campaigns).toEqual(after)
    expect(campaigns.map((c) => c.status)).toEqual(["closed", "closed", "live"])
    expect(state.calls.map((c) => c.target)).toEqual(["rpc:finalize_ended_campaigns", "rpc:finalize_ended_campaigns"])
    expect(op(state.calls[0], "args")).toEqual([undefined])
  })

  it("answers 500 without details when the RPC fails", async () => {
    state.handler = () => ({ error: { code: "57014", message: "canceling statement due to statement timeout" } })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "finalize_failed" })
  })
})
