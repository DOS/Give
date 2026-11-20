import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const SECRET = "0123456789abcdef0123"
const PLAN = "10000000-0000-4000-8000-000000000001"

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
