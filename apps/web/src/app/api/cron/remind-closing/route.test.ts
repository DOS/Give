import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, type Call, type Handler } from "@/test/fake-db"

const SECRET = "0123456789abcdef0123"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  rpcMock: null as ReturnType<typeof vi.fn> | null,
}))

vi.mock("@/lib/supabase", () => ({
  dbService: () => {
    const db = fakeDb((call) => state.handler(call), state.calls)
    return {
      ...db,
      rpc: (fn: string, args?: unknown) => (state.rpcMock ? state.rpcMock(fn, args) : db.rpc(fn, args)),
    }
  },
}))

const { GET } = await import("./route")

function request(authorization?: string) {
  const headers: Record<string, string> = {}
  if (authorization !== undefined) headers.authorization = authorization
  return new NextRequest("http://localhost/api/cron/remind-closing", { headers })
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET)
  state.handler = () => undefined
  state.calls.length = 0
  state.rpcMock = null
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("GET /api/cron/remind-closing (DOS/Give#337)", () => {
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

  it("runs once when a single batch returns fewer than 10,000 rows", async () => {
    state.handler = (call) => (call.target === "rpc:remind_closing_campaigns" ? { data: 42 } : undefined)

    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ reminded: 42 })
    expect(state.calls).toHaveLength(1)
    expect(state.calls[0].target).toBe("rpc:remind_closing_campaigns")
  })

  it("drains multiple full batches of 10,000 until a partial batch finishes", async () => {
    const batches = [10_000, 10_000, 3_456]
    let index = 0
    state.handler = (call) => {
      if (call.target !== "rpc:remind_closing_campaigns") return undefined
      return { data: batches[index++] ?? 0 }
    }

    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ reminded: 23_456 })
    expect(state.calls).toHaveLength(3)
  })

  it("caps draining at MAX_BATCHES = 5 when backlog exceeds 50,000 rows", async () => {
    state.handler = (call) => (call.target === "rpc:remind_closing_campaigns" ? { data: 10_000 } : undefined)

    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ reminded: 50_000 })
    expect(state.calls).toHaveLength(5)
  })

  it("answers 500 when the RPC fails, throws, or returns an unexpected value", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})

    state.handler = () => ({ error: { code: "57014", message: "timeout" } })
    const failed = await GET(request(`Bearer ${SECRET}`))
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: "remind_failed" })

    for (const bad of ["2", null, -1, 1.5, Number.NaN]) {
      state.handler = () => ({ data: bad })
      expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(500)
    }

    // Batch 1 full (10,000), batch 2 errors -> returns 500.
    let call = 0
    state.handler = () => (++call === 1 ? { data: 10_000 } : { error: { code: "57014", message: "timeout" } })
    expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(500)

    // Async Promise rejection from rpc() -> returns 500 { error: "remind_failed" }.
    const rpcMock = vi.fn().mockRejectedValueOnce(new Error("boom"))
    state.rpcMock = rpcMock
    const rejected = await GET(request(`Bearer ${SECRET}`))
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rejected.status).toBe(500)
    expect(await rejected.json()).toEqual({ error: "remind_failed" })
  })
})
