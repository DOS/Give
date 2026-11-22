import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { CampaignImpactReport } from "@/lib/transparency"

import { ClosingImpactReport } from "./ClosingImpactReport"

function reportFixture(overrides: Partial<CampaignImpactReport> = {}): CampaignImpactReport {
  return {
    campaign_id: "33333333-3333-4333-8333-333333333333",
    summary:
      "## Hoàn thành dự án\n\nĐã bàn giao **3 phòng học**.\n\n<script>alert('xss')</script>\n\n[Click](javascript:alert(1))\n\n![tracking pixel](https://evil.test/p.png)",
    highlights: [
      { label: "Học sinh hưởng lợi", value: "120 em" },
      { label: "Phòng học mới", value: "3 phòng" },
    ],
    published_at: "2026-11-20T08:00:00Z",
    created_at: "2026-11-19T08:00:00Z",
    updated_at: "2026-11-20T08:00:00Z",
    ...overrides,
  }
}

describe("ClosingImpactReport (DOS/Give#314)", () => {
  it("renders nothing when the report is unpublished", () => {
    const html = renderToStaticMarkup(
      createElement(ClosingImpactReport, { report: reportFixture({ published_at: null }) })
    )
    expect(html).toBe("")
  })

  it("renders highlights and safe Markdown without executing raw HTML or javascript: links", () => {
    const html = renderToStaticMarkup(createElement(ClosingImpactReport, { report: reportFixture() }))
    expect(html).toContain('id="bao-cao-tong-ket"')
    expect(html).toContain("Báo cáo tổng kết tác động")
    expect(html).toContain("Học sinh hưởng lợi")
    expect(html).toContain("120 em")
    expect(html).toContain("3 phòng học")
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("javascript:")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("evil.test")
  })

  it("shows updated date when edited after initial publication", () => {
    const html = renderToStaticMarkup(
      createElement(ClosingImpactReport, {
        report: reportFixture({ updated_at: "2026-11-22T08:00:00Z" }),
      })
    )
    expect(html).toContain("Cập nhật")
  })
})
