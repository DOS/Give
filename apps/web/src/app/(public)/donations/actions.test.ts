import { beforeEach, describe, expect, it, vi } from "vitest"

import { formatVnd } from "@/lib/format"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TOKEN = "f".repeat(64)

const state = vi.hoisted(() => ({
  session: null as { user: { id: string; email: null; name: null }; accessToken: string } | null,
  anonHandler: (() => undefined) as Handler,
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  anonCalls: [] as Call[],
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  cookies: [] as [string, string, Record<string, unknown>][],
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "give.example.com" }),
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => state.cookies.push([name, value, options]),
  }),
}))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => state.session) }))
vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) =>
    token
      ? fakeDb((call) => state.userHandler(call), state.userCalls)
      : fakeDb((call) => state.anonHandler(call), state.anonCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { donate } = await import("./actions")

function form(values: Record<string, string> = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ amount: "200.000", public_name: "Lan", message: "", ...values })) {
    data.set(key, value)
  }
  return data
}

const created = (overrides: Record<string, unknown> = {}) => ({
  data: {
    contribution_id: "33333333-3333-4333-8333-333333333333",
    reference_code: "GVABCDEFG",
    status_token: TOKEN,
    status_token_expires_at: "2026-11-08T00:00:00.000Z",
    ...overrides,
  },
})

beforeEach(() => {
  state.session = null
  state.anonHandler = (call) => (call.target === "campaigns" ? { data: { id: CAMPAIGN } } : undefined)
  state.userHandler = (call) => (call.target === "campaigns" ? { data: { id: CAMPAIGN } } : undefined)
  state.serviceHandler = (call) => (call.target === "rpc:create_donation" ? created() : undefined)
  state.anonCalls.length = 0
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.cookies.length = 0
})

describe("donate", () => {
  it("creates a guest donation, keeps the token in a cookie and opens the payment page", async () => {
    await expect(donate(CAMPAIGN, null, form({ message: " Cố lên " }))).rejects.toThrow(
      "NEXT_REDIRECT /donations/GVABCDEFG"
    )
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_campaign_id: CAMPAIGN,
        p_amount: 200000,
        p_contributor_user_id: null,
        p_public_name: "Lan",
        p_is_anonymous: false,
        p_message: "Cố lên",
      },
    ])
    expect(state.cookies).toEqual([
      [
        "__Host-give_dn_GVABCDEFG",
        TOKEN,
        {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          expires: new Date("2026-11-08T00:00:00.000Z"),
        },
      ],
    ])
  })

  it("links a signed-in donor's donation after PostgREST has checked their token", async () => {
    state.session = { user: { id: USER, email: null, name: null }, accessToken: "jwt" }
    state.serviceHandler = () => created({ status_token: null, status_token_expires_at: null })
    await expect(donate(CAMPAIGN, null, form({ anonymous: "on" }))).rejects.toThrow("NEXT_REDIRECT")
    expect(state.userCalls[0].target).toBe("campaigns")
    expect(op(state.serviceCalls[0], "args")).toEqual([
      expect.objectContaining({ p_contributor_user_id: USER, p_is_anonymous: true, p_public_name: null }),
    ])
    expect(state.cookies).toHaveLength(0)
  })

  it("stops when the session token is rejected, before creating anything", async () => {
    state.session = { user: { id: USER, email: null, name: null }, accessToken: "forged" }
    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWSError" } })
    expect(await donate(CAMPAIGN, null, form())).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a tampered campaign id and invalid input without calling the database", async () => {
    expect((await donate("not-a-uuid", null, form()))?.ok).toBe(false)
    expect(await donate(CAMPAIGN, null, form({ amount: "abc" }))).toEqual({
      ok: false,
      message: "Số tiền không hợp lệ",
    })
    expect(await donate(CAMPAIGN, null, form({ public_name: "" }))).toEqual({
      ok: false,
      message: "Nhập tên hiển thị, hoặc chọn ủng hộ ẩn danh",
    })
    expect(state.serviceCalls).toHaveLength(0)
    expect(state.anonCalls).toHaveLength(0)
  })

  it("refuses a campaign the visitor cannot see", async () => {
    state.anonHandler = () => ({ data: null })
    expect(await donate(CAMPAIGN, null, form())).toEqual({
      ok: false,
      message: "Chiến dịch này hiện không nhận ủng hộ.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("names the campaign minimum when the amount is below it", async () => {
    state.serviceHandler = () => ({ error: { code: "23514", message: "GIVE_AMOUNT_BELOW_MINIMUM: 10000" } })
    expect(await donate(CAMPAIGN, null, form({ amount: "5000" }))).toEqual({
      ok: false,
      message: `Số tiền ủng hộ tối thiểu là ${formatVnd(10000)}.`,
    })
  })

  it.each([
    ["GIVE_CAMPAIGN_NOT_ACCEPTING", "Chiến dịch này hiện không nhận ủng hộ."],
    ["GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT", "Chiến dịch chưa sẵn sàng nhận chuyển khoản. Hãy quay lại sau."],
  ])("explains %s", async (code, message) => {
    state.serviceHandler = () => ({ error: { code: "23514", message: code } })
    expect(await donate(CAMPAIGN, null, form())).toEqual({ ok: false, message })
    expect(state.cookies).toHaveLength(0)
  })
})
