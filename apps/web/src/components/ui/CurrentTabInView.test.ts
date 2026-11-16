// @vitest-environment happy-dom
/**
 * Covers `CurrentTabInView`'s horizontal tab centering on mount and `pathname`
 * changes when the `<ul>` overflows, plus no-op guards when the row fits or has
 * no `[aria-current="page"]` tab (DOS/Give#218).
 */
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({ pathname: "/admin/accounts" }))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}))

const { CurrentTabInView } = await import("./CurrentTabInView")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const ROW_LEFT = 16

let container: HTMLDivElement
let root: Root
let rowClientWidth = 300
let rowScrollWidth = 700
let scrollLeft = 0
let scrollWrites = 0

const rect = (left: number, width: number) =>
  ({ left, right: left + width, width, top: 0, bottom: 44, height: 44, x: left, y: 0 }) as DOMRect

const tabs = [
  { href: "/admin", label: "Kiểm duyệt", x: 0, w: 96 },
  { href: "/admin/accounts", label: "Tài khoản nhận", x: 260, w: 80 },
  { href: "/admin/statements", label: "Sao kê", x: 450, w: 100 },
]

function renderTabs(activeHref: string | null) {
  return createElement(
    CurrentTabInView,
    null,
    createElement(
      "ul",
      { "data-tab-row": "" },
      ...tabs.map((t) =>
        createElement(
          "li",
          { key: t.href },
          createElement(
            "a",
            {
              href: t.href,
              "data-x": t.x,
              "data-w": t.w,
              ...(t.href === activeHref ? { "aria-current": "page" as const } : {}),
            },
            t.label
          )
        )
      )
    )
  )
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  nav.pathname = "/admin/accounts"
  rowClientWidth = 300
  rowScrollWidth = 700
  scrollLeft = 0
  scrollWrites = 0

  vi.spyOn(HTMLUListElement.prototype, "clientWidth", "get").mockImplementation(() => rowClientWidth)
  vi.spyOn(HTMLUListElement.prototype, "scrollWidth", "get").mockImplementation(() => rowScrollWidth)
  vi.spyOn(HTMLUListElement.prototype, "scrollLeft", "get").mockImplementation(() => scrollLeft)
  vi.spyOn(HTMLUListElement.prototype, "scrollLeft", "set").mockImplementation((value: number) => {
    scrollWrites += 1
    scrollLeft = value
  })

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute("data-tab-row")) return rect(ROW_LEFT, rowClientWidth)
    const x = this.getAttribute("data-x")
    if (x !== null) return rect(ROW_LEFT + Number(x) - scrollLeft, Number(this.getAttribute("data-w")))
    return rect(0, 0)
  })

  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe("CurrentTabInView", () => {
  it("centers [aria-current='page'] in row.scrollLeft on mount and updates when pathname changes while overflowing", () => {
    act(() => {
      root.render(renderTabs("/admin/accounts"))
    })

    // Tab x=260, w=80 inside a 300px row -> centered at 260 - (300 - 80) / 2 = 150.
    expect(scrollLeft).toBe(150)
    expect(scrollWrites).toBe(1)

    nav.pathname = "/admin/statements"
    act(() => {
      root.render(renderTabs("/admin/statements"))
    })

    // Starting from scrollLeft=150, tab x=450, w=100 -> centered at 450 - (300 - 100) / 2 = 350.
    expect(scrollLeft).toBe(350)
    expect(scrollWrites).toBe(2)
  })

  it("leaves scrollLeft untouched when row.scrollWidth <= row.clientWidth", () => {
    rowClientWidth = 300
    rowScrollWidth = 300
    scrollLeft = 40
    scrollWrites = 0

    act(() => {
      root.render(renderTabs("/admin/accounts"))
    })

    expect(scrollLeft).toBe(40)
    expect(scrollWrites).toBe(0)
  })

  it("leaves scrollLeft untouched when no tab has aria-current='page'", () => {
    scrollLeft = 25
    scrollWrites = 0

    act(() => {
      root.render(renderTabs(null))
    })

    expect(scrollLeft).toBe(25)
    expect(scrollWrites).toBe(0)
  })
})
