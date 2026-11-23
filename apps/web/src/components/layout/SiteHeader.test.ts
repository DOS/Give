import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ usePathname: () => "/me/following" }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { SiteHeader } = await import("./SiteHeader")

describe("SiteHeader account navigation (DOS/Give#337)", () => {
  it("shows 'Đang theo dõi' -> /me/following in desktop and mobile menus when signed in, and hides it when signed out", () => {
    const signedInHtml = renderToStaticMarkup(
      createElement(SiteHeader, {
        session: { user: { id: "u-1", email: "user@dos.me", name: "An" }, accessToken: "jwt" },
        unread: null,
      })
    )
    const signedInDoc = new Window().document
    signedInDoc.body.innerHTML = signedInHtml
    const followingLinks = [...signedInDoc.querySelectorAll('a[href="/me/following"]')]
    expect(followingLinks).toHaveLength(2)
    for (const link of followingLinks) {
      expect(link.textContent).toBe("Đang theo dõi")
    }

    const signedOutHtml = renderToStaticMarkup(createElement(SiteHeader, { session: null, unread: null }))
    expect(signedOutHtml).not.toContain("/me/following")
  })
})
