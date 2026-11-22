import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: ({ unoptimized: _unoptimized, ...rest }: { src: string; alt: string; unoptimized?: boolean }) =>
    createElement("img", rest),
}))

const { OrganizerAvatar } = await import("./OrganizerAvatar")

describe("OrganizerAvatar (DOS/Give#251)", () => {
  it("renders a safe HTTPS avatar with no-referrer and 4px radius", () => {
    const html = renderToStaticMarkup(
      createElement(OrganizerAvatar, {
        displayName: "Quỹ Bản Mây",
        avatarUrl: "https://cdn.dos.me/avatars/ban-may.webp",
      })
    )
    expect(html).toContain("<img")
    expect(html).toContain('src="https://cdn.dos.me/avatars/ban-may.webp"')
    expect(html).toContain('referrerPolicy="no-referrer"')
    expect(html).toContain("rounded")
    expect(html).not.toContain("rounded-full")
  })

  it.each([null, undefined, "", "javascript:alert(1)", "http://insecure.example/a.png", "https://localhost/a.png"])(
    "falls back to an initials tile when avatarUrl is missing or unsafe (%s)",
    (avatarUrl) => {
      const html = renderToStaticMarkup(
        createElement(OrganizerAvatar, {
          displayName: "đồng hành vùng cao",
          avatarUrl,
        })
      )
      expect(html).not.toContain("<img")
      expect(html).toContain(">Đ</span>")
    }
  )
})
