import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

const state = vi.hoisted(() => ({
  session: { user: { id: "11111111-1111-4111-8111-111111111111" }, accessToken: "tok" } as {
    user: { id: string }
    accessToken: string
  } | null,
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  revalidated: [] as string[],
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((path: string) => state.revalidated.push(path)),
}))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => state.session),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.handler(call), state.calls),
}))

const { toggleCampaignFollow } = await import("./follow-actions")

function formWith(intent: string) {
  const f = new FormData()
  f.set("intent", intent)
  return f
}

describe("toggleCampaignFollow action (DOS/Give#315)", () => {
  beforeEach(() => {
    state.session = { user: { id: USER }, accessToken: "tok" }
    state.calls.length = 0
    state.revalidated.length = 0
    state.handler = (call) => {
      if (call.target === "rpc:campaign_follower_count") return { data: 4 }
      return { data: null }
    }
  })

  it("refuses signed-out users and invalid UUIDs", async () => {
    state.session = null
    expect(await toggleCampaignFollow(CAMPAIGN, "demo", { following: false, count: 2 }, formWith("follow"))).toEqual({
      following: false,
      count: 2,
      error: "Hãy đăng nhập để theo dõi chiến dịch.",
    })

    state.session = { user: { id: USER }, accessToken: "tok" }
    expect(
      await toggleCampaignFollow("bad-id", "demo", { following: false, count: 2 }, formWith("follow"))
    ).toMatchObject({ error: "Không tìm thấy chiến dịch công khai để theo dõi." })
  })

  it("follows and unfollows under user RLS and refreshes campaign & contributions paths", async () => {
    const followed = await toggleCampaignFollow(
      CAMPAIGN,
      "sap-ra-mat",
      { following: false, count: 3 },
      formWith("follow")
    )
    expect(followed).toEqual({ following: true, count: 4 })
    expect(state.calls.some((c) => c.target === "campaign_follows" && op(c, "insert"))).toBe(true)
    expect(state.revalidated).toEqual(["/campaigns/sap-ra-mat", "/me/contributions"])

    state.calls.length = 0
    state.handler = (call) => {
      if (call.target === "rpc:campaign_follower_count") return { data: 3 }
      return { data: null }
    }
    const unfollowed = await toggleCampaignFollow(
      CAMPAIGN,
      "sap-ra-mat",
      { following: true, count: 4 },
      formWith("unfollow")
    )
    expect(unfollowed).toEqual({ following: false, count: 3 })
    expect(state.calls.some((c) => c.target === "campaign_follows" && op(c, "delete"))).toBe(true)
  })

  it("maps RLS 42501 refusal cleanly when target campaign is private", async () => {
    state.handler = (call) => {
      if (call.target === "campaign_follows") {
        return { data: null, error: { code: "42501", message: "new row violates row-level security policy" } }
      }
      return undefined
    }
    const res = await toggleCampaignFollow(CAMPAIGN, "nhap", { following: false, count: 0 }, formWith("follow"))
    expect(res).toEqual({
      following: false,
      count: 0,
      error: "Chiến dịch này hiện không mở công khai để theo dõi.",
    })
  })
})
