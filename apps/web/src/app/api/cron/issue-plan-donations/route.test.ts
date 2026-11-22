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
  return new NextRequest("http://localhost/api/cron/issue-plan-donations", { headers })
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

describe("GET /api/cron/issue-plan-donations", () => {
  it.each([
    ["no header", undefined],
    ["a wrong secret", `Bearer ${SECRET}x`],
  ])("refuses %s without touching the database", async (_name, authorization) => {
    const response = await GET(request(authorization))
    expect(response.status).toBe(401)
    expect(state.calls).toHaveLength(0)
  })

  it("issues each due month once, then expires past months; a retried run issues nothing", async () => {
    // give.issue_plan_donations: one plan per call, once per plan and month.
    const issued = new Set<string>()
    state.handler = (call) => {
      if (call.target === "rpc:expire_plan_donations") return { data: 1 }
      if (call.target !== "rpc:issue_plan_donations") return undefined
      const after = (op(call, "args")?.[0] as { p_after: string | null }).p_after
      if (after === null && !issued.has(PLAN)) {
        issued.add(PLAN)
        return { data: [{ plan_id: PLAN, outcome: "issued" }] }
      }
      return { data: [] }
    }
    expect(await (await GET(request(`Bearer ${SECRET}`))).json()).toEqual({ issued: 1, done: true, expired: 1 })
    expect(await (await GET(request(`Bearer ${SECRET}`))).json()).toEqual({ done: true, expired: 1 })
    expect(state.calls.map((c) => c.target)).toEqual([
      "rpc:issue_plan_donations",
      "rpc:issue_plan_donations",
      "rpc:expire_plan_donations",
      "rpc:issue_plan_donations",
      "rpc:expire_plan_donations",
    ])
  })

  it("emits a structured zero-PII alert when issue_plan_donations records 'failed' outcomes", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    state.handler = (call) => {
      if (call.target === "rpc:expire_plan_donations") return { data: 2 }
      const after = (op(call, "args")?.[0] as { p_after: string | null }).p_after
      if (after === null) return { data: [{ plan_id: PLAN, outcome: "failed" }] }
      if (after === PLAN) return { data: [{ plan_id: PLAN_2, outcome: "issued" }] }
      return { data: [] }
    }
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ failed: 1, issued: 1, done: true, expired: 2 })

    const parsed = error.mock.calls.map(([arg]) => JSON.parse(String(arg)) as Record<string, unknown>)
    expect(parsed).toContainEqual({
      event: "plan_cron.failed_outcomes",
      route: "issue-plan-donations",
      job: "issue_plan_donations",
      failed: 1,
      calls: 3,
      done: true,
    })
  })

  it("flags a stalled expiry batch with done=false and expire_stalled=true", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    state.handler = (call) => {
      if (call.target === "rpc:issue_plan_donations") return { data: [] }
      if (call.target === "rpc:expire_plan_donations") return { data: 0 }
      if (call.target === "contributions") return { data: [{ id: "99999999-9999-4999-8999-999999999999" }] }
      return undefined
    }
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ done: false, expired: 0, expire_stalled: true })
    expect(error).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(error.mock.calls[0][0]))).toEqual({
      event: "plan_job.expire_batch_stalled",
      job: "expire_plan_donations",
      batches: 1,
      expired: 0,
    })
  })

  it("isolates step failures: expiry still runs within budget if issue_plan_donations fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    state.handler = (call) => {
      if (call.target === "rpc:issue_plan_donations") return { error: { code: "57014", message: "timeout" } }
      if (call.target === "rpc:expire_plan_donations") return { data: 4 }
      return undefined
    }
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "issue_failed" })
    expect(state.calls.map((c) => c.target)).toEqual(["rpc:issue_plan_donations", "rpc:expire_plan_donations"])
  })

  it("shares one deadline: past the budget the expiry waits for the next run", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      const start = Date.now()
      state.handler = (call) => {
        if (call.target === "rpc:expire_plan_donations") return { data: 1 }
        // The one due plan takes the whole budget.
        vi.setSystemTime(start + 46_000)
        const after = (op(call, "args")?.[0] as { p_after: string | null }).p_after
        return { data: after === null ? [{ plan_id: PLAN, outcome: "issued" }] : [] }
      }
      expect(await (await GET(request(`Bearer ${SECRET}`))).json()).toEqual({ issued: 1, done: false, expired: null })
      expect(state.calls.some((c) => c.target === "rpc:expire_plan_donations")).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("answers 500 when a call fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    state.handler = () => ({ error: { code: "57014", message: "timeout" } })
    const failed = await GET(request(`Bearer ${SECRET}`))
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: "issue_failed" })

    state.handler = (call) => (call.target === "rpc:expire_plan_donations" ? { data: null } : { data: [] })
    expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(500)
  })
})
