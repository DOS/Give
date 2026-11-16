// @vitest-environment happy-dom
/**
 * Covers `Dropdown`'s phone-sheet and desktop-popover keyboard/pointer focus
 * invariants (DESIGN.md 6, "Menus and keyboard focus", DOS/Give#209).
 */
import { act, createElement, type ComponentProps, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Dropdown } from "./Dropdown"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root

function renderMenu(children: ReactNode) {
  act(() => {
    root.render(
      createElement(
        "div",
        null,
        createElement("button", { id: "outside", type: "button" }, "Ngoài"),
        createElement(
          Dropdown,
          { title: "Sắp xếp", summary: "Sắp xếp: Mới nhất" } as ComponentProps<typeof Dropdown>,
          createElement("nav", { "aria-label": "Sắp xếp" }, children)
        )
      )
    )
  })
  const details = container.querySelector("details")!
  const summary = details.querySelector<HTMLElement>("summary")!
  const scrim = details.querySelector<HTMLDivElement>("[aria-hidden]")!
  const panel = details.querySelector<HTMLDivElement>("[data-menu-panel]")!
  const closeButton = details.querySelector<HTMLButtonElement>('button[aria-label="Đóng"]')!
  const outside = container.querySelector<HTMLButtonElement>("#outside")!
  return { details, summary, scrim, panel, closeButton, outside }
}

function defaultItems(withCurrent = true) {
  return createElement(
    "ul",
    null,
    createElement("li", null, createElement("a", { id: "item-1", href: "/campaigns" }, "Nổi bật")),
    createElement(
      "li",
      null,
      createElement(
        "a",
        {
          id: "item-2",
          href: "/campaigns?sort=newest",
          ...(withCurrent ? { "aria-current": "page" as const } : {}),
        },
        createElement("span", { id: "item-2-label" }, "Mới nhất")
      )
    ),
    createElement("li", null, createElement("a", { id: "item-3", href: "/campaigns?sort=ending" }, "Sắp kết thúc"))
  )
}

/**
 * Opens `<details>` as either the phone sheet (scrim visible) or the >=768px
 * desktop popover (scrim `display: none`). If setting `details.open = true` did
 * not synchronously dispatch `toggle`, dispatches it once so `onToggle` runs.
 */
function openDropdown(details: HTMLDetailsElement, scrim: HTMLDivElement, mode: "sheet" | "popover") {
  scrim.style.display = mode === "sheet" ? "block" : "none"
  let toggled = false
  const mark = () => {
    toggled = true
  }
  details.addEventListener("toggle", mark, { once: true })
  act(() => {
    details.open = true
    if (!toggled) details.dispatchEvent(new Event("toggle"))
  })
  details.removeEventListener("toggle", mark)
}

function dispatchFocusOut(from: HTMLElement, relatedTarget: EventTarget | null) {
  act(() => {
    from.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget }))
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe("Dropdown (DESIGN.md 6, Menus and keyboard focus)", () => {
  describe("opening focus (toggle)", () => {
    it("moves focus to a[aria-current='page'] when opening the phone sheet", () => {
      const { details, summary, scrim } = renderMenu(defaultItems(true))
      summary.focus()
      expect(document.activeElement).toBe(summary)

      openDropdown(details, scrim, "sheet")

      expect(details.open).toBe(true)
      expect(document.activeElement).toBe(container.querySelector("#item-2"))
    })

    it("falls back to the first a[href] on the phone sheet when no item has aria-current='page'", () => {
      const { details, summary, scrim } = renderMenu(
        createElement(
          "ul",
          null,
          createElement("li", null, createElement("a", { id: "placeholder" }, "Chưa chọn")),
          createElement("li", null, createElement("a", { id: "first-href", href: "/campaigns" }, "Nổi bật")),
          createElement(
            "li",
            null,
            createElement("a", { id: "second-href", href: "/campaigns?sort=newest" }, "Mới nhất")
          )
        )
      )
      summary.focus()

      openDropdown(details, scrim, "sheet")

      expect(document.activeElement).toBe(container.querySelector("#first-href"))
    })

    it("leaves focus alone when opening the desktop popover (scrim display: none)", () => {
      const { details, summary, scrim } = renderMenu(defaultItems(true))
      summary.focus()

      openDropdown(details, scrim, "popover")

      expect(details.open).toBe(true)
      expect(document.activeElement).toBe(summary)
    })

    it("does not move focus into the sheet when toggle fires on close", () => {
      const { details, scrim, outside } = renderMenu(defaultItems(true))
      openDropdown(details, scrim, "sheet")
      outside.focus()

      act(() => {
        details.open = false
        details.dispatchEvent(new Event("toggle"))
      })

      expect(document.activeElement).toBe(outside)
    })
  })

  describe("Escape key", () => {
    it("closes <details> and returns focus to <summary> while open", () => {
      const { details, summary, scrim } = renderMenu(defaultItems(true))
      openDropdown(details, scrim, "sheet")
      expect(document.activeElement).toBe(container.querySelector("#item-2"))

      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
      })
      expect(details.open).toBe(true)

      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      })
      expect(details.open).toBe(false)
      expect(document.activeElement).toBe(summary)
    })

    it("does not steal focus when Escape is pressed while already closed", () => {
      const { details, outside } = renderMenu(defaultItems(true))
      outside.focus()
      expect(details.open).toBe(false)

      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      })
      expect(document.activeElement).toBe(outside)
    })
  })

  describe("focusout containment", () => {
    it("keeps the desktop popover open when focus stays in the panel or returns to <summary>, and closes when focus leaves <details>", () => {
      const { details, summary, scrim, outside } = renderMenu(defaultItems(true))
      openDropdown(details, scrim, "popover")
      const item1 = container.querySelector<HTMLElement>("#item-1")!
      const item2 = container.querySelector<HTMLElement>("#item-2")!

      dispatchFocusOut(item1, item2)
      expect(details.open).toBe(true)

      dispatchFocusOut(item1, summary)
      expect(details.open).toBe(true)

      // Window blur / non-focusable click leaves relatedTarget null; outside click handles closing.
      dispatchFocusOut(item1, null)
      expect(details.open).toBe(true)

      dispatchFocusOut(item2, outside)
      expect(details.open).toBe(false)
    })

    it("closes the phone sheet on focusout back to <summary> as well as outside <details>, while keeping focus inside the sheet open", () => {
      const { details, summary, scrim, closeButton, outside } = renderMenu(defaultItems(true))
      openDropdown(details, scrim, "sheet")
      const item2 = container.querySelector<HTMLElement>("#item-2")!
      const item3 = container.querySelector<HTMLElement>("#item-3")!

      dispatchFocusOut(item2, closeButton)
      expect(details.open).toBe(true)

      dispatchFocusOut(closeButton, item3)
      expect(details.open).toBe(true)

      // Shift+Tab from the sheet back onto the covered <summary> closes the sheet.
      dispatchFocusOut(item2, summary)
      expect(details.open).toBe(false)

      // Tab past the last item out of the sheet also closes it.
      openDropdown(details, scrim, "sheet")
      dispatchFocusOut(item3, outside)
      expect(details.open).toBe(false)
    })
  })

  describe("scrim, close button, menu link activation and outside click", () => {
    it("closes <details> and returns focus to <summary> when clicking the scrim", () => {
      const { details, summary, scrim } = renderMenu(defaultItems(true))
      openDropdown(details, scrim, "sheet")
      expect(document.activeElement).toBe(container.querySelector("#item-2"))

      act(() => {
        scrim.click()
      })

      expect(details.open).toBe(false)
      expect(document.activeElement).toBe(summary)
    })

    it("closes <details> and returns focus to <summary> when clicking 'Đóng'", () => {
      const { details, summary, scrim, closeButton } = renderMenu(defaultItems(true))
      openDropdown(details, scrim, "sheet")
      closeButton.focus()

      act(() => {
        closeButton.click()
      })

      expect(details.open).toBe(false)
      expect(document.activeElement).toBe(summary)
    })

    it("closes <details> and returns focus to <summary> when activating a menu link from the keyboard (detail === 0), but not on pointer click", () => {
      const { details, summary, scrim } = renderMenu(defaultItems(true))
      openDropdown(details, scrim, "sheet")
      const item2 = container.querySelector<HTMLAnchorElement>("#item-2")!
      const item2Label = container.querySelector<HTMLElement>("#item-2-label")!
      item2.addEventListener("click", (e) => e.preventDefault())
      item2.focus()

      act(() => {
        item2Label.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }))
      })

      expect(details.open).toBe(false)
      expect(document.activeElement).toBe(summary)

      // Pointer activation (detail === 1) closes the menu without forcing focus back to <summary>.
      openDropdown(details, scrim, "popover")
      item2.focus()
      expect(document.activeElement).toBe(item2)

      act(() => {
        item2.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }))
      })

      expect(details.open).toBe(false)
      expect(document.activeElement).toBe(item2)
    })

    it("closes <details> without stealing focus when clicking outside", () => {
      const { details, panel, scrim, outside } = renderMenu(defaultItems(true))
      openDropdown(details, scrim, "popover")
      outside.focus()
      expect(document.activeElement).toBe(outside)

      // Clicking non-link text inside the panel leaves the menu open.
      act(() => {
        panel.querySelector("p")!.click()
      })
      expect(details.open).toBe(true)

      act(() => {
        outside.click()
      })

      expect(details.open).toBe(false)
      expect(document.activeElement).toBe(outside)
    })
  })
})
