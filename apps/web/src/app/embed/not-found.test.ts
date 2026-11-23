// @vitest-environment happy-dom
import { Window } from "happy-dom"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  theme: null as string | null,
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.theme ? `theme=${state.theme}` : ""),
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

const { default: EmbedNotFound } = await import("./not-found")
const { default: EmbedRootPage } = await import("./page")
const { default: EmbedNestedNotFoundPage } = await import("./[slug]/[...rest]/page")
const { EmbedNotFoundCard } = await import("@/components/EmbedNotFoundCard")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const parser = new new Window().DOMParser()
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  state.theme = null
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://give.vn")
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllEnvs()
})

describe("/embed fallback routes and EmbedNotFound (DOS/Give#335)", () => {
  it("calls notFound() on /embed root and /embed/[slug]/[...rest] nested paths", () => {
    expect(() => EmbedRootPage()).toThrow("NEXT_NOT_FOUND")
    expect(() => EmbedNestedNotFoundPage()).toThrow("NEXT_NOT_FOUND")
  })

  it("renders compact chrome-free not-found card linking out in a new tab and honors ?theme=", () => {
    const html = renderToStaticMarkup(createElement(EmbedNotFound))
    const doc = parser.parseFromString(html, "text/html")

    expect(doc.querySelector("h1")?.textContent.trim()).toBe("Không tìm thấy chiến dịch")
    const card = doc.querySelector("[data-embed-theme]")!
    expect(card.getAttribute("data-embed-theme")).toBe("light")
    expect(card.className).toContain("rounded-md")
    const link = doc.querySelector('a[href="https://give.vn/campaigns"]')!
    expect(link).toBeTruthy()
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    expect(doc.querySelectorAll("form")).toHaveLength(0)

    state.theme = "dark"
    act(() => {
      root.render(createElement(EmbedNotFoundCard, { campaignsUrl: "https://give.vn/campaigns" }))
    })
    expect(container.querySelector("[data-embed-theme]")?.getAttribute("data-embed-theme")).toBe("dark")

    state.theme = "invalid"
    act(() => {
      root.render(createElement(EmbedNotFoundCard, { campaignsUrl: "https://give.vn/campaigns" }))
    })
    expect(container.querySelector("[data-embed-theme]")?.getAttribute("data-embed-theme")).toBe("light")
  })
})
