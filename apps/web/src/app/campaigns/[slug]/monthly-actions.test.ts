import { beforeEach, describe, expect, it, vi } from "vitest"

import { PLAN_MESSAGES } from "@/lib/errors"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
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
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => state.session) }))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { startMonthlyPlan } = await import("./monthly-actions")

function form(values: Record<string, string> = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({
    amount: "200.000",
    day_of_month: "5",
    public_name: "Lan",
    message: "",
    consent: "on",
    ...values,
  })) {
    data.set(key, value)
  }
  return data
}

const created = (overrides: Record<string, unknown> = {}) => ({
  data: {
    plan_id: PLAN,
    contribution_id: "33333333-3333-4333-8333-333333333333",
    reference_code: "GVABCDEFG",
    plan_period: "2026-11-01",
    next_period: "2026-12-01",
    reused: false,
    ...overrides,
  },
})

beforeEach(() => {
  state.session = { user: { id: USER, email: null, name: null }, accessToken: "jwt" }
  state.userHandler = (call) => (call.target === "campaigns" ? { data: { id: CAMPAIGN } } : undefined)
  state.serviceHandler = (call) => (call.target === "rpc:create_donation_plan" ? created() : undefined)
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.revalidated.length = 0
})

describe("startMonthlyPlan (DOS/Give#276)", () => {
  it("proves the session with the donor's token, creates the plan and opens this month's donation", async () => {
    await expect(startMonthlyPlan(CAMPAIGN, null, form({ message: " Cố lên " }))).rejects.toThrow(
      "NEXT_REDIRECT /donations/GVABCDEFG"
    )
    expect(state.userCalls[0].target).toBe("campaigns")
    expect(state.userCalls[0].ops).toContainEqual(["eq", "id", CAMPAIGN])
    expect(state.serviceCalls[0].target).toBe("rpc:create_donation_plan")
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_campaign_id: CAMPAIGN,
        p_user_id: USER,
        p_amount: 200000,
        p_day_of_month: 5,
        p_reminder_consent: true,
        p_is_anonymous: false,
        p_public_name: "Lan",
        p_message: "Cố lên",
      },
    ])
    expect(state.revalidated).toEqual(["/me/contributions"])
  })

  it("sends an anonymous donor's plan without a name", async () => {
    await expect(startMonthlyPlan(CAMPAIGN, null, form({ anonymous: "on" }))).rejects.toThrow("NEXT_REDIRECT")
    expect(op(state.serviceCalls[0], "args")).toEqual([
      expect.objectContaining({ p_is_anonymous: true, p_public_name: null }),
    ])
  })

  it("goes to the overview when the month's donation of a cancelled plan is reused", async () => {
    state.serviceHandler = () => created({ reused: true })
    await expect(startMonthlyPlan(CAMPAIGN, null, form())).rejects.toThrow("NEXT_REDIRECT /me/contributions")
  })

  it("asks a signed-out visitor to sign in without touching the database", async () => {
    state.session = null
    expect(await startMonthlyPlan(CAMPAIGN, null, form())).toEqual({
      ok: false,
      message: PLAN_MESSAGES.GIVE_SIGN_IN_REQUIRED,
    })
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a tampered campaign id", async () => {
    expect(await startMonthlyPlan("nope", null, form())).toEqual({
      ok: false,
      message: PLAN_MESSAGES.GIVE_CAMPAIGN_NOT_ACCEPTING,
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it.each([
    ["no consent", { consent: "" }, "Hãy đồng ý nhận lời nhắc hằng tháng để Give gửi mã ủng hộ mỗi tháng"],
    ["a day past 28", { day_of_month: "29" }, "Chọn một ngày từ 1 đến 28"],
    ["an amount below the floor", { amount: "5.000" }, "Số tiền mỗi tháng tối thiểu 10.000"],
    ["no name and not anonymous", { public_name: " " }, "Nhập tên hiển thị, hoặc chọn ủng hộ ẩn danh"],
  ])("validates the form: %s", async (_name, values, message) => {
    const result = await startMonthlyPlan(CAMPAIGN, null, form(values))
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain(message)
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("asks to sign in again when PostgREST rejects the token", async () => {
    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWT expired" } })
    expect(await startMonthlyPlan(CAMPAIGN, null, form())).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a campaign the donor cannot see", async () => {
    state.userHandler = () => ({ data: null })
    expect(await startMonthlyPlan(CAMPAIGN, null, form())).toEqual({
      ok: false,
      message: PLAN_MESSAGES.GIVE_CAMPAIGN_NOT_ACCEPTING,
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it.each(["GIVE_PLAN_EXISTS", "GIVE_MONTHLY_NOT_ALLOWED", "GIVE_RATE_LIMITED", "GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT"])(
    "words %s for the donor",
    async (code) => {
      state.serviceHandler = () => ({ error: { code: "P0001", message: `${code}: refused` } })
      expect(await startMonthlyPlan(CAMPAIGN, null, form())).toEqual({ ok: false, message: PLAN_MESSAGES[code] })
      expect(state.revalidated).toHaveLength(0)
    }
  )
})
