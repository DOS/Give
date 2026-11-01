import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const NOTICE = "33333333-3333-4333-8333-333333333333"

type TestSession = { user: { id: string; email: null; name: null }; accessToken: string } | null

const state = vi.hoisted(() => ({
  session: null as TestSession,
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  serviceUsed: false,
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => state.session) }))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.handler(call), state.calls),
  dbService: () => {
    state.serviceUsed = true
    return fakeDb(() => undefined)
  },
}))

const { markAllNoticesRead, markNoticeRead } = await import("./actions")

const form = () => new FormData()

beforeEach(() => {
  state.session = { user: { id: USER, email: null, name: null }, accessToken: "token" }
  state.handler = () => undefined
  state.calls.length = 0
  state.serviceUsed = false
})

describe("markNoticeRead", () => {
  it("marks one unread notice of the signed-in user, with the user's own token", async () => {
    const result = await markNoticeRead(NOTICE, null, form())
    expect(result).toEqual({ ok: true, message: "Đã đánh dấu là đã đọc." })
    expect(state.calls).toHaveLength(1)
    const [call] = state.calls
    expect(call.target).toBe("notices")
    expect(Object.keys((op(call, "update") as [Record<string, unknown>])[0])).toEqual(["read_at"])
    expect(call.ops.filter(([name]) => name === "eq")).toEqual([
      ["eq", "id", NOTICE],
      ["eq", "user_id", USER],
    ])
    expect(op(call, "is")).toEqual(["read_at", null])
    expect(state.serviceUsed).toBe(false)
  })

  it("refuses a malformed id without a query", async () => {
    const result = await markNoticeRead("not-a-uuid", null, form())
    expect(result?.ok).toBe(false)
    expect(state.calls).toHaveLength(0)
  })

  it("asks a signed-out visitor to sign in again", async () => {
    state.session = null
    const result = await markNoticeRead(NOTICE, null, form())
    expect(result).toEqual({ ok: false, message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại." })
    expect(state.calls).toHaveLength(0)
  })

  it("shows a generic message when the update fails", async () => {
    state.handler = () => ({ error: { code: "42501", message: "permission denied for table notices" } })
    const result = await markNoticeRead(NOTICE, null, form())
    expect(result?.ok).toBe(false)
    expect(result?.message).not.toContain("permission denied")
  })
})

describe("markAllNoticesRead", () => {
  // PostgREST returns microseconds; the cutoff must reach the database unchanged.
  const NEWEST_SHOWN = "2026-11-02T02:00:00.123456+00:00"

  function allForm(before: string | null = NEWEST_SHOWN) {
    const f = form()
    if (before !== null) f.set("before", before)
    return f
  }

  it("marks the user's unread notices up to the newest one the page showed, and nothing else", async () => {
    const result = await markAllNoticesRead(null, allForm())
    expect(result).toEqual({ ok: true, message: "Đã đánh dấu tất cả là đã đọc." })
    const [call] = state.calls
    expect(call.target).toBe("notices")
    expect(call.ops.filter(([name]) => name === "eq")).toEqual([["eq", "user_id", USER]])
    expect(op(call, "is")).toEqual(["read_at", null])
    expect(op(call, "lte")).toEqual(["created_at", NEWEST_SHOWN])
    expect(state.serviceUsed).toBe(false)
  })

  it.each([
    ["no cutoff", null],
    ["a cutoff that is not a time", "yesterday-ish"],
    ["an oversized cutoff", `${NEWEST_SHOWN}${"0".repeat(40)}`],
  ])("refuses %s without a query", async (_name, before) => {
    expect((await markAllNoticesRead(null, allForm(before)))?.ok).toBe(false)
    expect(state.calls).toHaveLength(0)
  })

  it("asks a signed-out visitor to sign in again", async () => {
    state.session = null
    expect((await markAllNoticesRead(null, allForm()))?.ok).toBe(false)
    expect(state.calls).toHaveLength(0)
  })
})
