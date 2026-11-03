import { beforeEach, describe, expect, it, vi } from "vitest"

import { formatVnd } from "@/lib/format"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const PLEDGE = "33333333-3333-4333-8333-333333333333"
const TIER = "44444444-4444-4444-8444-444444444444"

const state = vi.hoisted(() => ({
  session: null as { user: { id: string; email: null; name: null }; accessToken: string } | null,
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

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

const { cancelPledge, savePledge } = await import("./actions")

function form(values: Record<string, string> = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({
    tier: TIER,
    amount: "300.000",
    public_name: "Lan",
    message: "",
    ...values,
  })) {
    data.set(key, value)
  }
  return data
}

const ADDRESS = {
  ship_recipient: "Nguyễn Lan",
  ship_phone: "0901234567",
  ship_address: "12 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội",
}

function tierRow(requiresShipping: boolean) {
  return { id: TIER, campaign_id: CAMPAIGN, title: "Đèn", min_amount: 200_000, requires_shipping: requiresShipping }
}

/** The user's reads: the campaign check, the tier and their pledge. */
function userReads({ campaign = true, tier = tierRow(false) as unknown, pledge = null as unknown } = {}): Handler {
  return (call) => {
    if (call.target === "campaigns") return { data: campaign ? { id: CAMPAIGN } : null }
    if (call.target === "public_reward_tiers") return { data: tier }
    if (call.target === "contributions") return { data: pledge }
    return undefined
  }
}

const created = { data: { contribution_id: PLEDGE, reference_code: "GVABCDEFG" } }

beforeEach(() => {
  state.session = { user: { id: USER, email: null, name: null }, accessToken: "user-token" }
  state.userHandler = userReads()
  state.serviceHandler = () => created
  state.userCalls.length = 0
  state.serviceCalls.length = 0
})

describe("savePledge", () => {
  it("checks the session token, then creates the pledge as the service role and opens its page", async () => {
    await expect(savePledge(CAMPAIGN, null, null, form({ message: "Cố lên" }))).rejects.toThrow(
      "NEXT_REDIRECT /me/pledges/GVABCDEFG"
    )
    expect(state.userCalls[0].target).toBe("campaigns")
    expect(op(state.userCalls[1], "eq")).toEqual(["campaign_id", CAMPAIGN])
    expect(state.serviceCalls).toHaveLength(1)
    expect(state.serviceCalls[0].target).toBe("rpc:create_pledge")
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_campaign_id: CAMPAIGN,
        p_user_id: USER,
        p_amount: 300_000,
        p_reward_tier_id: TIER,
        p_shipping_address: null,
        p_public_name: "Lan",
        p_is_anonymous: false,
        p_message: "Cố lên",
      },
    ])
  })

  it("sends the delivery address only for a tier that ships something", async () => {
    // A shipping address typed for a tier that ships nothing is dropped.
    await expect(savePledge(CAMPAIGN, null, null, form(ADDRESS))).rejects.toThrow("NEXT_REDIRECT")
    expect((op(state.serviceCalls[0], "args")?.[0] as Record<string, unknown>).p_shipping_address).toBeNull()

    state.serviceCalls.length = 0
    state.userHandler = userReads({ tier: tierRow(true) })
    await expect(savePledge(CAMPAIGN, null, null, form(ADDRESS))).rejects.toThrow("NEXT_REDIRECT")
    expect((op(state.serviceCalls[0], "args")?.[0] as Record<string, unknown>).p_shipping_address).toEqual({
      recipient: "Nguyễn Lan",
      phone: "0901234567",
      address: "12 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội",
    })
  })

  it("asks for the address of a shipping tier before calling the database", async () => {
    state.userHandler = userReads({ tier: tierRow(true) })
    expect(await savePledge(CAMPAIGN, null, null, form({ ...ADDRESS, ship_phone: "" }))).toEqual({
      ok: false,
      message: "Số điện thoại không hợp lệ",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("pledges without a reward, reading no tier", async () => {
    await expect(savePledge(CAMPAIGN, null, null, form({ tier: "none", anonymous: "on" }))).rejects.toThrow(
      "NEXT_REDIRECT"
    )
    expect(state.userCalls.map((c) => c.target)).toEqual(["campaigns"])
    expect(op(state.serviceCalls[0], "args")?.[0]).toMatchObject({
      p_reward_tier_id: null,
      p_public_name: null,
      p_is_anonymous: true,
    })
  })

  it("changes the open pledge through change_pledge", async () => {
    state.serviceHandler = () => ({ data: { contribution_id: "x", reference_code: "GVNEWCODE" } })
    await expect(savePledge(CAMPAIGN, PLEDGE, null, form({ amount: "500000" }))).rejects.toThrow(
      "NEXT_REDIRECT /me/pledges/GVNEWCODE"
    )
    expect(state.serviceCalls[0].target).toBe("rpc:change_pledge")
    const args = op(state.serviceCalls[0], "args")?.[0] as Record<string, unknown>
    expect(args).toMatchObject({ p_contribution_id: PLEDGE, p_user_id: USER, p_amount: 500_000 })
    expect(args).not.toHaveProperty("p_campaign_id")
  })

  it("refuses a signed-out visitor and a rejected token without calling the pledge functions", async () => {
    state.session = null
    expect(await savePledge(CAMPAIGN, null, null, form())).toMatchObject({ ok: false })
    expect(state.userCalls).toHaveLength(0)

    state.session = { user: { id: USER, email: null, name: null }, accessToken: "forged" }
    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWT expired" } })
    expect(await savePledge(CAMPAIGN, null, null, form())).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a tier the campaign does not show and malformed ids", async () => {
    state.userHandler = userReads({ tier: null })
    expect(await savePledge(CAMPAIGN, null, null, form())).toMatchObject({
      ok: false,
      message: expect.stringContaining("ngừng"),
    })
    expect(await savePledge("not-a-uuid", null, null, form())).toMatchObject({ ok: false })
    expect(await savePledge(CAMPAIGN, "x", null, form())).toMatchObject({ ok: false })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it.each([
    ["GIVE_REWARD_TIER_SOLD_OUT", "Phần quà này vừa hết suất. Hãy chọn phần quà khác."],
    ["GIVE_OWN_CAMPAIGN", "Bạn không thể ủng hộ dự án của chính mình."],
    ["GIVE_CAMPAIGN_NOT_ACCEPTING", "Dự án hiện không nhận cam kết (chưa mở hoặc đã kết thúc)."],
    ["GIVE_AMOUNT_BELOW_MINIMUM: 400000", `Số tiền tối thiểu cho lựa chọn này là ${formatVnd(400_000)}.`],
    ["GIVE_PLEDGE_EXISTS", "Bạn đã có một cam kết cho dự án này. Hãy tải lại trang để đổi cam kết đó."],
  ])("words %s for the backer", async (message, expected) => {
    state.serviceHandler = () => ({ error: { code: "23514", message } })
    expect(await savePledge(CAMPAIGN, null, null, form())).toEqual({ ok: false, message: expected })
  })

  it("keeps internals out of an unexpected error", async () => {
    state.serviceHandler = () => ({ error: { code: "XX000", message: "internal detail" } })
    expect(await savePledge(CAMPAIGN, null, null, form())).toEqual({
      ok: false,
      message: "Có lỗi xảy ra. Hãy thử lại sau.",
    })
  })
})

describe("cancelPledge", () => {
  it("reads the backer's own pledge with their token, then cancels it", async () => {
    state.userHandler = userReads({ pledge: { id: PLEDGE, reference_code: "GVABCDEFG", status: "pledged" } })
    state.serviceHandler = () => ({ data: "cancelled" })
    await expect(cancelPledge(PLEDGE, null, new FormData())).rejects.toThrow("NEXT_REDIRECT /me/pledges/GVABCDEFG")
    expect(op(state.userCalls[0], "eq")).toEqual(["id", PLEDGE])
    expect(state.userCalls[0].ops.filter(([name]) => name === "eq")).toContainEqual(["eq", "contributor_user_id", USER])
    expect(op(state.serviceCalls[0], "args")).toEqual([{ p_contribution_id: PLEDGE, p_user_id: USER }])
  })

  it("refuses someone else's pledge without calling cancel_pledge", async () => {
    state.userHandler = userReads({ pledge: null })
    expect(await cancelPledge(PLEDGE, null, new FormData())).toEqual({
      ok: false,
      message: "Không tìm thấy cam kết này.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("says why a pledge past ends_at cannot be cancelled", async () => {
    state.userHandler = userReads({ pledge: { id: PLEDGE, reference_code: "GVABCDEFG", status: "pledged" } })
    state.serviceHandler = () => ({ error: { code: "23514", message: "GIVE_CAMPAIGN_NOT_ACCEPTING" } })
    expect(await cancelPledge(PLEDGE, null, new FormData())).toMatchObject({
      ok: false,
      message: expect.stringContaining("kết thúc"),
    })
  })
})
