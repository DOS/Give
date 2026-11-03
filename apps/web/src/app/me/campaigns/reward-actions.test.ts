import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const OTHER = "99999999-9999-4999-8999-999999999999"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const T1 = "a0000000-0000-4000-8000-000000000001"
const T2 = "a0000000-0000-4000-8000-000000000002"
const T3 = "a0000000-0000-4000-8000-000000000003"

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  signedIn: true,
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    state.signedIn ? { user: { id: USER, email: null, name: null }, accessToken: "token" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { deleteRewardTier, moveRewardTier, retireRewardTier, saveRewardTier } = await import("./reward-actions")

function tier(id: string, fields: Record<string, unknown> = {}) {
  return { id, campaign_id: CAMPAIGN, title: "Áo", status: "active", quantity_claimed: 0, sort_order: 1, ...fields }
}

function reads({
  campaign = {
    id: CAMPAIGN,
    slug: "ao-abcde",
    organizer_id: USER,
    type: "back",
    status: "draft",
    min_contribution: 50_000,
  },
  tiers = [tier(T1, { sort_order: 1 }), tier(T2, { sort_order: 2 }), tier(T3, { sort_order: 3 })] as unknown[],
}: { campaign?: Record<string, unknown>; tiers?: unknown[] } = {}): Handler {
  return (call) => {
    if (call.target === "rpc:managed_campaigns") return { data: campaign }
    if (call.target === "reward_tiers") return { data: tiers }
    return undefined
  }
}

function tierForm(values: Record<string, string> = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries({
    title: " Áo thun Give ",
    min_amount: "200.000",
    description: "Áo cotton",
    quantity_limit: "100",
    estimated_delivery: "2027-03",
    requires_shipping: "on",
    shipping_note: "Chỉ giao trong Việt Nam",
    ...values,
  }))
    form.set(key, value)
  return form
}

const campaignIn = (status: string, fields: Record<string, unknown> = {}) => ({
  id: CAMPAIGN,
  slug: "ao-abcde",
  organizer_id: USER,
  type: "back",
  status,
  min_contribution: 50_000,
  ...fields,
})

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.signedIn = true
  state.userHandler = reads()
  state.serviceHandler = () => ({ data: T1 })
})

describe("saveRewardTier", () => {
  it("creates a tier on a draft, last in order, with the actor id and parsed fields", async () => {
    const result = await saveRewardTier(CAMPAIGN, null, null, tierForm())
    expect(result).toEqual({ ok: true, message: "Đã thêm phần thưởng." })
    expect(state.serviceCalls.map((c) => c.target)).toEqual(["rpc:save_reward_tier"])
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_actor_id: USER,
        p_campaign_id: CAMPAIGN,
        p_tier_id: null,
        p_title: "Áo thun Give",
        p_min_amount: 200_000,
        p_description: "Áo cotton",
        p_quantity_limit: 100,
        p_estimated_delivery: "2027-03-01",
        p_requires_shipping: true,
        p_shipping_note: "Chỉ giao trong Việt Nam",
        p_sort_order: null,
      },
    ])
    // Ownership was read with the user's token first.
    expect(state.userCalls.map((c) => c.target).sort()).toEqual(["reward_tiers", "rpc:managed_campaigns"])
  })

  it("updates a tier of a campaign under changes, dropping the shipping note when nothing ships", async () => {
    state.userHandler = reads({ campaign: campaignIn("changes_requested") })
    const result = await saveRewardTier(CAMPAIGN, T2, null, tierForm({ requires_shipping: "", quantity_limit: "" }))
    expect(result?.ok).toBe(true)
    expect(op(state.serviceCalls[0], "args")?.[0]).toMatchObject({
      p_tier_id: T2,
      p_quantity_limit: null,
      p_requires_shipping: false,
      p_shipping_note: null,
    })
  })

  it.each(["in_review", "approved", "live", "succeeded", "suspended", "cancelled"])(
    "refuses edits once the campaign is %s",
    async (status) => {
      state.userHandler = reads({ campaign: campaignIn(status) })
      const result = await saveRewardTier(CAMPAIGN, null, null, tierForm())
      expect(result?.ok).toBe(false)
      expect(result?.message).toContain("bản nháp hoặc cần chỉnh sửa")
      expect(state.serviceCalls).toEqual([])
    }
  )

  it("refuses a give campaign, someone else's campaign and an unknown tier", async () => {
    state.userHandler = reads({ campaign: campaignIn("draft", { type: "give" }) })
    expect((await saveRewardTier(CAMPAIGN, null, null, tierForm()))?.message).toContain("Chỉ dự án có quà tặng")
    state.userHandler = reads({ campaign: campaignIn("draft", { organizer_id: OTHER }) })
    expect((await saveRewardTier(CAMPAIGN, null, null, tierForm()))?.message).toContain("Không tìm thấy chiến dịch")
    state.userHandler = reads()
    const unknown = "a0000000-0000-4000-8000-0000000000ff"
    expect((await saveRewardTier(CAMPAIGN, unknown, null, tierForm()))?.message).toContain("Không tìm thấy mức")
    expect((await saveRewardTier(CAMPAIGN, "not-a-uuid", null, tierForm()))?.message).toContain("Không tìm thấy mức")
    expect(state.serviceCalls).toEqual([])
  })

  it("refuses an amount below the campaign minimum, a bad field and the 51st tier", async () => {
    const low = await saveRewardTier(CAMPAIGN, null, null, tierForm({ min_amount: "10.000" }))
    expect(low?.message).toContain("không được thấp hơn mức góp tối thiểu của dự án (50.000")
    expect((await saveRewardTier(CAMPAIGN, null, null, tierForm({ title: "A" })))?.ok).toBe(false)
    state.userHandler = reads({ tiers: Array.from({ length: 50 }, (_, i) => tier(`t${i}`)) })
    expect((await saveRewardTier(CAMPAIGN, null, null, tierForm()))?.message).toContain("tối đa 50")
    expect(state.serviceCalls).toEqual([])
  })

  it("words the database's own refusals", async () => {
    state.serviceHandler = () => ({ error: { message: "GIVE_CAMPAIGN_NOT_EDITABLE: in_review" } })
    expect((await saveRewardTier(CAMPAIGN, null, null, tierForm()))?.message).toContain("bản nháp hoặc cần chỉnh sửa")
    state.serviceHandler = () => ({ error: { message: "GIVE_AMOUNT_BELOW_MINIMUM: 50000" } })
    expect((await saveRewardTier(CAMPAIGN, null, null, tierForm()))?.message).toContain("mức góp tối thiểu")
  })

  it("asks a signed-out user to sign in", async () => {
    state.signedIn = false
    expect((await saveRewardTier(CAMPAIGN, null, null, tierForm()))?.message).toContain("đăng nhập lại")
    expect(state.userCalls).toEqual([])
  })
})

describe("deleteRewardTier", () => {
  it("deletes a tier of a draft", async () => {
    expect((await deleteRewardTier(CAMPAIGN, T1, null, new FormData()))?.ok).toBe(true)
    expect(op(state.serviceCalls[0], "args")).toEqual([{ p_actor_id: USER, p_tier_id: T1 }])
  })

  it("refuses after submission and for a tier someone chose", async () => {
    state.userHandler = reads({ campaign: campaignIn("live") })
    expect((await deleteRewardTier(CAMPAIGN, T1, null, new FormData()))?.ok).toBe(false)
    expect(state.serviceCalls).toEqual([])
    state.userHandler = reads()
    state.serviceHandler = () => ({ error: { message: "GIVE_REWARD_TIER_IN_USE" } })
    expect((await deleteRewardTier(CAMPAIGN, T1, null, new FormData()))?.message).toContain("không xóa được")
  })
})

describe("moveRewardTier", () => {
  it("sends the whole new order", async () => {
    expect((await moveRewardTier(CAMPAIGN, T3, "up", null, new FormData()))?.ok).toBe(true)
    expect(op(state.serviceCalls[0], "args")).toEqual([
      { p_actor_id: USER, p_campaign_id: CAMPAIGN, p_tier_ids: [T1, T3, T2] },
    ])
  })

  it("orders by sort_order even when rows come back shuffled", async () => {
    state.userHandler = reads({
      tiers: [tier(T3, { sort_order: 3 }), tier(T1, { sort_order: 1 }), tier(T2, { sort_order: 2 })],
    })
    await moveRewardTier(CAMPAIGN, T1, "down", null, new FormData())
    expect(op(state.serviceCalls[0], "args")?.[0]).toMatchObject({ p_tier_ids: [T2, T1, T3] })
  })

  it("refuses a move off the end, and after submission", async () => {
    expect((await moveRewardTier(CAMPAIGN, T1, "up", null, new FormData()))?.ok).toBe(false)
    state.userHandler = reads({ campaign: campaignIn("approved") })
    expect((await moveRewardTier(CAMPAIGN, T2, "up", null, new FormData()))?.ok).toBe(false)
    expect(state.serviceCalls).toEqual([])
  })
})

describe("retireRewardTier", () => {
  it.each(["approved", "live", "suspended"])("retires an unclaimed tier of a %s campaign", async (status) => {
    state.userHandler = reads({ campaign: campaignIn(status) })
    state.serviceHandler = () => ({ data: "retired" })
    const result = await retireRewardTier(CAMPAIGN, T1, null, new FormData())
    expect(result?.ok).toBe(true)
    expect(op(state.serviceCalls[0], "args")).toEqual([{ p_actor_id: USER, p_tier_id: T1 }])
  })

  it("refuses a tier a pledge holds", async () => {
    state.userHandler = reads({ campaign: campaignIn("live"), tiers: [tier(T1, { quantity_claimed: 2 })] })
    const result = await retireRewardTier(CAMPAIGN, T1, null, new FormData())
    expect(result?.message).toContain("đang có người cam kết")
    expect(state.serviceCalls).toEqual([])
  })

  it("points a draft to delete instead, and refuses an ended campaign", async () => {
    expect((await retireRewardTier(CAMPAIGN, T1, null, new FormData()))?.message).toContain("hãy xóa hoặc sửa")
    state.userHandler = reads({ campaign: campaignIn("succeeded") })
    expect((await retireRewardTier(CAMPAIGN, T1, null, new FormData()))?.message).toContain(
      "đã duyệt, đang gây quỹ hoặc tạm dừng"
    )
    expect(state.serviceCalls).toEqual([])
  })

  it("treats a retired tier as done, and words a claim that raced in", async () => {
    state.userHandler = reads({
      campaign: campaignIn("live"),
      tiers: [tier(T1, { status: "retired", retired_at: "2026-11-01T00:00:00Z" })],
    })
    expect((await retireRewardTier(CAMPAIGN, T1, null, new FormData()))?.ok).toBe(true)
    expect(state.serviceCalls).toEqual([])
    state.userHandler = reads({ campaign: campaignIn("live") })
    state.serviceHandler = () => ({ error: { message: "GIVE_REWARD_TIER_HAS_PLEDGES: 1" } })
    expect((await retireRewardTier(CAMPAIGN, T1, null, new FormData()))?.message).toContain("đang có người cam kết")
  })
})
