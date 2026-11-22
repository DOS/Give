import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CampaignFaqAccordion } from "@/components/campaign/CampaignFaqAccordion"
import type { CampaignFaq } from "@/lib/campaign-faqs"

const CAMPAIGN = "44444444-4444-4444-8444-444444444444"

describe("CampaignFaqAccordion (DOS/Give#316)", () => {
  it("renders nothing when faqs is empty", () => {
    expect(renderToStaticMarkup(createElement(CampaignFaqAccordion, { faqs: [] }))).toBe("")
  })

  it("renders sorted native details/summary items and escapes raw HTML safely", () => {
    const faqs: CampaignFaq[] = [
      {
        id: "f-2",
        campaign_id: CAMPAIGN,
        question: "Câu thứ hai?",
        answer: '<img src=x onerror="alert(1)">Dòng an toàn',
        position: 2,
        created_at: "2026-11-22T00:00:00Z",
        updated_at: "2026-11-22T00:00:00Z",
      },
      {
        id: "f-1",
        campaign_id: CAMPAIGN,
        question: "Câu đầu tiên <script>x()</script>?",
        answer: "Trả lời đầu tiên.",
        position: 0,
        created_at: "2026-11-22T00:00:00Z",
        updated_at: "2026-11-22T00:00:00Z",
      },
    ]

    const html = renderToStaticMarkup(createElement(CampaignFaqAccordion, { faqs }))
    expect(html).toContain('id="hoi-dap"')
    expect(html).toContain('aria-labelledby="faq-heading"')
    expect(html).toContain("<details")
    expect(html).toContain("<summary")
    expect(html.indexOf("Câu đầu tiên")).toBeLessThan(html.indexOf("Câu thứ hai?"))
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img ")
    expect(html).toContain("&lt;script&gt;x()&lt;/script&gt;")
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
  })
})
