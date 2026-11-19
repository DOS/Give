// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CopyButton } from "./CopyButton"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root
let originalClipboardDescriptor: PropertyDescriptor | undefined

function setClipboardWriteText(writeText: (data: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  })
}

function renderCopyButton(props: ComponentProps<typeof CopyButton>) {
  act(() => {
    root.render(createElement(CopyButton, props))
  })
  return container.querySelector<HTMLButtonElement>("button")!
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
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
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("CopyButton (DOS/Give#270)", () => {
  it("renders default label, polite live region, and decorative copy icon without sr-only suffix when name is omitted", () => {
    const button = renderCopyButton({ value: "GIVE-998877" })

    expect(button.getAttribute("type")).toBe("button")
    const svg = button.querySelector("svg")!
    expect(svg.getAttribute("aria-hidden")).toBe("true")
    expect(svg.getAttribute("focusable")).toBe("false")
    expect(svg.querySelector("rect")).not.toBeNull()

    const live = button.querySelector('[aria-live="polite"]')!
    expect(live.textContent).toBe("Sao chép")
    expect(live.querySelector(".sr-only")).toBeNull()
  })

  it("copies value to clipboard, shows 'Đã chép' with checkmark icon and sr-only name, then resets after 2000ms", async () => {
    vi.useFakeTimers()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    setClipboardWriteText(writeTextMock)

    const button = renderCopyButton({
      value: "19036888999011",
      label: "Chép số",
      name: "số tài khoản",
    })
    const live = button.querySelector('[aria-live="polite"]')!
    expect(live.textContent).toBe("Chép số số tài khoản")
    expect(live.querySelector(".sr-only")?.textContent).toBe(" số tài khoản")

    await act(async () => {
      button.click()
    })

    expect(writeTextMock).toHaveBeenCalledTimes(1)
    expect(writeTextMock).toHaveBeenCalledWith("19036888999011")
    expect(live.textContent).toBe("Đã chép số tài khoản")
    expect(button.querySelector("svg rect")).toBeNull()
    expect(button.querySelector("svg path")?.getAttribute("d")).toBe("m5 12.5 4.5 4.5L19 7.5")

    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(live.textContent).toBe("Đã chép số tài khoản")

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(live.textContent).toBe("Chép số số tài khoản")
    expect(button.querySelector("svg rect")).not.toBeNull()
  })

  it("shows 'Không chép được' without checkmark when clipboard write rejects, then resets after 2000ms", async () => {
    vi.useFakeTimers()
    const writeTextMock = vi.fn().mockRejectedValue(new Error("Denied"))
    setClipboardWriteText(writeTextMock)

    const button = renderCopyButton({
      value: "GIVE-ERR",
      name: "mã tham chiếu",
    })
    const live = button.querySelector('[aria-live="polite"]')!

    await act(async () => {
      button.click()
    })

    expect(writeTextMock).toHaveBeenCalledWith("GIVE-ERR")
    expect(live.textContent).toBe("Không chép được mã tham chiếu")
    expect(button.querySelector("svg rect")).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(live.textContent).toBe("Sao chép mã tham chiếu")
  })
})
