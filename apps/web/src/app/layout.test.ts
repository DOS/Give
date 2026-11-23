import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  pathname: "/",
  session: null as { user: { id: string; email: string | null; name: string | null }; accessToken: string } | null,
}))

vi.mock("next/font/google", () => ({
  Be_Vietnam_Pro: () => ({ variable: "--font-be-vietnam-pro" }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}))

const getSessionMock = vi.fn(async () => state.session)
vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}))

const countUnreadNoticesMock = vi.fn(async () => 3)
vi.mock("@/lib/notices", () => ({
  countUnreadNotices: countUnreadNoticesMock,
  unreadBadge: (n: number) => (n > 0 ? String(n) : null),
}))

vi.mock("@/lib/supabase", () => ({
  dbAs: vi.fn(() => ({})),
}))

vi.mock("@/components/layout/SiteHeader", () => ({
  SiteHeader: ({ session, unread }: { session: unknown; unread: string | null }) =>
    createElement("header", { "data-site-header": true }, session ? `SignedIn(${unread})` : "SignedOut"),
}))

vi.mock("@/components/layout/SiteFooter", () => ({
  SiteFooter: () => createElement("footer", null, "SiteFooter"),
}))

vi.mock("@/components/layout/RingBoxScroll", () => ({
  RingBoxScroll: () => createElement("div", { "data-testid": "ring-box-scroll" }),
}))

const { default: RootLayout } = await import("./layout")

describe("RootLayout chrome isolation (DOS/Give#335)", () => {
  beforeEach(() => {
    state.pathname = "/"
    state.session = {
      user: { id: "user-1", email: "user@dos.me", name: "Nguyễn An" },
      accessToken: "jwt-token",
    }
    getSessionMock.mockClear()
    countUnreadNoticesMock.mockClear()
  })

  it("renders SiteHeader, SiteFooter, and RingBoxScroll on normal routes", async () => {
    for (const path of ["/", "/campaigns/xay-truong", "/embedded"]) {
      state.pathname = path
      const html = renderToStaticMarkup(await RootLayout({ children: createElement("div", null, "Page") as ReactNode }))
      expect(html).toContain("SignedIn(3)")
      expect(html).toContain("SiteFooter")
      expect(html).toContain("ring-box-scroll")
      expect(html).toContain("Page")
    }
  })

  it("omits SiteHeader, SiteFooter, and RingBoxScroll on /embed and /embed/*", async () => {
    for (const path of ["/embed", "/embed/xay-truong", "/Embed/xay-truong"]) {
      state.pathname = path
      const html = renderToStaticMarkup(
        await RootLayout({ children: createElement("div", null, "Embed") as ReactNode })
      )
      expect(html).not.toContain("SignedIn")
      expect(html).not.toContain("SignedOut")
      expect(html).not.toContain("SiteFooter")
      expect(html).not.toContain("ring-box-scroll")
      expect(html).toContain("Embed")
    }
  })
})
