import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { PublicProfileForm } = await import("./PublicProfileForm")

describe("PublicProfileForm (/me, DOS/Give#251)", () => {
  it("renders live preview URL, existing public profile link, bio character count, and privacy note", () => {
    const html = renderToStaticMarkup(
      createElement(PublicProfileForm, {
        initialHandle: "quy-ban-may",
        initialBio: "Hỗ trợ học sinh vùng cao.",
        action: async () => null,
      })
    )
    const doc = new Window().document
    doc.body.innerHTML = html

    expect(doc.querySelector("#handle")?.getAttribute("value")).toBe("quy-ban-may")
    expect(doc.querySelector("#handle_hint")?.textContent).toContain("give.vn/u/quy-ban-may")
    expect(doc.querySelector('a[href="/u/quy-ban-may"]')?.textContent).toBe("give.vn/u/quy-ban-may")
    expect(doc.querySelector("#bio")?.textContent).toBe("Hỗ trợ học sinh vùng cao.")
    expect(html).toContain("25/500")
    expect(html).toContain("không làm mất trạng thái xác minh")
  })

  it("shows helper copy without public link when handle is unset", () => {
    const html = renderToStaticMarkup(
      createElement(PublicProfileForm, {
        initialHandle: null,
        initialBio: null,
        action: async () => null,
      })
    )
    const doc = new Window().document
    doc.body.innerHTML = html

    expect(doc.querySelector('a[href^="/u/"]')).toBeNull()
    expect(doc.querySelector("#handle_hint")?.textContent).toContain("Để trống nếu chưa muốn mở trang công khai")
    expect(html).toContain("0/500")
  })
})
