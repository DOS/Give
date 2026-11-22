// @vitest-environment happy-dom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { encodeQrMatrix, type CampaignPosterData } from "@/lib/viral-sharing"

import { QrPosterButton } from "./QrPosterButton"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root
let drawnText: string[]
let originalBeacon: PropertyDescriptor | undefined
let sendBeaconMock: ReturnType<typeof vi.fn>

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

function posterFixture(overrides: Partial<CampaignPosterData> = {}): CampaignPosterData {
  return {
    campaignId: "33333333-3333-4333-8333-333333333333",
    slug: "xay-truong-ban-may",
    path: "/campaigns/xay-truong-ban-may",
    origin: "https://give.vn",
    type: "give",
    typeBadge: "Từ thiện",
    title: "Xây trường Bản Mây",
    organizerName: "Quỹ Bản Mây",
    organizerVerified: true,
    raisedLabel: "Đã nhận",
    raisedText: "40.000.000 ₫",
    goalText: "Mục tiêu 100.000.000 ₫",
    percent: 40,
    showProgressBar: true,
    verifiedStatementBadge: "Sao kê đối chiếu ngân hàng",
    vietQr: {
      qr: encodeQrMatrix("00020101021138540010A00000072701240006970436011001234567890208QRIBFTTA53037045802VN6304ABCD"),
      bankName: "Vietcombank",
      maskedAccount: "•••• 6789",
    },
    ...overrides,
  }
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  drawnText = []
  originalBeacon = Object.getOwnPropertyDescriptor(navigator, "sendBeacon")
  sendBeaconMock = vi.fn(() => true)
  Object.defineProperty(navigator, "sendBeacon", { value: sendBeaconMock, configurable: true, writable: true })
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
  if (originalBeacon) {
    Object.defineProperty(navigator, "sendBeacon", originalBeacon)
  } else {
    Reflect.deleteProperty(navigator, "sendBeacon")
  }
  vi.restoreAllMocks()
})

describe("QrPosterButton (DOS/Give#313)", () => {
  it("opens modal, switches Story (9:16) and Square (1:1), shows masked VietQR hint, and downloads PNG", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:poster-url")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const clickedDownloads: string[] = []
    const origClick = HTMLAnchorElement.prototype.click
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedDownloads.push(this.download)
    })

    try {
      act(() => {
        root.render(createElement(QrPosterButton, { data: posterFixture() }))
      })

      const trigger = container.querySelector<HTMLButtonElement>("button")!
      expect(trigger.textContent).toContain("Tải poster QR")
      expect(trigger.className).toContain("btn-secondary")
      expect(document.querySelector('[role="dialog"]')).toBeNull()

      act(() => {
        trigger.click()
      })

      // Portaled into document.body (outside container) so sticky parents cannot trap z-index.
      expect(container.querySelector('[role="dialog"]')).toBeNull()
      const dialog = document.querySelector('[role="dialog"]')!
      expect(dialog).not.toBeNull()
      expect(dialog.parentElement?.parentElement).toBe(document.body)
      expect(dialog.textContent).toContain("Vietcombank · •••• 6789")
      expect(dialog.textContent).not.toContain("0123456789")

      const canvas = dialog.querySelector<HTMLCanvasElement>("canvas")!
      expect(canvas.width).toBe(1080)
      expect(canvas.height).toBe(1920)
      expect(drawnText.some((t) => t.includes("Vietcombank · •••• 6789"))).toBe(true)

      // Tab / Shift+Tab focus trap cycles between first (Close) and last (Download) buttons.
      const closeBtn = dialog.querySelector<HTMLButtonElement>('button[aria-label="Đóng"]')!
      const initialDownloadBtn = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
        b.textContent?.includes("Tải ảnh PNG")
      )!
      expect(document.activeElement).toBe(closeBtn)
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true }))
      })
      expect(document.activeElement).toBe(initialDownloadBtn)
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", cancelable: true }))
      })
      expect(document.activeElement).toBe(closeBtn)

      // Switch to Square (1:1)
      const squareBtn = [...dialog.querySelectorAll("button")].find((b) => b.textContent?.includes("Vuông (1:1)"))!
      drawnText = []
      act(() => {
        squareBtn.click()
      })
      expect(canvas.width).toBe(1080)
      expect(canvas.height).toBe(1080)
      expect(drawnText.some((t) => t.includes("VietQR chuyển khoản"))).toBe(true)

      // Download Square PNG
      const downloadBtn = [...dialog.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Tải ảnh PNG (1:1)")
      )!
      await act(async () => {
        downloadBtn.click()
      })
      expect(createUrl).toHaveBeenCalledTimes(1)
      expect(clickedDownloads).toEqual(["give-poster-xay-truong-ban-may-square.png"])

      // Escape closes the dialog and returns focus to trigger
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
      })
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    } finally {
      HTMLAnchorElement.prototype.click = origClick
    }
  })

  it("renders campaign-link QR only without VietQR payment text when vietQr is suppressed (#93)", () => {
    act(() => {
      root.render(createElement(QrPosterButton, { data: posterFixture({ vietQr: null }) }))
    })

    act(() => {
      container.querySelector<HTMLButtonElement>("button")!.click()
    })

    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain("không gắn mã chuyển khoản")
    expect(dialog.textContent).not.toContain("VietQR")
    expect(dialog.textContent).not.toContain("Vietcombank")
    expect(drawnText.some((t) => t.includes("VIETQR"))).toBe(false)
    expect(drawnText.some((t) => t.includes("Quét mã QR để xem chiến dịch"))).toBe(true)
  })
})
