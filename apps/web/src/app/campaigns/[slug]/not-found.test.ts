import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { default: CampaignNotFound } = await import("./not-found")

const parser = new new Window().DOMParser()

describe("/campaigns/[slug] CampaignNotFound (DOS/Give#240)", () => {
  it("renders a whole-page EmptyState with secondary login action before primary discovery link", () => {
    const html = renderToStaticMarkup(createElement(CampaignNotFound))
    const doc = parser.parseFromString(html, "text/html")

    const root = doc.body.firstElementChild
    expect(root?.className).toContain("container-page")

    const icon = doc.querySelector("svg")
    expect(icon?.getAttribute("width")).toBe("40")
    expect(icon?.getAttribute("height")).toBe("40")

    expect(doc.querySelector("h1")?.textContent.trim()).toBe("Không tìm thấy chiến dịch")
    expect(doc.querySelector("p")?.textContent.replace(/\s+/g, " ").trim()).toBe(
      "Chiến dịch này không tồn tại, chưa được công khai hoặc đang tạm dừng. Nếu bạn là người tổ chức, hãy đăng nhập để xem và quản lý chiến dịch."
    )

    const loginLink = doc.querySelector('a[href="/auth/login?return_path=%2Fme%2Fcampaigns"]')!
    expect(loginLink).toBeTruthy()
    expect(loginLink.textContent.trim()).toBe("Đăng nhập")
    expect(loginLink.className).toContain("btn-secondary")

    const discoveryLink = doc.querySelector('a[href="/campaigns"]')!
    expect(discoveryLink).toBeTruthy()
    expect(discoveryLink.textContent.trim()).toBe("Khám phá chiến dịch")
    expect(discoveryLink.className).toContain("btn-primary")

    // DESIGN.md 6: secondary action sits before primary in whole-page EmptyState.
    const actionGroup = loginLink.parentElement!
    expect([...actionGroup.children]).toEqual([loginLink, discoveryLink])
  })
})
