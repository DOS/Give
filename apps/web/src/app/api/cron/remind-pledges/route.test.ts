import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, type Call, type Handler } from "@/test/fake-db"

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
  return new NextRequest("http://localhost/api/cron/remind-pledges", { headers })
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET)
  state.handler = () => undefined
  state.calls.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/cron/remind-pledges", () => {
  it.each([
    ["no header", undefined],
    ["a wrong secret", `Bearer ${SECRET}x`],
  ])("refuses %s without touching the database", async (_name, authorization) => {
    const response = await GET(request(authorization))
    expect(response.status).toBe(401)
    expect(state.calls).toHaveLength(0)
  })

  it("sends each day's reminder once; a second run creates nothing", async () => {
    // give.remind_pledge_payments dedupes on payment_reminder:<pledge>:<day>.
    const sent = new Set<string>()
    state.handler = (call) => {
      if (call.target !== "rpc:remind_pledge_payments") return undefined
      let created = 0
      for (const key of ["a:1", "b:3"]) {
        if (!sent.has(key)) {
          sent.add(key)
          created++
        }
      }
      return { data: created }
    }
    expect(await (await GET(request(`Bearer ${SECRET}`))).json()).toEqual({ reminded: 2 })
    expect(await (await GET(request(`Bearer ${SECRET}`))).json()).toEqual({ reminded: 0 })
  })

  it("answers 500 when the RPC fails or answers unexpectedly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    state.handler = () => ({ error: { code: "57014", message: "timeout" } })
    const failed = await GET(request(`Bearer ${SECRET}`))
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: "remind_failed" })

    state.handler = () => ({ data: "2" })
    expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(500)
  })
})
