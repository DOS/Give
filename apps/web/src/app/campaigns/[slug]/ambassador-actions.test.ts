import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const SLUG = "xay-truong-ban-may"

const state = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string | null; name: string | null }; accessToken: string } | null,
  userHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  tokens: [] as (string | undefined)[],
  serviceCalled: false,
  revalidated: [] as string[],
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((path: string) => state.revalidated.push(path)),
}))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => state.session) }))
vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) => {
    state.tokens.push(token)
    return fakeDb((call) => state.userHandler(call), state.userCalls)
  },
  dbService: () => {
    state.serviceCalled = true
    throw new Error("saveMyCampaignAmbassador must NEVER call dbService()")
  },
}))

const { saveMyCampaignAmbassador } = await import("./ambassador-actions")

function makeForm(values: Record<string, string> = {}) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  state.session = { user: { id: USER, email: "amb@example.vn", name: "Minh Anh" }, accessToken: "user-jwt" }
  state.userCalls.length = 0
  state.tokens.length = 0
  state.serviceCalled = false
  state.revalidated.length = 0
  state.userHandler = (call) => {
    if (call.target === "rpc:upsert_my_campaign_ambassador") {
      return {
        data: [
          {
            ref_code: "ab23cd45ef",
            display_name: "CLB Sinh viên Xanh",
            show_on_leaderboard: true,
            created_at: "2026-11-22T00:00:00Z",
          },
        ],
      }
    }
    if (call.target === "rpc:get_my_campaign_ambassador") {
      return {
        data: [
          {
            ref_code: "ab23cd45ef",
            display_name: "CLB Sinh viên Xanh",
            show_on_leaderboard: true,
            matched_count: 2,
            matched_total_vnd: 500_000,
            created_at: "2026-11-22T00:00:00Z",
            updated_at: "2026-11-22T00:01:00Z",
          },
        ],
      }
    }
    return undefined
  }
})

describe("saveMyCampaignAmbassador (DOS/Give#319)", () => {
  it("refuses signed-out users and invalid campaign ids without touching the DB", async () => {
    state.session = null
    expect(
      await saveMyCampaignAmbassador(
        CAMPAIGN,
        SLUG,
        { ambassador: null },
        makeForm({ display_name: "Minh Anh", show_on_leaderboard: "on" })
      )
    ).toEqual({
      ambassador: null,
      error: "Hãy đăng nhập để tạo liên kết kêu gọi giúp chiến dịch.",
    })
    expect(state.userCalls).toHaveLength(0)

    state.session = { user: { id: USER, email: null, name: null }, accessToken: "user-jwt" }
    expect(
      await saveMyCampaignAmbassador(
        "not-a-uuid",
        SLUG,
        { ambassador: null },
        makeForm({ display_name: "Minh Anh", show_on_leaderboard: "on" })
      )
    ).toEqual({
      ambassador: null,
      error: "Không tìm thấy chiến dịch công khai này.",
    })
    expect(state.userCalls).toHaveLength(0)
  })

  it("validates display_name before calling the database", async () => {
    const res = await saveMyCampaignAmbassador(
      CAMPAIGN,
      SLUG,
      { ambassador: null },
      makeForm({ display_name: "   ", show_on_leaderboard: "on" })
    )
    expect(res.error).toBe("Hãy nhập tên hiển thị của bạn.")
    expect(state.userCalls).toHaveLength(0)
  })

  it("upserts strictly under user JWT (zero dbService), refreshes stats, and revalidates campaign and /me", async () => {
    const res = await saveMyCampaignAmbassador(
      CAMPAIGN,
      SLUG,
      { ambassador: null },
      makeForm({ display_name: "  CLB Sinh viên Xanh  ", show_on_leaderboard: "on" })
    )
    expect(state.serviceCalled).toBe(false)
    expect(state.tokens).toEqual(["user-jwt"])
    expect(state.userCalls.map((c) => c.target)).toEqual([
      "rpc:upsert_my_campaign_ambassador",
      "rpc:get_my_campaign_ambassador",
    ])
    expect(op(state.userCalls[0], "args")).toEqual([
      {
        p_campaign_id: CAMPAIGN,
        p_display_name: "CLB Sinh viên Xanh",
        p_show_on_leaderboard: true,
      },
    ])
    expect(res).toEqual({
      ambassador: {
        ref_code: "ab23cd45ef",
        display_name: "CLB Sinh viên Xanh",
        show_on_leaderboard: true,
        matched_count: 2,
        matched_total_vnd: 500_000,
        created_at: "2026-11-22T00:00:00Z",
        updated_at: "2026-11-22T00:01:00Z",
      },
      message: "Đã tạo liên kết kêu gọi của bạn.",
    })
    expect(state.revalidated).toEqual([`/campaigns/${SLUG}`, "/me"])
  })

  it("maps expired JWT and GIVE_* errors cleanly while preserving previous state", async () => {
    state.userHandler = () => ({ error: { code: "PGRST303", message: "JWT expired" } })
    expect(
      await saveMyCampaignAmbassador(CAMPAIGN, SLUG, { ambassador: null }, makeForm({ display_name: "Minh Anh" }))
    ).toEqual({
      ambassador: null,
      error: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })

    state.userHandler = () => ({ error: { code: "42501", message: "GIVE_ACCOUNT_NOT_ACTIVE" } })
    expect(
      await saveMyCampaignAmbassador(CAMPAIGN, SLUG, { ambassador: null }, makeForm({ display_name: "Minh Anh" }))
    ).toEqual({
      ambassador: null,
      error: "Tài khoản của bạn hiện không hoạt động nên không thể thực hiện thao tác này.",
    })

    state.userHandler = () => ({ error: { code: "23514", message: "GIVE_CAMPAIGN_NOT_ACCEPTING" } })
    expect(
      await saveMyCampaignAmbassador(CAMPAIGN, SLUG, { ambassador: null }, makeForm({ display_name: "Minh Anh" }))
    ).toEqual({
      ambassador: null,
      error: "Chiến dịch này hiện không còn mở tạo liên kết kêu gọi.",
    })
  })
})
