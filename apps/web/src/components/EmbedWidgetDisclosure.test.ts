// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EmbedWidgetDisclosure } from "./EmbedWidgetDisclosure"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root
let originalClipboardDescriptor: PropertyDescriptor | undefined
let originalBeaconDescriptor: PropertyDescriptor | undefined

function setClipboardWriteText(writeText: (data: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  })
}

function renderDisclosure(props: ComponentProps<typeof EmbedWidgetDisclosure>) {
  act(() => {
    root.render(createElement(EmbedWidgetDisclosure, props))
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  originalBeaconDescriptor = Object.getOwnPropertyDescriptor(navigator, "sendBeacon")
  setClipboardWriteText(vi.fn().mockResolvedValue(undefined))
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor)
  } else {
    Reflect.deleteProperty(navigator, "clipboard")
  }
  if (originalBeaconDescriptor) {
    Object.defineProperty(navigator, "sendBeacon", originalBeaconDescriptor)
  } else {
    Reflect.deleteProperty(navigator, "sendBeacon")
  }
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("EmbedWidgetDisclosure (DOS/Give#335)", () => {
  it("renders collapsible disclosure, switches compact/theme modes, escapes title, and copies snippet", async () => {
    vi.useFakeTimers()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    setClipboardWriteText(writeTextMock)

    const sentBodies: string[] = []
    const sendBeacon = vi.fn((_url: string, data?: BodyInit | null) => {
      if (data instanceof Blob) {
        void data.text().then((text) => sentBodies.push(text))
      }
      return true
    })
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true })

    renderDisclosure({
      slug: "xay-truong",
      title: 'Xây "trường" & lớp <mới>',
      origin: "https://give.vn",
      campaignId: "33333333-3333-4333-8333-333333333333",
      ambassadorRef: "AB23CD45EF",
    })

    const summary = container.querySelector("summary")!
    expect(summary.textContent).toContain("Nhúng vào website / báo chí")

    const textarea = container.querySelector("textarea")!
    expect(textarea.value).toBe(
      '<iframe src="https://give.vn/embed/xay-truong?ref=ab23cd45ef" title="Xây &quot;trường&quot; &amp; lớp &lt;mới&gt; · Give" width="100%" height="280" style="border:0;border-radius:6px;overflow:hidden" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>'
    )

    const compactBtn = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Thu gọn"))!
    const darkBtn = [...container.querySelectorAll("button")].find((b) => b.textContent === "Tối")!
    act(() => {
      compactBtn.click()
      darkBtn.click()
    })

    expect(textarea.value).toContain(
      'src="https://give.vn/embed/xay-truong?theme=dark&amp;compact=1&amp;ref=ab23cd45ef"'
    )
    expect(textarea.value).toContain('height="180"')

    const copyBtn = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Sao chép mã nhúng"))!
    await act(async () => {
      copyBtn.click()
    })
    await Promise.resolve()

    expect(writeTextMock).toHaveBeenCalledWith(textarea.value)
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("Đã sao chép mã nhúng")
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(JSON.parse(sentBodies[0])).toEqual({
      campaignId: "33333333-3333-4333-8333-333333333333",
      event: "share_click",
    })

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("")
  })

  it("handles clipboard errors gracefully and cleans up pending timer on unmount", async () => {
    vi.useFakeTimers()
    const writeTextMock = vi.fn().mockRejectedValue(new Error("Blocked"))
    setClipboardWriteText(writeTextMock)

    renderDisclosure({
      slug: "xay-truong",
      title: "Xây trường",
      origin: "https://give.vn",
      ambassadorRef: "bad!!ref",
    })

    const textarea = container.querySelector("textarea")!
    expect(textarea.value).toContain('src="https://give.vn/embed/xay-truong"')

    const copyBtn = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Sao chép mã nhúng"))!
    await act(async () => {
      copyBtn.click()
    })
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain("Không chép được tự động")
    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      root.unmount()
    })
    expect(vi.getTimerCount()).toBe(0)
  })
})
