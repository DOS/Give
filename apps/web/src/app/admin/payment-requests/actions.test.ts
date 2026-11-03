import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const MODERATOR = "66666666-6666-4666-8666-666666666666"
const CAMPAIGN = "77777777-7777-4777-8777-777777777777"

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: MODERATOR, email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { setPaymentRequestsStopped } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.userHandler = (call) => (call.target === "rpc:is_admin" ? { data: true } : undefined)
  state.serviceHandler = () => ({ data: "stopped" })
})

describe("setPaymentRequestsStopped", () => {
  it("stops with the reason and the public note, after a role check with the moderator's token", async () => {
    const result = await setPaymentRequestsStopped(
      CAMPAIGN,
      null,
      form({ action: "stop", reason: " Báo cáo gian lận #12 ", public_note: " Give đang xác minh. " })
    )
    expect(result?.ok).toBe(true)
    expect(op(state.userCalls[0], "args")).toEqual([{ p_roles: ["moderator", "admin"] }])
    expect(state.serviceCalls[0].target).toBe("rpc:set_payment_requests_stopped")
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_actor_id: MODERATOR,
        p_campaign_id: CAMPAIGN,
        p_stopped: true,
        p_reason: "Báo cáo gian lận #12",
        p_public_note: "Give đang xác minh.",
      },
    ])
  })

  it("resumes with a reason and never sends a public note", async () => {
    state.serviceHandler = () => ({ data: "resumed" })
    const result = await setPaymentRequestsStopped(
      CAMPAIGN,
      null,
      form({ action: "resume", reason: "Đã xác minh.", public_note: "x" })
    )
    expect(result?.ok).toBe(true)
    expect(result?.message).toContain("Đã mở lại")
    expect(op(state.serviceCalls[0], "args")).toEqual([
      expect.objectContaining({ p_stopped: false, p_public_note: null }),
    ])
  })

  it("needs a reason, a public note to stop, a valid action and campaign", async () => {
    expect(
      (await setPaymentRequestsStopped(CAMPAIGN, null, form({ action: "stop", reason: " ", public_note: "x" })))?.ok
    ).toBe(false)
    expect((await setPaymentRequestsStopped(CAMPAIGN, null, form({ action: "stop", reason: "x" })))?.message).toContain(
      "Ghi chú công khai là bắt buộc"
    )
    expect((await setPaymentRequestsStopped(CAMPAIGN, null, form({ action: "pause", reason: "x" })))?.ok).toBe(false)
    expect(
      (await setPaymentRequestsStopped("nope", null, form({ action: "stop", reason: "x", public_note: "y" })))?.ok
    ).toBe(false)
    expect(
      (
        await setPaymentRequestsStopped(
          CAMPAIGN,
          null,
          form({ action: "stop", reason: "x", public_note: "y".repeat(501) })
        )
      )?.message
    ).toContain("tối đa 500")
    expect(state.serviceCalls).toEqual([])
  })

  it("refuses non-moderators before calling the database", async () => {
    state.userHandler = (call) => (call.target === "rpc:is_admin" ? { data: false } : undefined)
    const result = await setPaymentRequestsStopped(
      CAMPAIGN,
      null,
      form({ action: "stop", reason: "x", public_note: "y" })
    )
    expect(result?.message).toContain("Chỉ người kiểm duyệt")
    expect(state.serviceCalls).toEqual([])
  })

  it("words the database refusals for moderators", async () => {
    state.serviceHandler = () => ({ error: { code: "42501", message: "GIVE_SELF_REVIEW" } })
    expect(
      (await setPaymentRequestsStopped(CAMPAIGN, null, form({ action: "stop", reason: "x", public_note: "y" })))
        ?.message
    ).toContain("chính bạn tạo")
    state.serviceHandler = () => ({
      error: { code: "23514", message: "GIVE_PAYMENT_REQUESTS_NOT_STOPPABLE: back live" },
    })
    expect(
      (await setPaymentRequestsStopped(CAMPAIGN, null, form({ action: "stop", reason: "x", public_note: "y" })))
        ?.message
    ).toContain("đã đạt mục tiêu")
  })
})
