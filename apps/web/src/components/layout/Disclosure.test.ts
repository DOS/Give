// @vitest-environment happy-dom
/**
 * Covers `Disclosure`'s open/close accessibility attributes, Escape and
 * keyboard link focus return, `onBlur` containment, and non-stealing close
 * paths (DESIGN.md 6, "Menus and keyboard focus", DOS/Give#218).
 */
import { act, createElement, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({ pathname: "/" }))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}))

const { Disclosure } = await import("./Disclosure")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root

function tree(overrides: Partial<ComponentProps<typeof Disclosure>> = {}) {
  return createElement(
    "div",
    null,
    createElement("button", { id: "outside", type: "button" }, "Ngoài"),
    createElement(
      Disclosure,
      {
        label: "Mở menu",
        openLabel: "Đóng menu",
        button: createElement("span", { id: "closed-icon" }, "Menu"),
        openButton: createElement("span", { id: "open-icon" }, "Close"),
        ...overrides,
      } as ComponentProps<typeof Disclosure>,
      createElement(
        "div",
        null,
        createElement("p", { id: "panel-note" }, "Đang đăng nhập"),
        createElement(
          "a",
          { id: "item-1", href: "/campaigns" },
          createElement("span", { id: "item-1-label" }, "Khám phá")
        ),
        createElement("a", { id: "item-2", href: "/me/campaigns" }, "Chiến dịch của tôi"),
        createElement(
          "form",
          { id: "search-form", action: "/campaigns" },
          createElement("input", { id: "search-input", name: "q", type: "search" }),
          createElement("button", { id: "search-submit", type: "submit" }, "Tìm")
        )
      )
    )
  )
}

function renderDisclosure(overrides: Partial<ComponentProps<typeof Disclosure>> = {}) {
  act(() => {
    root.render(tree(overrides))
  })
  const outside = container.querySelector<HTMLButtonElement>("#outside")!
  const disclosureRoot = outside.nextElementSibling as HTMLDivElement
  const trigger = disclosureRoot.querySelector<HTMLButtonElement>("button")!
  const panel = document.getElementById(trigger.getAttribute("aria-controls")!) as HTMLDivElement
  for (const link of panel.querySelectorAll("a")) {
    link.addEventListener("click", (event) => event.preventDefault())
  }
  panel.querySelector("#search-form")?.addEventListener("submit", (event) => event.preventDefault())
  return { outside, disclosureRoot, trigger, panel }
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  nav.pathname = "/"
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe("Disclosure (DESIGN.md 6, Menus and keyboard focus)", () => {
  describe("button and panel state", () => {
    it("toggles aria-expanded, panel hidden, openLabel and openButton", () => {
      const { trigger, panel } = renderDisclosure()

      expect(trigger.getAttribute("aria-expanded")).toBe("false")
      expect(trigger.getAttribute("aria-label")).toBe("Mở menu")
      expect(trigger.textContent).toBe("Menu")
      expect(panel.hidden).toBe(true)

      act(() => {
        trigger.click()
      })

      expect(trigger.getAttribute("aria-expanded")).toBe("true")
      expect(trigger.getAttribute("aria-label")).toBe("Đóng menu")
      expect(trigger.textContent).toBe("Close")
      expect(panel.hidden).toBe(false)

      act(() => {
        trigger.click()
      })

      expect(trigger.getAttribute("aria-expanded")).toBe("false")
      expect(trigger.getAttribute("aria-label")).toBe("Mở menu")
      expect(trigger.textContent).toBe("Menu")
      expect(panel.hidden).toBe(true)
    })

    it("falls back to label and button when openLabel and openButton are omitted", () => {
      const { trigger, panel } = renderDisclosure({
        label: "Tài khoản: Lan",
        openLabel: undefined,
        button: "Lan",
        openButton: undefined,
      })

      act(() => {
        trigger.click()
      })

      expect(panel.hidden).toBe(false)
      expect(trigger.getAttribute("aria-label")).toBe("Tài khoản: Lan")
      expect(trigger.textContent).toBe("Lan")
    })
  })

  describe("Escape key", () => {
    it("closes the panel and returns focus to trigger while open", () => {
      const { trigger, panel } = renderDisclosure()
      act(() => {
        trigger.click()
      })
      const item1 = panel.querySelector<HTMLAnchorElement>("#item-1")!
      item1.focus()
      expect(document.activeElement).toBe(item1)

      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
      })
      expect(panel.hidden).toBe(false)

      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      })

      expect(panel.hidden).toBe(true)
      expect(trigger.getAttribute("aria-expanded")).toBe("false")
      expect(document.activeElement).toBe(trigger)
    })

    it("does not steal focus when Escape is pressed while already closed", () => {
      const { outside, panel } = renderDisclosure()
      outside.focus()
      expect(panel.hidden).toBe(true)

      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      })

      expect(panel.hidden).toBe(true)
      expect(document.activeElement).toBe(outside)
    })
  })

  describe("onBlur containment", () => {
    it("keeps the panel open when focus moves within root or relatedTarget is null, and closes when focus leaves root", () => {
      const { outside, trigger, panel } = renderDisclosure()
      act(() => {
        trigger.click()
      })
      const item1 = panel.querySelector<HTMLAnchorElement>("#item-1")!
      const item2 = panel.querySelector<HTMLAnchorElement>("#item-2")!

      act(() => {
        trigger.focus()
      })
      act(() => {
        item1.focus()
      })
      expect(panel.hidden).toBe(false)

      act(() => {
        item2.focus()
      })
      expect(panel.hidden).toBe(false)

      // Window blur (relatedTarget: null) leaves the panel open; outside click closes on its own.
      act(() => {
        item2.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }))
      })
      expect(panel.hidden).toBe(false)

      act(() => {
        outside.focus()
      })
      expect(panel.hidden).toBe(true)
      expect(trigger.getAttribute("aria-expanded")).toBe("false")
    })
  })

  describe("link activation, form submit, pathname change and outside click", () => {
    it("closes the panel and returns focus to trigger on keyboard link activation (detail === 0), but does not move focus on pointer link click (detail === 1)", () => {
      const { trigger, panel } = renderDisclosure()
      act(() => {
        trigger.click()
      })
      const item1 = panel.querySelector<HTMLAnchorElement>("#item-1")!
      const item1Label = panel.querySelector<HTMLElement>("#item-1-label")!
      item1.focus()
      expect(document.activeElement).toBe(item1)

      // Keyboard Enter on <a> (including nested child target) fires click with detail === 0.
      act(() => {
        item1Label.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }))
      })

      expect(panel.hidden).toBe(true)
      expect(trigger.getAttribute("aria-expanded")).toBe("false")
      expect(document.activeElement).toBe(trigger)

      // Pointer click (detail === 1) closes the panel without forcing focus back to trigger.
      act(() => {
        trigger.click()
      })
      item1.focus()
      expect(document.activeElement).toBe(item1)

      act(() => {
        item1.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }))
      })

      expect(panel.hidden).toBe(true)
      expect(document.activeElement).toBe(item1)
    })

    it("leaves the panel open on non-link clicks inside the panel and closes without stealing focus on form submit", () => {
      const { trigger, panel } = renderDisclosure()
      act(() => {
        trigger.click()
      })

      const note = panel.querySelector<HTMLElement>("#panel-note")!
      act(() => {
        note.click()
      })
      expect(panel.hidden).toBe(false)

      const input = panel.querySelector<HTMLInputElement>("#search-input")!
      const form = panel.querySelector<HTMLFormElement>("#search-form")!
      input.focus()
      expect(document.activeElement).toBe(input)

      act(() => {
        form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))
      })

      expect(panel.hidden).toBe(true)
      expect(document.activeElement).toBe(input)
    })

    it("closes the panel without stealing focus when pathname changes", () => {
      const { outside, trigger, panel } = renderDisclosure()
      act(() => {
        trigger.click()
      })
      expect(panel.hidden).toBe(false)

      // Simulate focus already placed on page content across an App Router navigation.
      Object.defineProperty(document, "activeElement", { configurable: true, get: () => outside })

      nav.pathname = "/campaigns"
      act(() => {
        root.render(tree())
      })

      expect(panel.hidden).toBe(true)
      expect(trigger.getAttribute("aria-expanded")).toBe("false")
      expect(document.activeElement).toBe(outside)
    })

    it("closes the panel without stealing focus on outside document click", () => {
      const { outside, trigger, panel } = renderDisclosure()
      act(() => {
        trigger.click()
      })
      expect(panel.hidden).toBe(false)

      // Focus is already outside (or clicked directly); clicking outside closes without focusing trigger.
      const focusSpy = vi.spyOn(trigger, "focus")
      act(() => {
        outside.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })

      expect(panel.hidden).toBe(true)
      expect(trigger.getAttribute("aria-expanded")).toBe("false")
      expect(focusSpy).not.toHaveBeenCalled()
    })
  })
})
