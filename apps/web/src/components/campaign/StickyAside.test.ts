// @vitest-environment happy-dom
/**
 * Covers `StickyAside` sticky top placement (DESIGN.md 2.2: 96px top offset vs
 * bottom-pinned `${innerHeight - offsetHeight - 24}px` when taller than
 * `innerHeight - 120`), `ResizeObserver` and `window` `resize` updates, and
 * listener cleanup on unmount (DOS/Give#218).
 */
import { act, createElement, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { StickyAside } from "./StickyAside"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root
let viewportHeight = 800
let asideHeight = 500
let resizeCallback: (() => void) | null = null
let observedElement: Element | null = null
let disconnectCount = 0

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  viewportHeight = 800
  asideHeight = 500
  resizeCallback = null
  observedElement = null
  disconnectCount = 0

  vi.spyOn(window, "innerHeight", "get").mockImplementation(() => viewportHeight)
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => asideHeight)

  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        resizeCallback = cb
      }
      observe(target: Element) {
        observedElement = target
      }
      disconnect() {
        disconnectCount += 1
      }
    }
  )

  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("StickyAside (DESIGN.md 2.2)", () => {
  it("sets style.top to 96px when offsetHeight <= innerHeight - 120 (including the exact boundary)", () => {
    act(() => {
      root.render(
        createElement(
          StickyAside,
          { className: "lg:sticky" } as ComponentProps<typeof StickyAside>,
          createElement("p", null, "Cột bên")
        )
      )
    })

    const aside = container.firstElementChild as HTMLDivElement
    expect(aside.className).toBe("lg:sticky")
    expect(observedElement).toBe(aside)
    expect(aside.style.top).toBe("96px")

    // Exact boundary: offsetHeight === innerHeight - 120 (680 === 800 - 120) stays at 96px.
    asideHeight = 680
    act(() => {
      resizeCallback?.()
    })
    expect(aside.style.top).toBe("96px")
  })

  it("switches to `${innerHeight - offsetHeight - 24}px` when taller than the viewport room and reacts to ResizeObserver and window resize", () => {
    act(() => {
      root.render(createElement(StickyAside, null, createElement("p", null, "Cột bên")))
    })
    const aside = container.firstElementChild as HTMLDivElement
    expect(aside.style.top).toBe("96px")

    // Sidebar grows past room (681 > 680) via ResizeObserver -> 800 - 700 - 24 = 76px.
    asideHeight = 700
    act(() => {
      resizeCallback?.()
    })
    expect(aside.style.top).toBe("76px")

    // Sidebar grows taller than the viewport (900 > 680) -> 800 - 900 - 24 = -124px.
    asideHeight = 900
    act(() => {
      resizeCallback?.()
    })
    expect(aside.style.top).toBe("-124px")

    // Viewport grows on window resize so room = 1100 - 120 = 980 >= 900 -> back to 96px.
    viewportHeight = 1100
    act(() => {
      window.dispatchEvent(new Event("resize"))
    })
    expect(aside.style.top).toBe("96px")

    // Viewport shrinks on window resize so room = 750 - 120 = 630 < 900 -> 750 - 900 - 24 = -174px.
    viewportHeight = 750
    act(() => {
      window.dispatchEvent(new Event("resize"))
    })
    expect(aside.style.top).toBe("-174px")
  })

  it("disconnects ResizeObserver and removes the window resize listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener")
    act(() => {
      root.render(createElement(StickyAside, null, createElement("p", null, "Cột bên")))
    })
    const aside = container.firstElementChild as HTMLDivElement
    expect(aside.style.top).toBe("96px")

    act(() => {
      root.unmount()
    })

    expect(disconnectCount).toBe(1)
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function))

    // Subsequent window resize does not touch the unmounted element's style.top.
    viewportHeight = 400
    asideHeight = 700
    window.dispatchEvent(new Event("resize"))
    expect(aside.style.top).toBe("96px")
  })
})
