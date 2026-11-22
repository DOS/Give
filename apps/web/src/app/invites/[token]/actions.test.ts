import { beforeEach, describe, expect, it, vi } from "vitest"

import { CAMPAIGN_MEMBER_MESSAGES } from "@/lib/errors"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "22222222-2222-4222-8222-222222222222"
const CAMPAIGN = "33333333-3333-4333-8333-333333333333"
const TOKEN = "f0".repeat(32)

const state = vi.hoisted(() => ({
  session: null as {
    user: { id: string; email: string | null; name: string | null }
    accessToken: string
  } | null,
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  tokens: [] as (string | undefined)[],
  serviceUsed: false,
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  })
)

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }))
vi.mock("next/navigation", () => ({ redirect: redirectMock }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => state.session),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) => {
    state.tokens.push(token)
    return fakeDb((call) => state.handler(call), state.calls)
  },
  dbService: () => {
    state.serviceUsed = true
    return fakeDb(() => undefined)
  },
}))

const { acceptCampaignInvite } = await import("./actions")

beforeEach(() => {
  state.session = { user: { id: USER, email: "editor@example.vn", name: "Minh" }, accessToken: "editor-jwt" }
  state.handler = () => undefined
  state.calls.length = 0
  state.tokens.length = 0
  state.serviceUsed = false
  revalidatePathMock.mockClear()
  redirectMock.mockClear()
})

describe("acceptCampaignInvite (DOS/Give#253)", () => {
  it("accepts a valid invite via dbAs(accessToken), never calls dbService, revalidates, and redirects to editor workspace", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:accept_campaign_member_invite") {
        return {
          data: [
            {
              campaign_id: CAMPAIGN,
              campaign_slug: "bep-am-vung-cao",
              role: "editor",
              accepted_at: "2026-11-22T02:00:00Z",
            },
          ],
        }
      }
      return undefined
    }

    await expect(acceptCampaignInvite(TOKEN.toUpperCase())).rejects.toThrow(`NEXT_REDIRECT:/me/campaigns/${CAMPAIGN}`)
    expect(state.serviceUsed).toBe(false)
    expect(state.tokens).toEqual(["editor-jwt"])
    expect(state.calls[0]?.target).toBe("rpc:accept_campaign_member_invite")
    expect(op(state.calls[0], "args")).toEqual([{ p_token: TOKEN }])
    expect(revalidatePathMock).toHaveBeenCalledWith("/me/campaigns")
    expect(revalidatePathMock).toHaveBeenCalledWith(`/me/campaigns/${CAMPAIGN}`)
    expect(revalidatePathMock).toHaveBeenCalledWith("/campaigns/bep-am-vung-cao")
    expect(redirectMock).toHaveBeenCalledWith(`/me/campaigns/${CAMPAIGN}`)
  })

  it("refuses signed-out callers and malformed tokens without touching DB or dbService", async () => {
    state.session = null
    expect(await acceptCampaignInvite(TOKEN)).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại để chấp nhận lời mời.",
    })
    state.session = { user: { id: USER, email: null, name: null }, accessToken: "editor-jwt" }
    expect(await acceptCampaignInvite("not-a-valid-token")).toEqual({
      ok: false,
      message: CAMPAIGN_MEMBER_MESSAGES.GIVE_INVITE_INVALID,
    })
    expect(state.calls).toHaveLength(0)
    expect(state.serviceUsed).toBe(false)
  })

  it.each([
    ["GIVE_INVITE_INVALID", CAMPAIGN_MEMBER_MESSAGES.GIVE_INVITE_INVALID],
    ["GIVE_INVITE_REVOKED", CAMPAIGN_MEMBER_MESSAGES.GIVE_INVITE_REVOKED],
    ["GIVE_INVITE_ALREADY_USED", CAMPAIGN_MEMBER_MESSAGES.GIVE_INVITE_ALREADY_USED],
    ["GIVE_INVITE_EXPIRED", CAMPAIGN_MEMBER_MESSAGES.GIVE_INVITE_EXPIRED],
    ["GIVE_ALREADY_CAMPAIGN_OWNER", CAMPAIGN_MEMBER_MESSAGES.GIVE_ALREADY_CAMPAIGN_OWNER],
    ["GIVE_ALREADY_CAMPAIGN_MEMBER", CAMPAIGN_MEMBER_MESSAGES.GIVE_ALREADY_CAMPAIGN_MEMBER],
    ["GIVE_CAMPAIGN_NOT_INVITABLE: cancelled", CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_NOT_INVITABLE],
    ["GIVE_CAMPAIGN_MEMBER_LIMIT: 20", CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_MEMBER_LIMIT],
    ["GIVE_RATE_LIMITED: 45", "Bạn thao tác quá nhanh. Hãy thử lại sau 45 giây."],
  ])("maps %s cleanly in Vietnamese without redirecting or calling dbService", async (code, expected) => {
    state.handler = () => ({ error: { message: code } })
    expect(await acceptCampaignInvite(TOKEN)).toEqual({ ok: false, message: expected })
    expect(redirectMock).not.toHaveBeenCalled()
    expect(state.serviceUsed).toBe(false)
  })
})
