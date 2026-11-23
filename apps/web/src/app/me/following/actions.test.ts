import { revalidatePath } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getSession } from "@/lib/auth/session"
import { dbAs } from "@/lib/supabase"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  tokens: [] as (string | undefined)[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }))
vi.mock("@/lib/supabase", () => ({
  dbAs: vi.fn((token?: string) => {
    state.tokens.push(token)
    return fakeDb((call) => state.handler(call), state.calls)
  }),
  dbService: () => {
    throw new Error("/me/following actions must NEVER call dbService()")
  },
}))

const { unfollowFollowedCampaign, unfollowFollowedOrganizer } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  state.calls.length = 0
  state.tokens.length = 0
  state.handler = () => ({ data: true })
  vi.mocked(getSession).mockResolvedValue({
    user: { id: USER, email: null, name: null },
    accessToken: "donor-jwt",
  })
})

describe("unfollowFollowedCampaign (/me/following, DOS/Give#337)", () => {
  it("refuses signed-out users and invalid campaign UUIDs without touching DB", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect(await unfollowFollowedCampaign(null, form({ campaign_id: CAMPAIGN, campaign_slug: "bep-am" }))).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(dbAs).not.toHaveBeenCalled()

    expect(await unfollowFollowedCampaign(null, form({ campaign_id: "not-a-uuid", campaign_slug: "bep-am" }))).toEqual({
      ok: false,
      message: "Không tìm thấy chiến dịch cần hủy theo dõi.",
    })
    expect(dbAs).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("unfollows under caller JWT, ignores unsafe slugs, and revalidates /me/following, /me/contributions, and campaign page", async () => {
    const res = await unfollowFollowedCampaign(null, form({ campaign_id: CAMPAIGN, campaign_slug: "bep-am-vung-cao" }))
    expect(res).toEqual({ ok: true, message: "Đã hủy theo dõi chiến dịch." })
    expect(state.tokens).toEqual(["donor-jwt"])
    expect(state.calls).toHaveLength(1)
    expect(state.calls[0].target).toBe("campaign_follows")
    expect(op(state.calls[0], "delete")).toBeDefined()
    expect(state.calls[0].ops).toContainEqual(["eq", "user_id", USER])
    expect(state.calls[0].ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ["/me/following"],
      ["/me/contributions"],
      ["/campaigns/bep-am-vung-cao"],
    ])

    vi.mocked(revalidatePath).mockClear()
    await unfollowFollowedCampaign(null, form({ campaign_id: CAMPAIGN, campaign_slug: "../evil" }))
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/me/following"], ["/me/contributions"]])
  })

  it("maps expired JWT and DB errors cleanly without revalidating", async () => {
    state.handler = () => ({ error: { code: "PGRST303", message: "JWT expired" } })
    expect(await unfollowFollowedCampaign(null, form({ campaign_id: CAMPAIGN, campaign_slug: "bep-am" }))).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("unfollowFollowedOrganizer (/me/following, DOS/Give#337)", () => {
  it("refuses signed-out callers and invalid or reserved handles without touching DB", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect(await unfollowFollowedOrganizer(null, form({ handle: "quy-ban-may" }))).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(dbAs).not.toHaveBeenCalled()

    for (const bad of ["", "ab", "admin", "CAMPAIGNS", "../bad", "bad--slug"]) {
      expect(await unfollowFollowedOrganizer(null, form({ handle: bad }))).toEqual({
        ok: false,
        message: "Không tìm thấy hồ sơ người tổ chức công khai.",
      })
    }
    expect(dbAs).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("normalizes handle, calls handle-only unfollowOrganizerByHandle RPC (zero organizer_id), and revalidates", async () => {
    const res = await unfollowFollowedOrganizer(null, form({ handle: "  QuY-Ban-May  " }))
    expect(res).toEqual({ ok: true, message: "Đã hủy theo dõi người tổ chức." })
    expect(state.tokens).toEqual(["donor-jwt"])
    expect(state.calls.map((c) => c.target)).toEqual(["rpc:unfollow_organizer_by_handle"])
    expect(op(state.calls[0], "args")).toEqual([{ p_handle: "quy-ban-may" }])
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/me/following"], ["/me/contributions"], ["/u/quy-ban-may"]])
  })

  it("maps expired JWT and DB errors cleanly without revalidating", async () => {
    state.handler = () => ({ error: { code: "PGRST301", message: "Invalid JWT" } })
    expect(await unfollowFollowedOrganizer(null, form({ handle: "quy-ban-may" }))).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
