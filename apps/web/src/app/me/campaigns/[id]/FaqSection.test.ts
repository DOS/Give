import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { CampaignFaq } from "@/lib/campaign-faqs"

vi.mock("../faq-actions", () => ({
  saveCampaignFaq: vi.fn(),
  deleteCampaignFaq: vi.fn(),
  moveCampaignFaq: vi.fn(),
}))

const { FaqSection } = await import("./FaqSection")

const CAMPAIGN = "44444444-4444-4444-8444-444444444444"

function makeFaq(index: number, overrides: Partial<CampaignFaq> = {}): CampaignFaq {
  return {
    id: `66666666-6666-4666-8666-6666666666${String(index).padStart(2, "0")}`,
    campaign_id: CAMPAIGN,
    question: `Câu hỏi ${index}`,
    answer: `Trả lời ${index}`,
    position: index,
    created_at: "2026-11-22T00:00:00Z",
    updated_at: "2026-11-22T00:00:00Z",
    ...overrides,
  }
}

describe("FaqSection (DOS/Give#316)", () => {
  it("renders add/edit/delete/reorder controls on editable statuses (including live) and escapes HTML", () => {
    const faqs = [
      makeFaq(0, { question: "Có <script>alert(1)</script> không?", answer: "<b>Không</b>\nDòng 2" }),
      makeFaq(1, { question: "Khi nào giao quà?", answer: "Tháng 3/2027." }),
    ]
    const html = renderToStaticMarkup(createElement(FaqSection, { campaignId: CAMPAIGN, status: "live", faqs }))

    expect(html).toContain('id="faqs"')
    expect(html).toContain("Câu hỏi thường gặp")
    expect(html).toContain("Thêm câu hỏi thường gặp")
    expect(html).toContain("(2/25)")
    expect(html).toContain("Sửa câu hỏi này")
    expect(html).toContain("↑ Lên")
    expect(html).toContain("↓ Xuống")
    expect(html).toContain("Xóa")
    expect(html).toContain("Tối đa 4.000 ký tự.")
    // Plain-text escaping: zero raw script/HTML tags injected from user input.
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).not.toContain("<b>Không</b>")
  })

  it("hides write controls on non-editable statuses like in_review and closed", () => {
    const html = renderToStaticMarkup(
      createElement(FaqSection, { campaignId: CAMPAIGN, status: "in_review", faqs: [makeFaq(0)] })
    )
    expect(html).toContain("Câu hỏi 0")
    expect(html).not.toContain("Thêm câu hỏi thường gặp")
    expect(html).not.toContain("Sửa câu hỏi này")
    expect(html).not.toContain("↑ Lên")
  })

  it("hides the add form when 25 FAQs exist and shows a danger callout when faqs is null", () => {
    const full = Array.from({ length: 25 }, (_, i) => makeFaq(i))
    const fullHtml = renderToStaticMarkup(
      createElement(FaqSection, { campaignId: CAMPAIGN, status: "draft", faqs: full })
    )
    expect(fullHtml).not.toContain("Thêm câu hỏi thường gặp")
    expect(fullHtml).toContain("Đã đạt giới hạn tối đa 25 câu hỏi thường gặp.")

    const errHtml = renderToStaticMarkup(
      createElement(FaqSection, { campaignId: CAMPAIGN, status: "draft", faqs: null })
    )
    expect(errHtml).toContain("Không tải được danh sách câu hỏi thường gặp.")
  })
})
