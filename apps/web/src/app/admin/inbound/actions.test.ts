import { revalidatePath } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler, type Result } from "@/test/fake-db"

const FINANCE = "66666666-6666-4666-8666-666666666666"
const EVENT = "33333333-3333-4333-8333-333333333333"

const state = vi.hoisted(() => ({
  session: true,
  userId: "66666666-6666-4666-8666-666666666666",
  responses: {} as Record<string, Result>,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    state.session ? { user: { id: state.userId, email: null, name: null }, accessToken: "token" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.responses[call.target], state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { dismissInboundEvent, retryInboundEvent } = await import("./actions")

function form(values: Record<string, string> = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const PARKED = {
  id: EVENT,
  channel: "statement_import",
  dedupe_key: `v1:11111111-1111-4111-8111-111111111111:${"a".repeat(64)}:part2of5`,
  received_at: "2026-11-02T01:00:00Z",
  attempts: 10,
  last_attempt_at: "2026-11-02T02:00:00Z",
  last_error: "processing_timeout",
  parked_at: "2026-11-02T02:00:01Z",
}

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear()
  state.session = true
  state.userId = FINANCE
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.responses = {
    "rpc:is_admin": { data: true },
    parked_inbound_events: { data: PARKED },
  }
  state.serviceHandler = () => ({ data: null })
})

describe("retryInboundEvent", () => {
  it("sends a parked event back to the cron as the finance actor", async () => {
    const result = await retryInboundEvent(EVENT, null, form())

    expect(result?.ok).toBe(true)
    expect(result?.message).toContain("Đã gửi lại sự kiện")
    expect(state.serviceCalls.map((c) => c.target)).toEqual(["rpc:retry_inbound_event"])
    expect(op(state.serviceCalls[0], "args")).toEqual([{ p_inbound_event_id: EVENT, p_actor_id: FINANCE }])
    // The role and the parked event are read with the actor's own token first.
    expect(state.userCalls.map((c) => c.target)).toEqual(["rpc:is_admin", "parked_inbound_events"])
    expect(op(state.userCalls[0], "args")?.[0]).toEqual({ p_roles: ["finance", "admin"] })
    expect(op(state.userCalls[1], "eq")).toEqual(["id", EVENT])
    expect(revalidatePath).toHaveBeenCalledWith("/admin/inbound")
  })

  it("refuses staff who are not finance or admin, before the service role acts", async () => {
    state.responses["rpc:is_admin"] = { data: false }
    const result = await retryInboundEvent(EVENT, null, form())
    expect(result).toEqual({
      ok: false,
      message: "Chỉ nhân viên tài chính hoặc quản trị viên mới xử lý được sự kiện bị dừng.",
    })
    expect(state.serviceCalls).toEqual([])
  })

  it("refuses an event that is no longer parked", async () => {
    state.responses.parked_inbound_events = { data: null }
    const result = await retryInboundEvent(EVENT, null, form())
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("không còn chờ nhân viên xử lý")
    expect(state.serviceCalls).toEqual([])
  })

  it("words the database's refusal when the event changed meanwhile", async () => {
    state.serviceHandler = () => ({ error: { code: "23514", message: "GIVE_INBOUND_EVENT_NOT_PARKED" } })
    const result = await retryInboundEvent(EVENT, null, form())
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("không còn chờ nhân viên xử lý")
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("checks the session and the id before reading anything", async () => {
    state.session = false
    expect((await retryInboundEvent(EVENT, null, form()))?.message).toBe("Phiên đăng nhập đã hết. Hãy đăng nhập lại.")
    state.session = true
    expect((await retryInboundEvent("1 or 1=1", null, form()))?.ok).toBe(false)
    expect(state.userCalls).toEqual([])
    expect(state.serviceCalls).toEqual([])
  })
})

describe("dismissInboundEvent", () => {
  it("ends a parked event with the trimmed note as the finance actor", async () => {
    const result = await dismissInboundEvent(EVENT, null, form({ note: "  Test upload\r\nto the wrong account  " }))

    expect(result?.ok).toBe(true)
    expect(result?.message).toContain("Đã bỏ qua sự kiện")
    expect(state.serviceCalls.map((c) => c.target)).toEqual(["rpc:dismiss_inbound_event"])
    expect(op(state.serviceCalls[0], "args")).toEqual([
      { p_inbound_event_id: EVENT, p_actor_id: FINANCE, p_note: "Test upload\nto the wrong account" },
    ])
    expect(state.userCalls.map((c) => c.target)).toEqual(["rpc:is_admin", "parked_inbound_events"])
    expect(revalidatePath).toHaveBeenCalledWith("/admin/inbound")
  })

  it("requires a note of at most 1000 characters", async () => {
    expect(await dismissInboundEvent(EVENT, null, form({ note: "   " }))).toEqual({
      ok: false,
      message: "Ghi lý do bỏ qua sự kiện này.",
    })
    expect(await dismissInboundEvent(EVENT, null, form())).toEqual({
      ok: false,
      message: "Ghi lý do bỏ qua sự kiện này.",
    })
    expect(await dismissInboundEvent(EVENT, null, form({ note: "ồ".repeat(1001) }))).toEqual({
      ok: false,
      message: "Ghi chú tối đa 1000 ký tự.",
    })
    expect((await dismissInboundEvent(EVENT, null, form({ note: "ồ".repeat(1000) })))?.ok).toBe(true)
  })

  it("refuses staff who are not finance or admin, before the service role acts", async () => {
    state.responses["rpc:is_admin"] = { data: false }
    const result = await dismissInboundEvent(EVENT, null, form({ note: "not mine" }))
    expect(result?.ok).toBe(false)
    expect(result?.message).toBe("Chỉ nhân viên tài chính hoặc quản trị viên mới xử lý được sự kiện bị dừng.")
    expect(state.serviceCalls).toEqual([])
  })

  it("refuses an event that is no longer parked", async () => {
    state.responses.parked_inbound_events = { data: null }
    const result = await dismissInboundEvent(EVENT, null, form({ note: "late" }))
    expect(result?.ok).toBe(false)
    expect(state.serviceCalls).toEqual([])
  })

  it("words the database's refusals", async () => {
    state.serviceHandler = () => ({ error: { code: "42501", message: "GIVE_NOT_ALLOWED" } })
    expect((await dismissInboundEvent(EVENT, null, form({ note: "x" })))?.message).toBe(
      "Chỉ nhân viên tài chính hoặc quản trị viên mới xử lý được sự kiện bị dừng."
    )
    state.serviceHandler = () => ({ error: { code: "23514", message: "GIVE_DISMISS_NOTE_REQUIRED" } })
    expect((await dismissInboundEvent(EVENT, null, form({ note: "x" })))?.message).toBe("Ghi lý do bỏ qua sự kiện này.")
  })
})
