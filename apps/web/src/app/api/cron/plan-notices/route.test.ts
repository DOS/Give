import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const SECRET = "0123456789abcdef0123"
const PLAN = "10000000-0000-4000-8000-000000000001"
const PLAN_2 = "20000000-0000-4000-8000-000000000002"

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
  return new NextRequest("http://localhost/api/cron/plan-notices", { headers })
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET)
  state.handler = () => undefined
  state.calls.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("GET /api/cron/plan-notices", () => {
  it.each([
    ["no header", undefined],
    ["a wrong secret", `Bearer ${SECRET}x`],
  ])("refuses %s without touching the database", async (_name, authorization) => {
    const response = await GET(request(authorization))
    expect(response.status).toBe(401)
    expect(state.calls).toHaveLength(0)
  })

  it("tells each ended plan once and runs the second reminders; a second run writes nothing", async () => {
    // give.plan_end_notices sets ended_notice_at with the notice, so a plan is noticed once.
    const noticed = new Set<string>()
    state.handler = (call) => {
      const after = (op(call, "args")?.[0] as { p_after: string | null } | undefined)?.p_after
      if (call.target === "rpc:plan_end_notices" && after === null && !noticed.has(PLAN)) {
        noticed.add(PLAN)
        return { data: [{ plan_id: PLAN, outcome: "noticed" }] }
      }
      return { data: [] }
    }
    expect(await (await GET(request(`Bearer ${SECRET}`))).json()).toEqual({
      ended: { noticed: 1 },
      followups: {},
      done: true,
    })
    expect(await (await GET(request(`Bearer ${SECRET}`))).json()).toEqual({ ended: {}, followups: {}, done: true })
    expect(state.calls.filter((c) => c.target === "rpc:plan_followups")).toHaveLength(2)
  })

  it("emits structured zero-PII alerts when either sweep records 'failed' outcomes", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    state.handler = (call) => {
      const after = (op(call, "args")?.[0] as { p_after: string | null }).p_after
      if (call.target === "rpc:plan_end_notices") {
        if (after === null) return { data: [{ plan_id: PLAN, outcome: "failed" }] }
        return { data: [] }
      }
      if (call.target === "rpc:plan_followups") {
        if (after === null) return { data: [{ plan_id: PLAN_2, outcome: "failed" }] }
        return { data: [] }
      }
      return { data: [] }
    }
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ended: { failed: 1 },
      followups: { failed: 1 },
      done: true,
    })

    const parsed = error.mock.calls.map(([arg]) => JSON.parse(String(arg)) as Record<string, unknown>)
    expect(parsed).toContainEqual({
      event: "plan_cron.failed_outcomes",
      route: "plan-notices",
      job: "plan_end_notices",
      failed: 1,
      calls: 2,
      done: true,
    })
    expect(parsed).toContainEqual({
      event: "plan_cron.failed_outcomes",
      route: "plan-notices",
      job: "plan_followups",
      failed: 1,
      calls: 2,
      done: true,
    })
  })

  it("isolates step failures: plan_followups still runs within budget if plan_end_notices fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    state.handler = (call) => {
      if (call.target === "rpc:plan_end_notices") return { error: { code: "57014", message: "timeout" } }
      const after = (op(call, "args")?.[0] as { p_after: string | null }).p_after
      return { data: after === null ? [{ plan_id: PLAN, outcome: "reminded" }] : [] }
    }
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "notices_failed" })
    expect(state.calls.filter((c) => c.target === "rpc:plan_followups")).toHaveLength(2)
  })

  it("shares one deadline: past the budget the second reminders wait for the next run", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      const start = Date.now()
      state.handler = (call) => {
        if (call.target !== "rpc:plan_end_notices") return { data: [] }
        // The end notices take the whole budget.
        vi.setSystemTime(start + 46_000)
        const after = (op(call, "args")?.[0] as { p_after: string | null }).p_after
        return { data: after === null ? [{ plan_id: PLAN, outcome: "noticed" }] : [] }
      }
      expect(await (await GET(request(`Bearer ${SECRET}`))).json()).toEqual({
        ended: { noticed: 1 },
        followups: {},
        done: false,
      })
      expect(state.calls.some((c) => c.target === "rpc:plan_followups")).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("answers 500 when a call fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    state.handler = (call) =>
      call.target === "rpc:plan_end_notices" ? { data: [] } : { error: { code: "XX000", message: "boom" } }
    const failed = await GET(request(`Bearer ${SECRET}`))
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: "notices_failed" })
  })
})
