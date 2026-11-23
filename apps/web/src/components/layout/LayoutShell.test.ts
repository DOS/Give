// @vitest-environment happy-dom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  pathname: "/" as string | null,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}))

vi.mock("@/components/layout/RingBoxScroll", () => ({
  RingBoxScroll: () => createElement("div", { "data-testid": "ring-box-scroll" }),
}))

const { LayoutShell, isEmbedRoute } = await import("./LayoutShell")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  state.pathname = "/"
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("LayoutShell (DOS/Give#335)", () => {
  it("recognizes /embed and /embed/* without matching /embedded", () => {
    expect(isEmbedRoute("/embed")).toBe(true)
    expect(isEmbedRoute("/embed/xay-truong")).toBe(true)
    expect(isEmbedRoute("/embedded")).toBe(false)
    expect(isEmbedRoute("/campaigns/xay-truong")).toBe(false)
    expect(isEmbedRoute(null)).toBe(false)
  })

  it("renders header, footer, and RingBoxScroll on normal routes (SSR + client)", () => {
    for (const path of ["/", "/campaigns/xay-truong", "/embedded"]) {
      state.pathname = path
      const element = createElement(
        LayoutShell,
        {
          header: createElement("header", { "data-site-header": true }, "Header"),
          footer: createElement("footer", null, "Footer"),
        },
        createElement("p", null, "Body")
      )

      const ssr = renderToStaticMarkup(element)
      expect(ssr).toContain("Header")
      expect(ssr).toContain("Footer")
      expect(ssr).toContain("ring-box-scroll")
      expect(ssr).toContain("Body")

      act(() => root.render(element))
      expect(container.querySelector("header")?.textContent).toBe("Header")
      expect(container.querySelector("footer")?.textContent).toBe("Footer")
      expect(container.querySelector('[data-testid="ring-box-scroll"]')).not.toBeNull()
      expect(container.querySelector("main#main")?.textContent).toBe("Body")
    }
  })

  it("omits header, footer, and RingBoxScroll on /embed and /embed/* (SSR + client)", () => {
    for (const path of ["/embed", "/embed/xay-truong"]) {
      state.pathname = path
      const element = createElement(
        LayoutShell,
        {
          header: createElement("header", { "data-site-header": true }, "Header"),
          footer: createElement("footer", null, "Footer"),
        },
        createElement("p", null, "Widget")
      )

      const ssr = renderToStaticMarkup(element)
      expect(ssr).not.toContain("Header")
      expect(ssr).not.toContain("Footer")
      expect(ssr).not.toContain("ring-box-scroll")
      expect(ssr).toContain("Widget")

      act(() => root.render(element))
      expect(container.querySelector("header")).toBeNull()
      expect(container.querySelector("footer")).toBeNull()
      expect(container.querySelector('[data-testid="ring-box-scroll"]')).toBeNull()
      expect(container.querySelector("main#main")?.textContent).toBe("Widget")
    }
  })
})
