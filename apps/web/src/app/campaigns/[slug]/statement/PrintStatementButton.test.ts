// @vitest-environment happy-dom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PrintStatementButton } from "./PrintStatementButton"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe("PrintStatementButton (DOS/Give#336)", () => {
  it("renders a secondary sm button and calls window.print on click", async () => {
    const printSpy = vi.fn()
    Object.defineProperty(window, "print", { value: printSpy, configurable: true })

    await act(async () => {
      root.render(createElement(PrintStatementButton))
    })

    const button = container.querySelector("button")!
    expect(button).not.toBeNull()
    expect(button.getAttribute("type")).toBe("button")
    expect(button.className).toContain("btn-secondary")
    expect(button.className).toContain("min-h-9")
    expect(button.textContent).toContain("In / Lưu PDF")

    await act(async () => {
      button.click()
    })

    expect(printSpy).toHaveBeenCalledTimes(1)
  })
})
