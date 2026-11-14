// @vitest-environment happy-dom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { donationTrackingPath } from "@/lib/contributions"

import { TrackingLinkButton } from "./TrackingLinkButton"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const TOKEN = "0123456789abcdef".repeat(4)
const PATH = donationTrackingPath("GVABCDEFG", TOKEN)

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

describe("TrackingLinkButton (DOS/Give#50)", () => {
  it("copies the full canonical tracking URL and announces the copied state", async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })

    await act(async () => {
      root.render(createElement(TrackingLinkButton, { path: PATH, origin: "https://give.dos.me" }))
    })

    const button = container.querySelector("button")!
    expect(button.className).toContain("btn-secondary")
    expect(button.textContent).toContain("Sao chép đường dẫn")
    expect(button.textContent).toContain("theo dõi khoản ủng hộ")

    await act(async () => {
      button.click()
    })

    expect(writeText).toHaveBeenCalledWith(`https://give.dos.me${PATH}`)
    expect(button.textContent).toContain("Đã chép")
  })

  it("falls back to window.location.origin when no canonical site origin is configured", async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })

    await act(async () => {
      root.render(createElement(TrackingLinkButton, { path: PATH }))
    })

    await act(async () => {
      container.querySelector("button")!.click()
    })

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${PATH}`)
  })
})
