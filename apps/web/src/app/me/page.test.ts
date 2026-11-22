import { Window } from "happy-dom"
import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Organizer } from "@/lib/campaigns"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  tokens: [] as (string | undefined)[],
}))

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  })
)

const requireSessionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    user: { id: USER, email: "org@example.vn", name: "Lan" },
    accessToken: "org-jwt",
  }))
)

vi.mock("next/navigation", () => ({ redirect: redirectMock }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))
vi.mock("@/lib/auth/session", () => ({ requireSession: requireSessionMock }))
vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) => {
    state.tokens.push(token)
    return fakeDb((call) => state.handler(call), state.calls)
  },
}))
vi.mock("./_components/MePage", () => ({
  MePage: ({ section, children }: { section: string; children: ReactNode }) =>
    createElement("main", { "data-section": section }, children),
}))

const { default: MyProfilePage } = await import("./page")

function organizerFixture(overrides: Partial<Organizer> = {}): Organizer {
  return {
    user_id: USER,
    kind: "organization",
    legal_name: "Quỹ Bản Mây TNHH",
    display_name: "Quỹ Bản Mây",
    phone: "0901234567",
    handle: "quy-ban-may",
    bio: "Xây trường học cho trẻ em vùng cao.",
    verification_status: "verified",
    verified_at: "2026-11-01T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.calls.length = 0
  state.tokens.length = 0
  state.handler = () => ({ data: organizerFixture() })
})

describe("MyProfilePage (/me, DOS/Give#251)", () => {
  it("redirects expired JWT errors to /auth/login?return_path=%2Fme", async () => {
    state.handler = () => ({ error: { code: "PGRST303", message: "JWT expired" } })
    await expect(MyProfilePage()).rejects.toThrow("NEXT_REDIRECT:/auth/login?return_path=%2Fme")
    expect(redirectMock).toHaveBeenCalledWith("/auth/login?return_path=%2Fme")
  })

  it("renders an empty state pointing to /start when the signed-in user has no organizer profile", async () => {
    state.handler = () => ({ data: null })
    const html = renderToStaticMarkup(await MyProfilePage())
    expect(requireSessionMock).toHaveBeenCalledWith("/me")
    expect(html).toContain('data-section="profile"')
    expect(html).toContain("Bạn chưa có hồ sơ người tổ chức.")
    expect(html).toContain('href="/start"')
    expect(html).not.toContain('name="handle"')
  })

  it("renders the handle/bio editor, URL preview, direct /u/<handle> link, and verification summary", async () => {
    const html = renderToStaticMarkup(await MyProfilePage())
    expect(state.tokens).toEqual(["org-jwt"])
    expect(op(state.calls[0], "eq")).toEqual(["user_id", USER])

    const doc = new Window().document
    doc.body.innerHTML = html

    expect(doc.querySelector("h1")?.textContent).toBe("Hồ sơ người tổ chức")
    expect(html).toContain("Đã xác minh")
    expect(doc.querySelector('a[href="/u/quy-ban-may"]')).not.toBeNull()
    expect(html).toContain("give.vn/u/quy-ban-may")
    expect(doc.querySelector('input[name="handle"]')?.getAttribute("value")).toBe("quy-ban-may")
    expect(doc.querySelector('textarea[name="bio"]')?.textContent).toBe("Xây trường học cho trẻ em vùng cao.")
    expect(html).toContain("không làm mất trạng thái xác minh")
    expect(html).toContain("Quỹ Bản Mây")
    expect(doc.querySelector('a[href="/start"]')).not.toBeNull()
  })

  it("omits the public profile link when the organizer has not set a handle yet", async () => {
    state.handler = () => ({ data: organizerFixture({ handle: null, bio: null }) })
    const html = renderToStaticMarkup(await MyProfilePage())
    expect(html).not.toContain('href="/u/')
    expect(html).not.toContain("Xem trang công khai")
  })

  it("renders 'Liên kết đồng hành của tôi' from list_my_ambassador_links under user JWT for non-organizers and organizers (DOS/Give#319)", async () => {
    state.handler = (call) => {
      if (call.target === "organizers") return { data: null }
      if (call.target === "rpc:list_my_ambassador_links") {
        return {
          data: [
            {
              campaign_id: "22222222-2222-4222-8222-222222222222",
              campaign_slug: "xay-truong-ban-may",
              campaign_title: "Xây trường Bản Mây",
              campaign_status: "live",
              campaign_type: "give",
              ref_code: "ab23cd45ef",
              display_name: "CLB Sinh viên Xanh",
              show_on_leaderboard: true,
              matched_count: 3,
              matched_total_vnd: 900_000,
              created_at: "2026-11-22T00:00:00Z",
              updated_at: "2026-11-22T00:00:00Z",
            },
          ],
        }
      }
      return undefined
    }
    const html = renderToStaticMarkup(await MyProfilePage())
    expect(state.tokens).toEqual(["org-jwt"])
    expect(state.calls.some((c) => c.target === "rpc:list_my_ambassador_links")).toBe(true)
    expect(html).toContain("Liên kết đồng hành của tôi")
    expect(html).toContain("Xây trường Bản Mây")
    expect(html).toContain("?ref=ab23cd45ef")
    expect(html).toContain("900.000")
    expect(html).toContain("Sao chép liên kết")
  })
})
