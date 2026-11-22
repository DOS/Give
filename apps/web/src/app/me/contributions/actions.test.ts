import { beforeEach, describe, expect, it, vi } from "vitest"

import { PLAN_MESSAGES } from "@/lib/errors"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const PLAN = "44444444-4444-4444-8444-444444444444"

const state = vi.hoisted(() => ({
  session: null as { user: { id: string; email: null; name: null }; accessToken: string } | null,
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  revalidated: [] as string[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn((path: string) => state.revalidated.push(path)) }))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => state.session) }))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { cancelPlan, updatePlan } = await import("./actions")

function form(values: Record<string, string> = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const SESSION_EXPIRED = { ok: false, message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại." }

beforeEach(() => {
  state.session = { user: { id: USER, email: null, name: null }, accessToken: "jwt" }
  state.userHandler = (call) =>
    call.target === "donation_plans" ? { data: { id: PLAN, status: "active" } } : undefined
  state.serviceHandler = (call) => {
    if (call.target === "rpc:update_donation_plan") {
      return { data: { plan_id: PLAN, amount: 300000, day_of_month: 10, next_period: "2026-12-01" } }
    }
    if (call.target === "rpc:cancel_donation_plan") {
      return { data: [{ plan_id: PLAN, status: "ended", ended_reason: "donor_cancelled" }] }
    }
    return undefined
  }
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.revalidated.length = 0
})

describe("updatePlan (DOS/Give#276)", () => {
  it("reads the plan with the donor's token, then changes it as the service role", async () => {
    const result = await updatePlan(PLAN, null, form({ amount: "300.000", day_of_month: "10" }))
    expect(result).toEqual({
      ok: true,
      message: "Đã lưu. Số tiền và ngày mới áp dụng từ mã ủng hộ tháng 12/2026; mã đã tạo giữ nguyên.",
    })
    expect(state.userCalls[0].target).toBe("donation_plans")
    expect(state.userCalls[0].ops).toContainEqual(["eq", "id", PLAN])
    expect(state.userCalls[0].ops).toContainEqual(["eq", "contributor_user_id", USER])
    expect(op(state.serviceCalls[0], "args")).toEqual([
      { p_plan_id: PLAN, p_user_id: USER, p_amount: 300000, p_day_of_month: 10 },
    ])
    expect(state.revalidated).toEqual(["/me/contributions"])
  })

  it.each([
    [{ amount: "5.000", day_of_month: "10" }, "Số tiền mỗi tháng tối thiểu"],
    [{ amount: "300.000", day_of_month: "31" }, "Chọn một ngày từ 1 đến 28"],
    [{ amount: "abc", day_of_month: "10" }, "Số tiền không hợp lệ"],
  ])("validates %o before any read", async (values, message) => {
    const result = await updatePlan(PLAN, null, form(values))
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain(message)
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses an ended plan without calling the database function", async () => {
    state.userHandler = () => ({ data: { id: PLAN, status: "ended" } })
    expect(await updatePlan(PLAN, null, form({ amount: "300.000", day_of_month: "10" }))).toEqual({
      ok: false,
      message: PLAN_MESSAGES.GIVE_PLAN_ENDED,
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("maps the database's refusals", async () => {
    state.serviceHandler = () => ({ error: { code: "P0001", message: "GIVE_CAMPAIGN_NOT_ACCEPTING" } })
    expect(await updatePlan(PLAN, null, form({ amount: "300.000", day_of_month: "10" }))).toEqual({
      ok: false,
      message: PLAN_MESSAGES.GIVE_CAMPAIGN_NOT_ACCEPTING,
    })
    expect(state.revalidated).toHaveLength(0)
  })
})

describe("cancelPlan (DOS/Give#276)", () => {
  it("stops the donor's own plan and says this month's code stays valid", async () => {
    const result = await cancelPlan(PLAN, null, form())
    expect(result?.ok).toBe(true)
    expect(result?.message).toContain("Mã ủng hộ đã có của tháng này vẫn dùng được")
    expect(state.userCalls[0].ops).toContainEqual(["eq", "contributor_user_id", USER])
    expect(state.serviceCalls[0].target).toBe("rpc:cancel_donation_plan")
    expect(op(state.serviceCalls[0], "args")).toEqual([{ p_plan_id: PLAN, p_user_id: USER }])
    expect(state.revalidated).toEqual(["/me/contributions"])
  })

  it("changes nothing for a plan that already ended", async () => {
    state.userHandler = () => ({ data: { id: PLAN, status: "ended" } })
    expect(await cancelPlan(PLAN, null, form())).toEqual({ ok: true, message: "Kế hoạch này đã dừng." })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("maps the database's refusals", async () => {
    state.serviceHandler = () => ({ error: { code: "P0002", message: "GIVE_PLAN_NOT_FOUND" } })
    expect(await cancelPlan(PLAN, null, form())).toEqual({ ok: false, message: PLAN_MESSAGES.GIVE_PLAN_NOT_FOUND })
  })
})

describe("proving the plan (both actions)", () => {
  const valid = () => form({ amount: "300.000", day_of_month: "10" })

  it("refuses a signed-out visitor", async () => {
    state.session = null
    expect(await updatePlan(PLAN, null, valid())).toEqual(SESSION_EXPIRED)
    expect(await cancelPlan(PLAN, null, form())).toEqual(SESSION_EXPIRED)
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a tampered plan id", async () => {
    const notFound = { ok: false, message: PLAN_MESSAGES.GIVE_PLAN_NOT_FOUND }
    expect(await updatePlan("nope", null, valid())).toEqual(notFound)
    expect(await cancelPlan("nope", null, form())).toEqual(notFound)
    expect(state.userCalls).toHaveLength(0)
  })

  it("refuses someone else's plan, which RLS hides", async () => {
    state.userHandler = () => ({ data: null })
    const notFound = { ok: false, message: PLAN_MESSAGES.GIVE_PLAN_NOT_FOUND }
    expect(await updatePlan(PLAN, null, valid())).toEqual(notFound)
    expect(await cancelPlan(PLAN, null, form())).toEqual(notFound)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("asks to sign in again when PostgREST rejects the token", async () => {
    state.userHandler = () => ({ error: { code: "PGRST303", message: "JWT expired" } })
    expect(await updatePlan(PLAN, null, valid())).toEqual(SESSION_EXPIRED)
    expect(await cancelPlan(PLAN, null, form())).toEqual(SESSION_EXPIRED)
    expect(state.serviceCalls).toHaveLength(0)
  })
})
