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
  return new NextRequest("http://localhost/api/cron/lapse-pledges", { headers })
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET)
  state.handler = () => undefined
  state.calls.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/cron/lapse-pledges", () => {
  it.each([
    ["no header", undefined],
    ["a wrong secret", `Bearer ${SECRET}x`],
    ["the secret without Bearer", SECRET],
  ])("refuses %s without touching the database", async (_name, authorization) => {
    const response = await GET(request(authorization))
    expect(response.status).toBe(401)
    expect(state.calls).toHaveLength(0)
  })

  it("refuses every request when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "")
    expect((await GET(request("Bearer "))).status).toBe(401)
    expect(state.calls).toHaveLength(0)
  })

  it("lapses overdue pledges once; a second run changes nothing", async () => {
    // give.lapse_overdue_pledges: unpaid -> lapsed, part paid -> refund_due.
    const pledges = [
      { id: "a", status: "payment_due", received: 0, overdue: true },
      { id: "b", status: "partially_paid", received: 50_000, overdue: true },
      { id: "c", status: "payment_due", received: 0, overdue: false },
    ]
    state.handler = (call) => {
      if (call.target !== "rpc:lapse_overdue_pledges") return undefined
      let lapsed = 0
      let refundDue = 0
      for (const p of pledges) {
        if (!p.overdue || (p.status !== "payment_due" && p.status !== "partially_paid")) continue
        if (p.received > 0) {
          p.status = "refund_due"
          refundDue++
        } else {
          p.status = "lapsed"
          lapsed++
        }
      }
      return { data: { lapsed, refund_due: refundDue, failed: 0 } }
    }

    const first = await GET(request(`Bearer ${SECRET}`))
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ lapsed: 1, refund_due: 1, failed: 0 })
    const second = await GET(request(`Bearer ${SECRET}`))
    expect(await second.json()).toEqual({ lapsed: 0, refund_due: 0, failed: 0 })
    expect(pledges.map((p) => p.status)).toEqual(["lapsed", "refund_due", "payment_due"])
    expect(op(state.calls[0], "args")).toEqual([undefined])
  })

  it("reports campaigns that failed while the others went on, and reads a one-row array", async () => {
    state.handler = () => ({ data: [{ lapsed: 2, refund_due: 0, failed: 1 }] })
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(await response.json()).toEqual({ lapsed: 2, refund_due: 0, failed: 1 })
    expect(error).toHaveBeenCalledWith(expect.stringContaining("failed to lapse"), 1)
  })

  it.each([[null], [3], [{ lapsed: 1, failed: 0 }], [[]]])("answers 500 on an unexpected result %j", async (data) => {
    state.handler = () => ({ data })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "lapse_failed" })
  })

  it("answers 500 without details when the RPC fails", async () => {
    state.handler = () => ({ error: { code: "57014", message: "canceling statement due to statement timeout" } })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "lapse_failed" })
  })
})
