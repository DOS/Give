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
  return new NextRequest("http://localhost/api/cron/remind-unexplained", { headers })
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET)
  state.handler = () => undefined
  state.calls.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/cron/remind-unexplained", () => {
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

  it("reminds once per campaign per day; a second run the same day creates nothing", async () => {
    // give.remind_unexplained_spending: one explain_spending notice per
    // campaign with unexplained outgoing transactions, keyed by campaign and day.
    const unexplained = [
      { campaign: "a", organizer: "u1" },
      { campaign: "a", organizer: "u1" },
      { campaign: "b", organizer: "u2" },
    ]
    const notices = new Map<string, string>()
    const day = "2026-11-02"
    state.handler = (call) => {
      if (call.target !== "rpc:remind_unexplained_spending") return undefined
      let created = 0
      for (const tx of unexplained) {
        const key = `explain_spending:${tx.campaign}:${day}`
        if (!notices.has(key)) {
          notices.set(key, tx.organizer)
          created++
        }
      }
      return { data: created }
    }

    const first = await GET(request(`Bearer ${SECRET}`))
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ reminded: 2 })

    const second = await GET(request(`Bearer ${SECRET}`))
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ reminded: 0 })
    expect([...notices.values()]).toEqual(["u1", "u2"])
    expect(state.calls.map((c) => c.target)).toEqual([
      "rpc:remind_unexplained_spending",
      "rpc:remind_unexplained_spending",
    ])
    expect(op(state.calls[0], "args")).toEqual([undefined])
  })

  it("answers 500 without details when the RPC fails", async () => {
    state.handler = () => ({
      error: { code: "42883", message: "function give.remind_unexplained_spending() does not exist" },
    })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "remind_failed" })
  })
})
