import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Result } from "@/test/fake-db"

const SECRET = "0123456789abcdef0123"

const state = vi.hoisted(() => ({ calls: [] as unknown[], answer: {} as unknown }))

vi.mock("@/lib/supabase", () => ({
  dbService: () => fakeDb(() => state.answer as Result, state.calls as Call[]),
}))

const { GET } = await import("./route")

function request(authorization?: string) {
  const headers: Record<string, string> = {}
  if (authorization !== undefined) headers.authorization = authorization
  return new NextRequest("http://localhost/api/cron/purge-outbox", { headers })
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET)
  state.calls = []
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/cron/purge-outbox", () => {
  it("refuses a request without the cron secret", async () => {
    expect((await GET(request())).status).toBe(401)
    expect(state.calls).toHaveLength(0)
  })

  it("runs the purge and returns its counts", async () => {
    state.answer = { data: { deleted_accounts: 1, cleared: 20, expired_tokens: 3 } }
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted_accounts: 1, cleared: 20, expired_tokens: 3 })
    expect((state.calls[0] as Call).target).toBe("rpc:purge_outbox")
    expect(op(state.calls[0] as Call, "args")).toEqual([undefined])
  })

  it("answers 500 when the purge fails or answers unexpectedly", async () => {
    state.answer = { error: { code: "57014", message: "timeout" } }
    expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(500)
    state.answer = { data: [] }
    expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(500)
  })
})
