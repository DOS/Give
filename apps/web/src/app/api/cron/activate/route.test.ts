import { revalidatePath } from "next/cache"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const SECRET = "0123456789abcdef0123"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase", () => ({
  dbService: () => fakeDb((call) => state.handler(call), state.calls),
}))

const { GET } = await import("./route")

function request(authorization?: string) {
  const headers: Record<string, string> = {}
  if (authorization !== undefined) headers.authorization = authorization
  return new NextRequest("http://localhost/api/cron/activate", { headers })
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET)
  state.handler = () => undefined
  state.calls.length = 0
  vi.mocked(revalidatePath).mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/cron/activate", () => {
  it.each([
    ["no header", undefined],
    ["a wrong secret", `Bearer ${SECRET}x`],
    ["the secret without Bearer", SECRET],
  ])("refuses %s without touching the database or revalidating", async (_name, authorization) => {
    const response = await GET(request(authorization))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "unauthorized" })
    expect(state.calls).toHaveLength(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("refuses every request when CRON_SECRET is missing or too short", async () => {
    vi.stubEnv("CRON_SECRET", "")
    expect((await GET(request("Bearer "))).status).toBe(401)

    vi.stubEnv("CRON_SECRET", "short")
    expect((await GET(request("Bearer short"))).status).toBe(401)
    expect(state.calls).toHaveLength(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("activates due campaigns, revalidates downstream routes when activated > 0, and skips revalidation on 0", async () => {
    const campaigns = [
      { id: "a", status: "approved", due: true },
      { id: "b", status: "approved", due: true },
      { id: "c", status: "approved", due: false },
    ]
    state.handler = (call) => {
      if (call.target !== "rpc:activate_scheduled_campaigns") return undefined
      const due = campaigns.filter((c) => c.status === "approved" && c.due)
      for (const c of due) c.status = "live"
      return { data: due.length }
    }

    const first = await GET(request(`Bearer ${SECRET}`))
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ activated: 2 })
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ["/"],
      ["/campaigns"],
      ["/campaigns/[slug]", "page"],
      ["/me/campaigns"],
      ["/me/campaigns/[id]", "page"],
      ["/admin"],
    ])

    vi.mocked(revalidatePath).mockClear()
    const second = await GET(request(`Bearer ${SECRET}`))
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ activated: 0 })
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(state.calls.map((c) => c.target)).toEqual([
      "rpc:activate_scheduled_campaigns",
      "rpc:activate_scheduled_campaigns",
    ])
    expect(op(state.calls[0], "args")).toEqual([undefined])
  })

  it.each([[null], [undefined], ["2"], [-1], [1.5], [Number.NaN], [{}], [[]]])(
    "answers 500 without revalidating on an unexpected RPC result %j",
    async (data) => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {})
      state.handler = () => ({ data })
      try {
        const response = await GET(request(`Bearer ${SECRET}`))
        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({ error: "activation_failed" })
        expect(revalidatePath).not.toHaveBeenCalled()
      } finally {
        spy.mockRestore()
      }
    }
  )

  it("answers 500 without details when the RPC returns an error or throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      state.handler = () => ({ error: { code: "57014", message: "statement timeout" } })
      const erred = await GET(request(`Bearer ${SECRET}`))
      expect(erred.status).toBe(500)
      expect(await erred.json()).toEqual({ error: "activation_failed" })
      expect(revalidatePath).not.toHaveBeenCalled()

      state.handler = () => {
        throw new Error("connection reset")
      }
      const thrown = await GET(request(`Bearer ${SECRET}`))
      expect(thrown.status).toBe(500)
      expect(await thrown.json()).toEqual({ error: "activation_failed" })
      expect(revalidatePath).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
