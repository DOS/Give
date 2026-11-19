// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ShareButtons } from "./ShareButtons"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root
let originalShareDescriptor: PropertyDescriptor | undefined
let originalClipboardDescriptor: PropertyDescriptor | undefined

function setNavigatorShare(share: Navigator["share"] | undefined) {
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
    writable: true,
  })
}

function setClipboardWriteText(writeText: (data: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  })
}

function renderShareButtons(props: ComponentProps<typeof ShareButtons>) {
  act(() => {
    root.render(createElement(ShareButtons, props))
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  originalShareDescriptor = Object.getOwnPropertyDescriptor(navigator, "share")
  originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  setNavigatorShare(undefined)
  setClipboardWriteText(vi.fn().mockResolvedValue(undefined))
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  if (originalShareDescriptor) {
    Object.defineProperty(navigator, "share", originalShareDescriptor)
  } else {
    Reflect.deleteProperty(navigator, "share")
  }
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor)
  } else {
    Reflect.deleteProperty(navigator, "clipboard")
  }
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("ShareButtons (DOS/Give#270)", () => {
  it("uses navigator.share when available without falling back to clipboard", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    setNavigatorShare(shareMock)
    setClipboardWriteText(writeTextMock)

    renderShareButtons({
      path: "/campaigns/xay-cau",
      title: "Xây cầu nông thôn",
      origin: "https://give.vn",
    })

    const shareButton = container.querySelector<HTMLButtonElement>("button")!
    await act(async () => {
      shareButton.click()
    })

    expect(shareMock).toHaveBeenCalledTimes(1)
    expect(shareMock).toHaveBeenCalledWith({
      title: "Xây cầu nông thôn",
      url: "https://give.vn/campaigns/xay-cau",
    })
    expect(writeTextMock).not.toHaveBeenCalled()
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toBe("")
  })

  it("silently returns on AbortError without copying to clipboard or showing status", async () => {
    const shareMock = vi.fn().mockRejectedValue(new DOMException("Share cancelled", "AbortError"))
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    setNavigatorShare(shareMock)
    setClipboardWriteText(writeTextMock)

    renderShareButtons({
      path: "/campaigns/xay-cau",
      title: "Xây cầu nông thôn",
      origin: "https://give.vn",
    })

    const shareButton = container.querySelector<HTMLButtonElement>("button")!
    await act(async () => {
      shareButton.click()
    })

    expect(shareMock).toHaveBeenCalledTimes(1)
    expect(writeTextMock).not.toHaveBeenCalled()
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toBe("")
  })

  it("falls back to navigator.clipboard.writeText when navigator.share fails with a non-abort error", async () => {
    vi.useFakeTimers()
    const shareMock = vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"))
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    setNavigatorShare(shareMock)
    setClipboardWriteText(writeTextMock)

    renderShareButtons({
      path: "/campaigns/xay-cau",
      title: "Xây cầu nông thôn",
      origin: "https://give.vn",
    })

    const shareButton = container.querySelector<HTMLButtonElement>("button")!
    await act(async () => {
      shareButton.click()
    })

    expect(shareMock).toHaveBeenCalledTimes(1)
    expect(writeTextMock).toHaveBeenCalledWith("https://give.vn/campaigns/xay-cau")
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toBe("Đã chép đường dẫn")
  })

  it("resets the 3000ms status timer on rapid clicks without premature wipe, handles clipboard errors, and cleans up on unmount", async () => {
    vi.useFakeTimers()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    setClipboardWriteText(writeTextMock)

    renderShareButtons({
      path: "/campaigns/xay-cau",
      title: "Xây cầu nông thôn",
      origin: "https://give.vn",
    })

    const shareButton = container.querySelector<HTMLButtonElement>("button")!
    const liveRegion = container.querySelector('[aria-live="polite"]')!

    await act(async () => {
      shareButton.click()
    })
    expect(liveRegion.textContent).toBe("Đã chép đường dẫn")

    // Advance 2000ms, then click again; the new 3000ms window must last until t = 5000ms.
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    await act(async () => {
      shareButton.click()
    })
    expect(writeTextMock).toHaveBeenCalledTimes(2)

    // At t = 3500ms (past the first click's 3000ms mark), status must still be present.
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(liveRegion.textContent).toBe("Đã chép đường dẫn")

    // At t = 5000ms (full 3000ms after the second click), status clears.
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(liveRegion.textContent).toBe("")

    // Clipboard write failure displays fallback instructions and clears on unmount without leaking a timer.
    writeTextMock.mockRejectedValueOnce(new Error("Clipboard blocked"))
    await act(async () => {
      shareButton.click()
    })
    expect(liveRegion.textContent).toBe("Không chép được, hãy chép đường dẫn trên thanh địa chỉ")
    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      root.unmount()
    })
    expect(vi.getTimerCount()).toBe(0)

    // Unmounting while clipboard.writeText is still in flight does not schedule a post-unmount timer.
    root = createRoot(container)
    let resolvePendingCopy!: () => void
    writeTextMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePendingCopy = resolve
        })
    )
    renderShareButtons({
      path: "/campaigns/xay-cau",
      title: "Xây cầu nông thôn",
      origin: "https://give.vn",
    })
    act(() => {
      container.querySelector<HTMLButtonElement>("button")!.click()
    })
    act(() => {
      root.unmount()
    })
    await act(async () => {
      resolvePendingCopy()
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("renders compact mode with aria-label, sr-only live region, and transient visual status pill", async () => {
    vi.useFakeTimers()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    setClipboardWriteText(writeTextMock)

    renderShareButtons({
      path: "/campaigns/xay-cau",
      title: "Xây cầu nông thôn",
      origin: "https://give.vn",
      compact: true,
    })

    const button = container.querySelector<HTMLButtonElement>("button")!
    expect(button.getAttribute("aria-label")).toBe("Chia sẻ")
    expect(container.querySelector("a")).toBeNull()

    const srLive = container.querySelector<HTMLParagraphElement>('p.sr-only[aria-live="polite"]')!
    expect(srLive.textContent).toBe("")
    expect(container.querySelector('p[aria-hidden="true"]')).toBeNull()

    await act(async () => {
      button.click()
    })

    expect(writeTextMock).toHaveBeenCalledWith("https://give.vn/campaigns/xay-cau")
    expect(srLive.textContent).toBe("Đã chép đường dẫn")
    const pill = container.querySelector<HTMLParagraphElement>('p[aria-hidden="true"]')!
    expect(pill).not.toBeNull()
    expect(pill.textContent).toBe("Đã chép đường dẫn")

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(srLive.textContent).toBe("")
    expect(container.querySelector('p[aria-hidden="true"]')).toBeNull()
  })

  it("encodes the Facebook sharer URL using server origin when provided and window.location.origin otherwise", () => {
    const path = "/campaigns/xay-cau?utm_source=give&tag=a b"

    // Server render with canonical origin works before hydration.
    const ssrWithOrigin = renderToStaticMarkup(
      createElement(ShareButtons, {
        path,
        title: "Xây cầu",
        origin: "https://give.vn",
      })
    )
    expect(ssrWithOrigin).toContain(
      `href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://give.vn${path}`)}"`
    )

    // Hydrated render with explicit server origin ignores window.location.origin.
    window.location.href = "https://preview.give.vn/campaigns/xay-cau"
    renderShareButtons({
      path,
      title: "Xây cầu",
      origin: "https://give.vn",
    })
    const linkWithOrigin = container.querySelector<HTMLAnchorElement>("a")!
    expect(linkWithOrigin.getAttribute("href")).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://give.vn${path}`)}`
    )
    expect(linkWithOrigin.getAttribute("target")).toBe("_blank")
    expect(linkWithOrigin.getAttribute("rel")).toBe("noopener noreferrer")
    expect(linkWithOrigin.querySelector(".sr-only")?.textContent).toBe(" (mở thẻ mới)")

    // Without server origin (preview), client falls back to window.location.origin.
    renderShareButtons({
      path,
      title: "Xây cầu",
    })
    const linkFromWindow = container.querySelector<HTMLAnchorElement>("a")!
    expect(linkFromWindow.getAttribute("href")).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://preview.give.vn${path}`)}`
    )
  })
})
