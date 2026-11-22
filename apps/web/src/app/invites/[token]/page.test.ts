import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, type Call, type Handler } from "@/test/fake-db"

const USER = "22222222-2222-4222-8222-222222222222"
const CAMPAIGN = "33333333-3333-4333-8333-333333333333"
const TOKEN = "a1b2c3d4".repeat(8)

const state = vi.hoisted(() => ({
  session: null as {
    user: { id: string; email: string | null; name: string | null }
    accessToken: string
  } | null,
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  serviceUsed: false,
}))

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  })
)

vi.mock("next/navigation", () => ({ redirect: redirectMock }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => state.session),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.handler(call), state.calls),
  dbService: () => {
    state.serviceUsed = true
    return fakeDb(() => undefined)
  },
}))

const { default: InviteAcceptPage } = await import("./page")

beforeEach(() => {
  state.session = null
  state.handler = () => undefined
  state.calls.length = 0
  state.serviceUsed = false
  redirectMock.mockClear()
})

describe("InviteAcceptPage (DOS/Give#253)", () => {
  it("renders invalid state for malformed tokens without calling DB or building untrusted login return_path", async () => {
    const html = renderToStaticMarkup(await InviteAcceptPage({ params: Promise.resolve({ token: "//evil.com" }) }))
    expect(html).toContain("Liên kết lời mời không hợp lệ")
    expect(html).not.toContain("/auth/login")
    expect(html).not.toContain("evil.com")
    expect(state.calls).toHaveLength(0)
    expect(state.serviceUsed).toBe(false)
  })

  it("prompts signed-out guests to log in with clean encoded return_path and never leaks draft titles or uses dbService", async () => {
    const html = renderToStaticMarkup(await InviteAcceptPage({ params: Promise.resolve({ token: TOKEN }) }))
    expect(html).toContain("Lời mời tham gia đồng tổ chức")
    expect(html).toContain(`href="/auth/login?return_path=${encodeURIComponent(`/invites/${TOKEN}`)}"`)
    expect(html).toContain("Đăng nhập để xem lời mời")
    expect(state.calls).toHaveLength(0)
    expect(state.serviceUsed).toBe(false)
  })

  it("renders pending invite details, money boundary explanation, and accept button for signed-in invitee", async () => {
    state.session = { user: { id: USER, email: "editor@example.vn", name: "Minh" }, accessToken: "editor-jwt" }
    state.handler = (call) => {
      if (call.target === "rpc:preview_campaign_member_invite") {
        return {
          data: [
            {
              status: "pending",
              campaign_id: CAMPAIGN,
              campaign_slug: "bep-am-vung-cao",
              campaign_title: "Bếp ấm vùng cao",
              organizer_display_name: "Quỹ Bếp Ấm",
              role: "editor",
              expires_at: "2026-12-01T00:00:00Z",
            },
          ],
        }
      }
      if (call.target === "rpc:my_campaign_roles") return { data: [] }
      return undefined
    }

    const html = renderToStaticMarkup(await InviteAcceptPage({ params: Promise.resolve({ token: TOKEN }) }))
    expect(html).toContain("Bếp ấm vùng cao")
    expect(html).toContain("Quỹ Bếp Ấm")
    expect(html).toContain("Chấp nhận lời mời")
    expect(html).toContain("Phạm vi quyền của đồng tổ chức")
    expect(html).toContain("Minh")
    expect(state.serviceUsed).toBe(false)
  })

  it("shows owner/editor shortcut without accept button when caller already belongs to the campaign", async () => {
    state.session = { user: { id: USER, email: null, name: "Lan" }, accessToken: "owner-jwt" }
    state.handler = (call) => {
      if (call.target === "rpc:preview_campaign_member_invite") {
        return {
          data: [
            {
              status: "pending",
              campaign_id: CAMPAIGN,
              campaign_slug: "bep-am",
              campaign_title: "Bếp ấm",
              organizer_display_name: "Lan",
              role: "editor",
              expires_at: "2026-12-01T00:00:00Z",
            },
          ],
        }
      }
      if (call.target === "rpc:my_campaign_roles") {
        return { data: [{ campaign_id: CAMPAIGN, role: "owner" }] }
      }
      return undefined
    }

    const html = renderToStaticMarkup(await InviteAcceptPage({ params: Promise.resolve({ token: TOKEN }) }))
    expect(html).toContain("Bạn đang là người tổ chức chính của chiến dịch này")
    expect(html).toContain(`href="/me/campaigns/${CAMPAIGN}"`)
    expect(html).not.toContain("Chấp nhận lời mời")
    expect(state.serviceUsed).toBe(false)
  })

  it.each([
    ["accepted", "Liên kết lời mời đã được sử dụng"],
    ["revoked", "Lời mời đã bị thu hồi"],
    ["expired", "Lời mời đã hết hạn"],
    ["unavailable", "Chiến dịch không thể thêm đồng tổ chức"],
    ["invalid", "Liên kết lời mời không hợp lệ"],
  ] as const)("renders dedicated Vietnamese state for non-pending status '%s'", async (status, title) => {
    state.session = { user: { id: USER, email: null, name: "Minh" }, accessToken: "editor-jwt" }
    state.handler = (call) => {
      if (call.target === "rpc:preview_campaign_member_invite") {
        return {
          data: [
            {
              status,
              campaign_id: null,
              campaign_slug: null,
              campaign_title: null,
              organizer_display_name: null,
              role: null,
              expires_at: null,
            },
          ],
        }
      }
      return undefined
    }

    const html = renderToStaticMarkup(await InviteAcceptPage({ params: Promise.resolve({ token: TOKEN }) }))
    expect(html).toContain(title)
    expect(html).not.toContain("Chấp nhận lời mời")
    expect(state.serviceUsed).toBe(false)
  })

  it("redirects to login when preview rejects an expired JWT (PGRST301) or raises GIVE_AUTH_REQUIRED", async () => {
    state.session = { user: { id: USER, email: null, name: "Minh" }, accessToken: "expired-jwt" }
    const expected = `/auth/login?return_path=${encodeURIComponent(`/invites/${TOKEN}`)}`

    state.handler = (call) => {
      if (call.target === "rpc:preview_campaign_member_invite") {
        return { error: { code: "PGRST301", message: "JWT expired" } }
      }
      return undefined
    }
    await expect(InviteAcceptPage({ params: Promise.resolve({ token: TOKEN }) })).rejects.toThrow(
      `NEXT_REDIRECT:${expected}`
    )

    state.handler = (call) => {
      if (call.target === "rpc:preview_campaign_member_invite") {
        return { error: { code: "42501", message: "GIVE_AUTH_REQUIRED" } }
      }
      return undefined
    }
    await expect(InviteAcceptPage({ params: Promise.resolve({ token: TOKEN }) })).rejects.toThrow(
      `NEXT_REDIRECT:${expected}`
    )
  })

  it("renders a calm Vietnamese rate-limit EmptyState when preview raises GIVE_RATE_LIMITED / PT429", async () => {
    state.session = { user: { id: USER, email: null, name: "Minh" }, accessToken: "editor-jwt" }
    state.handler = (call) => {
      if (call.target === "rpc:preview_campaign_member_invite") {
        return { error: { code: "PT429", message: "GIVE_RATE_LIMITED: 90" } }
      }
      return undefined
    }

    const html = renderToStaticMarkup(await InviteAcceptPage({ params: Promise.resolve({ token: TOKEN }) }))
    expect(html).toContain("Bạn thao tác quá nhanh")
    expect(html).toContain("Hãy thử lại sau khoảng 2 phút.")
    expect(html).not.toContain("Chấp nhận lời mời")
  })
})
