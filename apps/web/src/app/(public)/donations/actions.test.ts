import { createHmac } from "node:crypto"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { formatVnd } from "@/lib/format"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TOKEN = "f".repeat(64)
const SERVICE_KEY = "test-service-role-key"
const clientKey = (address: string) =>
  createHmac("sha256", SERVICE_KEY).update(`give:donation-rate:${address}`).digest("hex")

const state = vi.hoisted(() => ({
  session: null as { user: { id: string; email: null; name: null }; accessToken: string } | null,
  anonHandler: (() => undefined) as Handler,
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  anonCalls: [] as Call[],
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  cookies: [] as [string, string, Record<string, unknown>][],
  existingCookies: [] as string[],
  requestHeaders: {} as Record<string, string>,
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "give.example.com", ...state.requestHeaders }),
  cookies: async () => ({
    getAll: () => state.existingCookies.map((name) => ({ name, value: "x" })),
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
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY)
  vi.stubEnv("GIVE_RATE_LIMIT_SECRET", "")
  vi.stubEnv("VERCEL", "1")
  state.session = null
  state.requestHeaders = { "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1, 10.0.0.1" }
  state.anonHandler = (call) => (call.target === "campaigns" ? { data: { id: CAMPAIGN } } : undefined)
  state.userHandler = (call) => (call.target === "campaigns" ? { data: { id: CAMPAIGN } } : undefined)
  state.serviceHandler = (call) => (call.target === "rpc:create_donation" ? created() : undefined)
  state.anonCalls.length = 0
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.cookies.length = 0
  state.existingCookies = []
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
        p_client_key: clientKey("203.0.113.7"),
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

  it("drops the oldest guest donation cookies beyond the cap", async () => {
    const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
    state.existingCookies = [
      "__Host-give_at",
      ...Array.from({ length: 20 }, (_, i) => `__Host-give_dn_GVBBBBB${alphabet[i]}`),
    ]
    await expect(donate(CAMPAIGN, null, form())).rejects.toThrow("NEXT_REDIRECT")
    expect(state.cookies.map(([name, value, options]) => [name, value, options.maxAge])).toEqual([
      ["__Host-give_dn_GVBBBBB2", "", 0],
      ["__Host-give_dn_GVABCDEFG", TOKEN, undefined],
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

  it("counts a guest by a keyed hash of their address, never the address itself", async () => {
    await expect(donate(CAMPAIGN, null, form())).rejects.toThrow("NEXT_REDIRECT")
    const args = op(state.serviceCalls[0], "args")?.[0] as Record<string, unknown>
    expect(args.p_client_key).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(state.serviceCalls)).not.toContain("203.0.113.7")
  })

  it("keys by GIVE_RATE_LIMIT_SECRET when it is set", async () => {
    vi.stubEnv("GIVE_RATE_LIMIT_SECRET", "dedicated-secret")
    await expect(donate(CAMPAIGN, null, form())).rejects.toThrow("NEXT_REDIRECT")
    expect(op(state.serviceCalls[0], "args")).toEqual([
      expect.objectContaining({
        p_client_key: createHmac("sha256", "dedicated-secret").update("give:donation-rate:203.0.113.7").digest("hex"),
      }),
    ])
  })

  it("trusts the address headers only on Vercel, whose proxy sets them", async () => {
    vi.stubEnv("VERCEL", "")
    await expect(donate(CAMPAIGN, null, form())).rejects.toThrow("NEXT_REDIRECT")
    expect(op(state.serviceCalls[0], "args")).toEqual([expect.objectContaining({ p_client_key: null })])
  })

  it("sends no client key when the request carries no address", async () => {
    state.requestHeaders = {}
    await expect(donate(CAMPAIGN, null, form())).rejects.toThrow("NEXT_REDIRECT")
    expect(op(state.serviceCalls[0], "args")).toEqual([expect.objectContaining({ p_client_key: null })])
  })

  it("tells a limited guest when to retry and that signing in lifts the limit", async () => {
    state.serviceHandler = () => ({ error: { code: "54000", message: "GIVE_RATE_LIMITED: 125" } })
    expect(await donate(CAMPAIGN, null, form())).toEqual({
      ok: false,
      message:
        "Có nhiều lượt ủng hộ từ cùng mạng của bạn trong thời gian ngắn. Hãy thử lại sau khoảng 3 phút, hoặc đăng nhập để ủng hộ tiếp.",
    })
    expect(state.cookies).toHaveLength(0)
  })

  it("assumes a full window when the limit error carries no wait", async () => {
    state.serviceHandler = () => ({ error: { code: "54000", message: "GIVE_RATE_LIMITED" } })
    expect((await donate(CAMPAIGN, null, form()))?.message).toContain("khoảng 10 phút")
  })

  it("tells a limited signed-in donor when to retry", async () => {
    state.session = { user: { id: USER, email: null, name: null }, accessToken: "jwt" }
    state.serviceHandler = () => ({ error: { code: "54000", message: "GIVE_RATE_LIMITED: 30" } })
    expect(await donate(CAMPAIGN, null, form())).toEqual({
      ok: false,
      message: "Bạn vừa tạo nhiều lượt ủng hộ trong thời gian ngắn. Hãy thử lại sau khoảng 1 phút.",
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
