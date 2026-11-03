import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const REVIEWER = "66666666-6666-4666-8666-666666666666"
const REQUEST = "77777777-7777-4777-8777-777777777777"

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: REVIEWER, email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { decideAccountSwap } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.userHandler = (call) => (call.target === "rpc:is_admin" ? { data: true } : undefined)
  state.serviceHandler = () => ({ data: "approved" })
})

describe("decideAccountSwap", () => {
  it("approves with the note and the public note, after a role check with the reviewer's token", async () => {
    const result = await decideAccountSwap(
      REQUEST,
      null,
      form({ decision: "approved", note: " Đã thấy thư ngân hàng. ", public_note: " Ngân hàng đóng tài khoản cũ. " })
    )
    expect(result?.ok).toBe(true)
    expect(op(state.userCalls[0], "args")).toEqual([{ p_roles: ["finance", "admin"] }])
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_request_id: REQUEST,
        p_decision: "approved",
        p_reviewer_id: REVIEWER,
        p_note: "Đã thấy thư ngân hàng.",
        p_public_note: "Ngân hàng đóng tài khoản cũ.",
      },
    ])
  })

  it("rejects with a note and never sends a public note", async () => {
    state.serviceHandler = () => ({ data: "rejected" })
    const result = await decideAccountSwap(
      REQUEST,
      null,
      form({ decision: "rejected", note: "Tài khoản cũ vẫn hoạt động.", public_note: "x" })
    )
    expect(result).toEqual({ ok: true, message: "Đã từ chối yêu cầu đổi tài khoản." })
    expect(op(state.serviceCalls[0], "args")).toEqual([
      expect.objectContaining({ p_decision: "rejected", p_public_note: null }),
    ])
  })

  it("needs a note and a valid decision", async () => {
    expect((await decideAccountSwap(REQUEST, null, form({ decision: "approved", note: " " })))?.ok).toBe(false)
    expect((await decideAccountSwap(REQUEST, null, form({ decision: "swap", note: "x" })))?.ok).toBe(false)
    expect((await decideAccountSwap("not-a-uuid", null, form({ decision: "approved", note: "x" })))?.ok).toBe(false)
    expect(state.serviceCalls).toEqual([])
  })

  it("refuses staff without the finance role before calling the database", async () => {
    state.userHandler = (call) => (call.target === "rpc:is_admin" ? { data: false } : undefined)
    const result = await decideAccountSwap(REQUEST, null, form({ decision: "approved", note: "x" }))
    expect(result?.message).toContain("Chỉ nhân viên tài chính")
    expect(state.serviceCalls).toEqual([])
  })

  it("words the database refusals for finance", async () => {
    state.serviceHandler = () => ({ error: { code: "42501", message: "GIVE_SELF_REVIEW" } })
    expect((await decideAccountSwap(REQUEST, null, form({ decision: "approved", note: "x" })))?.message).toContain(
      "chính bạn tổ chức"
    )
    state.serviceHandler = () => ({
      error: { code: "23514", message: "GIVE_SWAP_STALE: the campaign's account changed" },
    })
    expect((await decideAccountSwap(REQUEST, null, form({ decision: "approved", note: "x" })))?.message).toContain(
      "đã thay đổi từ khi yêu cầu được gửi"
    )
  })
})
