import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { MePage } = await import("./MePage")

describe("MePage navigation (DOS/Give#337)", () => {
  it("includes 'Đang theo dõi' -> /me/following and marks it current when section is 'following'", () => {
    const html = renderToStaticMarkup(
      createElement(MePage, { section: "following" }, createElement("div", null, "Body"))
    )
    const doc = new Window().document
    doc.body.innerHTML = html

    const links = [...doc.querySelectorAll('a[href="/me/following"]')]
    expect(links.length).toBeGreaterThanOrEqual(2) // mobile TabNav + desktop SectionNav
    for (const link of links) {
      expect(link.textContent).toBe("Đang theo dõi")
      expect(link.getAttribute("aria-current")).toBe("page")
    }
  })
})
