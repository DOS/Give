import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  headers: new Headers(),
  pathname: "/",
  session: null as { user: { id: string; email: string | null; name: string | null }; accessToken: string } | null,
}))

vi.mock("next/font/google", () => ({
  Be_Vietnam_Pro: () => ({ variable: "--font-be-vietnam-pro" }),
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => state.headers),
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

describe("RootLayout chrome & session isolation (DOS/Give#335)", () => {
  beforeEach(() => {
    state.headers = new Headers()
    state.pathname = "/"
    state.session = {
      user: { id: "user-1", email: "user@dos.me", name: "Nguyễn An" },
      accessToken: "jwt-token",
    }
    getSessionMock.mockClear()
    countUnreadNoticesMock.mockClear()
  })

  it("renders SiteHeader, SiteFooter, and RingBoxScroll with session on normal routes", async () => {
    const html = renderToStaticMarkup(await RootLayout({ children: createElement("div", null, "Page") as ReactNode }))
    expect(getSessionMock).toHaveBeenCalledTimes(1)
    expect(countUnreadNoticesMock).toHaveBeenCalledTimes(1)
    expect(html).toContain("SignedIn(3)")
    expect(html).toContain("SiteFooter")
    expect(html).toContain("ring-box-scroll")
    expect(html).toContain("Page")
  })

  it("skips getSession() and omits chrome completely when x-give-embed is 1", async () => {
    state.headers = new Headers({ "x-give-embed": "1" })
    state.pathname = "/embed/xay-truong"

    const html = renderToStaticMarkup(await RootLayout({ children: createElement("div", null, "Embed") as ReactNode }))
    expect(getSessionMock).not.toHaveBeenCalled()
    expect(countUnreadNoticesMock).not.toHaveBeenCalled()
    expect(html).not.toContain("SignedIn")
    expect(html).not.toContain("SignedOut")
    expect(html).not.toContain("SiteFooter")
    expect(html).not.toContain("ring-box-scroll")
    expect(html).toContain("Embed")
  })
})
