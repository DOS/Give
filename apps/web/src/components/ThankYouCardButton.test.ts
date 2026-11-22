// @vitest-environment happy-dom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatVnd } from "@/lib/format"
import { ANONYMOUS_DONOR_CARD_LABEL, type ThankYouCardInput } from "@/lib/viral-sharing"

import { ThankYouCardButton } from "./ThankYouCardButton"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root
let drawnText: string[]

function createMockContext() {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "top",
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn((text: string) => {
      drawnText.push(text)
    }),
    measureText: vi.fn((text: string) => ({ width: text.length * 14 })),
  }
}

function cardFixture(overrides: Partial<ThankYouCardInput> = {}): ThankYouCardInput {
  return {
    kind: "donation",
    referenceCode: "GVABCDEFG",
    amount: 250_000,
    campaignTitle: "Bữa trưa cho em",
    campaignSlug: "bua-trua-cho-em",
    campaignType: "give",
    donorName: "Nguyễn Minh",
    isAnonymous: false,
    createdAt: "2026-11-20T03:00:00.000Z",
    origin: "https://give.vn",
    ...overrides,
  }
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  drawnText = []
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => createMockContext() as unknown as CanvasRenderingContext2D
  )
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => {
    cb(new Blob(["png"], { type: "image/png" }))
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe("ThankYouCardButton (DOS/Give#313)", () => {
  it("shows VND amount clearly by default and completely omits it when the privacy toggle is enabled", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:thankyou-url")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const clickedDownloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedDownloads.push(this.download)
    })

    act(() => {
      root.render(createElement(ThankYouCardButton, { card: cardFixture() }))
    })

    const trigger = container.querySelector<HTMLButtonElement>("button")!
    expect(trigger.textContent).toContain("Tôi đã chung tay")

    act(() => {
      trigger.click()
    })

    // Portaled into document.body (outside container / role="status")
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog).not.toBeNull()
    expect(dialog.textContent).toContain("Nguyễn Minh")
    expect(dialog.textContent).toContain("GVABCDEFG")
    expect(dialog.textContent).toContain(formatVnd(250_000))
    expect(drawnText).toContain(formatVnd(250_000))
    expect(drawnText).toContain("Tôi đã chung tay")
    expect(drawnText).toContain("GVABCDEFG")

    // Toggle "Ẩn số tiền trên thẻ"
    const checkbox = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(checkbox.checked).toBe(false)

    drawnText = []
    act(() => {
      checkbox.click()
    })
    expect(checkbox.checked).toBe(true)
    expect(dialog.textContent).toContain("Đã ẩn theo lựa chọn của bạn")
    expect(dialog.textContent).not.toContain("250.000")
    expect(drawnText.join(" ")).not.toContain("250.000")
    expect(drawnText.join(" ")).not.toContain("250000")

    // Download PNG
    const downloadBtn = [...dialog.querySelectorAll("button")].find((b) => b.textContent?.includes("Tải ảnh PNG"))!
    await act(async () => {
      downloadBtn.click()
    })
    expect(createUrl).toHaveBeenCalledTimes(1)
    expect(clickedDownloads).toEqual(["give-chung-tay-gvabcdefg.png"])
  })

  it("renders anonymous donor label when isAnonymous is true without leaking donorName", () => {
    act(() => {
      root.render(
        createElement(ThankYouCardButton, {
          card: cardFixture({ donorName: "Tên riêng tư", isAnonymous: true }),
        })
      )
    })

    act(() => {
      container.querySelector<HTMLButtonElement>("button")!.click()
    })

    // Portaled into document.body (outside container / role="status")
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain(ANONYMOUS_DONOR_CARD_LABEL)
    expect(dialog.textContent).not.toContain("Tên riêng tư")
    expect(drawnText).toContain(ANONYMOUS_DONOR_CARD_LABEL)
    expect(drawnText.join(" ")).not.toContain("Tên riêng tư")
  })
})
