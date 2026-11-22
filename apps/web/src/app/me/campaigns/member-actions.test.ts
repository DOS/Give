import { beforeEach, describe, expect, it, vi } from "vitest"

import { CAMPAIGN_MEMBER_MESSAGES } from "@/lib/errors"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const OWNER = "11111111-1111-4111-8111-111111111111"
const EDITOR = "22222222-2222-4222-8222-222222222222"
const CAMPAIGN = "33333333-3333-4333-8333-333333333333"
const INVITE_ID = "44444444-4444-4444-8444-444444444444"
const RAW_TOKEN = "ab".repeat(32)

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

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }))
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

const { createCampaignInvite, removeCampaignMember, revokeCampaignInvite } = await import("./member-actions")

function formOf(entries: Record<string, string> = {}) {
  const form = new FormData()
  for (const [k, v] of Object.entries(entries)) form.set(k, v)
  return form
}

beforeEach(() => {
  state.session = { user: { id: OWNER, email: "owner@example.vn", name: "Lan" }, accessToken: "owner-jwt" }
  state.handler = () => undefined
  state.calls.length = 0
  state.tokens.length = 0
  state.serviceUsed = false
  revalidatePathMock.mockClear()
})

describe("createCampaignInvite", () => {
  it("creates a single-use invite via dbAs(accessToken) without dbService and returns one-time invite path", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:create_campaign_member_invite") {
        return {
          data: [{ invite_id: INVITE_ID, token: RAW_TOKEN, expires_at: "2026-12-01T00:00:00Z" }],
        }
      }
      return undefined
    }

    const result = await createCampaignInvite(CAMPAIGN, null, formOf({ expires_in_hours: "72", note: "  Gửi Minh  " }))
    expect(result).toEqual({
      ok: true,
      message: "Đã tạo liên kết mời. Hãy sao chép và gửi ngay — liên kết này chỉ hiện một lần duy nhất.",
      invite: {
        inviteId: INVITE_ID,
        path: `/invites/${RAW_TOKEN}`,
        expiresAt: "2026-12-01T00:00:00Z",
      },
    })
    expect(state.serviceUsed).toBe(false)
    expect(state.tokens).toEqual(["owner-jwt"])
    expect(state.calls[0]?.target).toBe("rpc:create_campaign_member_invite")
    expect(op(state.calls[0], "args")).toEqual([
      { p_campaign_id: CAMPAIGN, p_expires_in_hours: 72, p_note: "Gửi Minh" },
    ])
    expect(revalidatePathMock).toHaveBeenCalledWith(`/me/campaigns/${CAMPAIGN}`)
  })

  it("refuses signed-out callers, invalid campaign ids, and out-of-range expiry without hitting DB", async () => {
    state.session = null
    expect(await createCampaignInvite(CAMPAIGN, null, formOf())).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    state.session = { user: { id: OWNER, email: null, name: null }, accessToken: "owner-jwt" }
    expect(await createCampaignInvite("not-a-uuid", null, formOf())).toEqual({
      ok: false,
      message: CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_OWNER_ONLY,
    })
    expect((await createCampaignInvite(CAMPAIGN, null, formOf({ expires_in_hours: "999" })))?.ok).toBe(false)
    expect((await createCampaignInvite(CAMPAIGN, null, formOf({ note: "x".repeat(121) })))?.ok).toBe(false)
    expect(state.calls).toHaveLength(0)
    expect(state.serviceUsed).toBe(false)
  })

  it("maps owner-only, non-invitable, limits, and rate-limit retry-after seconds cleanly", async () => {
    for (const [dbMsg, expected] of [
      ["GIVE_CAMPAIGN_OWNER_ONLY", CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_OWNER_ONLY],
      ["GIVE_CAMPAIGN_NOT_INVITABLE: cancelled", CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_NOT_INVITABLE],
      ["GIVE_CAMPAIGN_MEMBER_LIMIT: 20", CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_MEMBER_LIMIT],
      ["GIVE_CAMPAIGN_INVITE_LIMIT: 20", CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_INVITE_LIMIT],
      ["GIVE_RATE_LIMITED: 120", "Bạn thao tác quá nhanh. Hãy thử lại sau khoảng 2 phút."],
    ] as const) {
      state.handler = () => ({ error: { message: dbMsg } })
      expect(await createCampaignInvite(CAMPAIGN, null, formOf())).toEqual({ ok: false, message: expected })
    }
    expect(state.serviceUsed).toBe(false)
  })
})

describe("revokeCampaignInvite", () => {
  it("revokes a pending invite via dbAs(accessToken) and revalidates", async () => {
    state.handler = (call) => (call.target === "rpc:revoke_campaign_member_invite" ? { data: "revoked" } : undefined)
    const result = await revokeCampaignInvite(CAMPAIGN, INVITE_ID)
    expect(result).toEqual({ ok: true, message: "Đã thu hồi liên kết mời." })
    expect(state.serviceUsed).toBe(false)
    expect(state.calls[0]?.target).toBe("rpc:revoke_campaign_member_invite")
    expect(op(state.calls[0], "args")).toEqual([{ p_invite_id: INVITE_ID }])
    expect(revalidatePathMock).toHaveBeenCalledWith(`/me/campaigns/${CAMPAIGN}`)
  })

  it("maps GIVE_INVITE_ALREADY_ACCEPTED and GIVE_CAMPAIGN_OWNER_ONLY", async () => {
    state.handler = () => ({ error: { message: "GIVE_INVITE_ALREADY_ACCEPTED" } })
    expect(await revokeCampaignInvite(CAMPAIGN, INVITE_ID)).toEqual({
      ok: false,
      message: CAMPAIGN_MEMBER_MESSAGES.GIVE_INVITE_ALREADY_ACCEPTED,
    })
    state.handler = () => ({ error: { message: "GIVE_CAMPAIGN_OWNER_ONLY" } })
    expect(await revokeCampaignInvite(CAMPAIGN, INVITE_ID)).toEqual({
      ok: false,
      message: CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_OWNER_ONLY,
    })
    expect(state.serviceUsed).toBe(false)
  })
})

describe("removeCampaignMember", () => {
  it("removes a co-organizer via dbAs(accessToken) and revalidates campaign and public page", async () => {
    state.handler = (call) => (call.target === "rpc:remove_campaign_member" ? { data: "removed" } : undefined)
    const result = await removeCampaignMember(CAMPAIGN, EDITOR, "bep-am-vung-cao")
    expect(result).toEqual({ ok: true, message: "Đã gỡ đồng tổ chức khỏi chiến dịch." })
    expect(state.serviceUsed).toBe(false)
    expect(state.calls[0]?.target).toBe("rpc:remove_campaign_member")
    expect(op(state.calls[0], "args")).toEqual([{ p_campaign_id: CAMPAIGN, p_user_id: EDITOR }])
    expect(revalidatePathMock).toHaveBeenCalledWith(`/me/campaigns/${CAMPAIGN}`)
    expect(revalidatePathMock).toHaveBeenCalledWith("/me/campaigns")
    expect(revalidatePathMock).toHaveBeenCalledWith("/campaigns/bep-am-vung-cao")
  })

  it("maps GIVE_CAMPAIGN_OWNER_ONLY and GIVE_CAMPAIGN_MEMBER_NOT_FOUND", async () => {
    state.handler = () => ({ error: { message: "GIVE_CAMPAIGN_OWNER_ONLY" } })
    expect(await removeCampaignMember(CAMPAIGN, EDITOR, "bep-am")).toEqual({
      ok: false,
      message: CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_OWNER_ONLY,
    })
    state.handler = () => ({ error: { message: "GIVE_CAMPAIGN_MEMBER_NOT_FOUND" } })
    expect(await removeCampaignMember(CAMPAIGN, EDITOR, "bep-am")).toEqual({
      ok: false,
      message: CAMPAIGN_MEMBER_MESSAGES.GIVE_CAMPAIGN_MEMBER_NOT_FOUND,
    })
    expect(state.serviceUsed).toBe(false)
  })
})
