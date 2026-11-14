// @vitest-environment happy-dom
import { act, createElement, type ComponentProps, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RingBoxScroll } from "@/components/layout/RingBoxScroll"
import { ScrollRow } from "./ScrollRow"

// The keyboard reveal of a whole-box link inside a ScrollRow (#175, #180). happy-dom has no layout, so
// the row and its items get a stubbed one: the row is ROW_WIDTH wide at the left of the viewport and
// scrolls CONTENT_WIDTH of content; an item with `data-x` and `data-w` sits at that offset in the
// content and moves with the row's `scrollLeft`.
const ROW_WIDTH = 375
const CONTENT_WIDTH = 700
/** ScrollRow's edge fade (`w-6`) and ring room (`px-[5px]`), in pixels. */
const FADE = 24
const ROOM = 5

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root
let row: HTMLElement

const rect = (left: number, width: number) =>
  ({ left, right: left + width, width, top: 0, bottom: 44, height: 44, x: left, y: 0 }) as DOMRect

/** Gives the rendered row a scroll position of its own, clamped like a browser's. */
function stubRow() {
  row = container.querySelector<HTMLElement>("[data-scroll-row]")!
  let left = 0
  let top = 0
  Object.defineProperties(row, {
    clientWidth: { configurable: true, get: () => ROW_WIDTH },
    scrollWidth: { configurable: true, get: () => CONTENT_WIDTH },
    scrollLeft: {
      configurable: true,
      get: () => left,
      set: (value: number) => (left = Math.min(Math.max(value, 0), CONTENT_WIDTH - ROW_WIDTH)),
    },
    scrollTop: { configurable: true, get: () => top, set: (value: number) => (top = value) },
  })
}

function render(children: ReactNode) {
  act(() => root.render(children))
  stubRow()
}

/** Focus as the keyboard does (`:focus-visible`) or as a pointer does: the event reaches the row, then the document. */
function focus(target: HTMLElement, { keyboard = true } = {}) {
  const matches = target.matches.bind(target)
  target.matches = ((selector: string) =>
    selector === ":focus-visible" ? keyboard : matches(selector)) as typeof target.matches
  act(() => {
    target.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
  })
}

const at = (x: number, w: number) => ({ "data-x": x, "data-w": w })

/** A campaign card in the row: a 200px ring box with its title link at its left. */
const card = createElement(
  "div",
  { "data-ring-box": "", ...at(300, 200) },
  createElement("a", { href: "/campaigns/be-an", id: "card", ...at(300, 80) }, "Chung tay cùng bé An")
)
/** A ScrollRow with its items as arguments, as JSX would pass them. */
const scrollRow = (props: Omit<ComponentProps<typeof ScrollRow>, "children">, ...items: ReactNode[]) =>
  createElement(ScrollRow, props as ComponentProps<typeof ScrollRow>, ...items)
const inRow = (children: ReactNode, ringRoom = true) =>
  scrollRow(
    { ringRoom },
    createElement("a", { href: "/campaigns", ...at(0, 80) }, "Tất cả"),
    children,
    createElement("a", { href: "/campaigns?type=back", ...at(600, 100) }, "Dự án")
  )
const boxOf = (id: string) => document.getElementById(id)!.closest<HTMLElement>("[data-ring-box]")!

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  if (!("ResizeObserver" in globalThis)) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    )
  }
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute("data-scroll-row")) return rect(0, ROW_WIDTH)
    const x = this.getAttribute("data-x")
    return x === null ? rect(0, 0) : rect(Number(x) - row.scrollLeft, Number(this.getAttribute("data-w")))
  })
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

describe("ScrollRow keyboard reveal", () => {
  it("scrolls a ring box inside the row clear of the fade as a whole box, not only its link", () => {
    render(inRow(card))
    focus(document.getElementById("card")!)
    // The fade starts at the row's old edge, inside the ring room; the box's right edge stops FADE + ROOM
    // (29px) clear of it, as every other item does. Revealing the link alone would leave the box's
    // right 120px under the fade and past the edge.
    const edge = ROW_WIDTH - ROOM
    expect(edge - boxOf("card").getBoundingClientRect().right).toBe(FADE + ROOM)
    expect(row.scrollLeft).toBe(500 - (edge - FADE - ROOM))
  })

  it("clears the fade by 24px without ring room", () => {
    render(inRow(card, false))
    focus(document.getElementById("card")!)
    expect(ROW_WIDTH - boxOf("card").getBoundingClientRect().right).toBe(FADE)
  })

  it("reveals only the link when the ring box holds the row", () => {
    render(
      createElement(
        "div",
        { "data-ring-box": "" },
        scrollRow(
          { ringRoom: true },
          createElement("a", { href: "/a", ...at(0, 80) }, "A"),
          createElement("a", { href: "/b", id: "inner", ...at(300, 80) }, "B")
        )
      )
    )
    focus(document.getElementById("inner")!)
    expect(ROW_WIDTH - ROOM - document.getElementById("inner")!.getBoundingClientRect().right).toBe(FADE + ROOM)
  })

  it("leaves the row where it is on pointer focus", () => {
    render(inRow(card))
    focus(document.getElementById("card")!, { keyboard: false })
    expect(row.scrollLeft).toBe(0)
  })
})

describe("RingBoxScroll with a ring box inside a ScrollRow", () => {
  it("scrolls the page to the box after the row has placed it, then puts the row's position back", () => {
    render(createElement("div", null, createElement(RingBoxScroll), inRow(card)))
    const box = boxOf("card")
    let rowLeftAtCall: number | undefined
    // A browser's scrollIntoView scrolls every scrolling ancestor: here it lines the box up with the
    // row's edge, under the fade, and moves the row by a fraction of a pixel of vertical overflow.
    const scrollIntoView = vi.fn(() => {
      rowLeftAtCall = row.scrollLeft
      row.scrollLeft = 500 - ROW_WIDTH
      row.scrollTop = 1
    })
    box.scrollIntoView = scrollIntoView
    focus(document.getElementById("card")!)

    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" })
    // The row's focusin listener ran first, as focus bubbles to the row before the document: the
    // position saved and put back is the one the row's reveal chose.
    const revealed = 500 - (ROW_WIDTH - ROOM - FADE - ROOM)
    expect(rowLeftAtCall).toBe(revealed)
    expect(row.scrollLeft).toBe(revealed)
    expect(row.scrollTop).toBe(0)
  })

  it("only scrolls the page for a box outside any row", () => {
    render(
      createElement(
        "div",
        null,
        createElement(RingBoxScroll),
        createElement("div", { "data-ring-box": "" }, createElement("a", { href: "/c", id: "alone" }, "C")),
        inRow(null)
      )
    )
    const scrollIntoView = vi.fn()
    boxOf("alone").scrollIntoView = scrollIntoView
    focus(document.getElementById("alone")!)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" })
    expect(row.scrollLeft).toBe(0)
  })

  it("does nothing on pointer focus", () => {
    render(createElement("div", null, createElement(RingBoxScroll), inRow(card)))
    const scrollIntoView = vi.fn()
    boxOf("card").scrollIntoView = scrollIntoView
    focus(document.getElementById("card")!, { keyboard: false })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
