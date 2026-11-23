import { afterEach, describe, expect, it, vi } from "vitest"

import { renderPosterCanvas, renderThankYouCanvas, resolveCanvasSansFont } from "./canvas-cards"
import { encodeQrMatrix, type CampaignPosterData, type ThankYouCardModel } from "./viral-sharing"

function mockCanvas() {
  const fonts: string[] = []
  let currentFont = ""
  const ctx = {
    get font() {
      return currentFont
    },
    set font(value: string) {
      currentFont = value
      fonts.push(value)
    },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "left",
    textBaseline: "top",
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
  } as unknown as CanvasRenderingContext2D

  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement

  return { canvas, fonts }
}

const POSTER_DATA: CampaignPosterData = {
  campaignId: "33333333-3333-4333-8333-333333333333",
  slug: "xay-truong-ban-may",
  path: "/campaigns/xay-truong-ban-may",
  origin: "https://give.vn",
  type: "give",
  typeBadge: "Từ thiện",
  title: "Xây trường Bản Mây",
  organizerName: "Quỹ Bản Mây",
  organizerVerified: true,
  raisedText: "40.000.000 ₫",
  raisedLabel: "Đã nhận",
  goalText: "Mục tiêu 100.000.000 ₫",
  percent: 40,
  showProgressBar: true,
  verifiedStatementBadge: "Sao kê đối chiếu ngân hàng",
  vietQr: null,
}

const THANK_YOU_MODEL: ThankYouCardModel = {
  headline: "Tôi đã chung tay",
  typeBadge: "Từ thiện",
  donorName: "Nguyễn Minh",
  campaignTitle: "Xây trường Bản Mây",
  amountCaption: "Khoản đóng góp đã đối soát sao kê",
  amountText: "500.000 ₫",
  referenceCode: "GVABCDEFG",
  dateText: "20/11/2026",
  footerText: "give.vn · Sao kê đối chiếu ngân hàng · Give không giữ tiền",
  statementUrlText: "give.vn/campaigns/xay-truong-ban-may/statement",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("canvas-cards computed font resolution (DOS/Give#313, #331)", () => {
  it("falls back safely to SANS_FONT in Node/SSR when document or getComputedStyle is absent", () => {
    expect(resolveCanvasSansFont()).toContain('"Be Vietnam Pro"')

    vi.stubGlobal("document", { body: {} })
    vi.stubGlobal("getComputedStyle", () => ({ fontFamily: "   " }))
    expect(resolveCanvasSansFont()).toContain('"Be Vietnam Pro"')

    vi.stubGlobal("getComputedStyle", () => {
      throw new Error("computed style unavailable")
    })
    expect(resolveCanvasSansFont()).toContain('"Be Vietnam Pro"')
  })

  it("resolves document.body computed fontFamily at draw time for posters and thank-you cards", () => {
    const computedFamily = '"__Be_Vietnam_Pro_abc123", "__Be_Vietnam_Pro_Fallback_abc123", sans-serif'
    vi.stubGlobal("document", { body: {} })
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(() => ({ fontFamily: computedFamily }))
    )

    expect(resolveCanvasSansFont()).toBe(computedFamily)

    const poster = mockCanvas()
    renderPosterCanvas(poster.canvas, POSTER_DATA, "square", "https://give.vn/campaigns/xay-truong-ban-may")
    expect(poster.fonts.length).toBeGreaterThan(0)
    expect(poster.fonts.every((f) => f.includes(computedFamily))).toBe(true)

    const vietQrPosterData: CampaignPosterData = {
      ...POSTER_DATA,
      vietQr: {
        bankName: "Vietcombank",
        maskedAccount: "•••• 5678",
        qr: encodeQrMatrix(
          "00020101021138570010A00000072701270006970436011300110123456780208QRIBFTTA53037045802VN6304ABCD"
        ),
      },
    }
    for (const format of ["story", "square"] as const) {
      const qrPoster = mockCanvas()
      renderPosterCanvas(qrPoster.canvas, vietQrPosterData, format, "https://give.vn/campaigns/xay-truong-ban-may")
      expect(qrPoster.fonts.length).toBeGreaterThan(0)
      expect(qrPoster.fonts.every((f) => f.includes(computedFamily))).toBe(true)
    }

    const thankYou = mockCanvas()
    renderThankYouCanvas(thankYou.canvas, THANK_YOU_MODEL)
    const sansFonts = thankYou.fonts.filter((f) => !f.includes("ui-monospace"))
    const monoFonts = thankYou.fonts.filter((f) => f.includes("ui-monospace"))
    expect(sansFonts.length).toBeGreaterThan(0)
    expect(sansFonts.every((f) => f.includes(computedFamily))).toBe(true)
    expect(monoFonts).toHaveLength(1)
  })
})
