import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { CampaignTransparencySummary } from "@/lib/transparency"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

import { TransparencySummaryBox } from "./TransparencySummaryBox"

function summaryFixture(overrides: Partial<CampaignTransparencySummary> = {}): CampaignTransparencySummary {
  return {
    campaign_id: "33333333-3333-4333-8333-333333333333",
    last_statement_at: "2026-11-20T08:00:00Z",
    matched_incoming_total: 5_000_000,
    disbursable_total: 10_000_000,
    disbursed_total: 6_500_000,
    refunded_total: 0,
    evidence_count: 14,
    unexplained_inbound_count: 0,
    unexplained_out_count: 0,
    has_impact_report: false,
    impact_report_published_at: null,
    milestone_rollups: [],
    ...overrides,
  }
}

describe("TransparencySummaryBox (DOS/Give#314)", () => {
  it("renders statement freshness, disbursed %, evidence count, zero unexplained badge, and statement link", () => {
    const html = renderToStaticMarkup(
      createElement(TransparencySummaryBox, { slug: "xay-truong-ban-may", summary: summaryFixture() })
    )
    expect(html).toContain("Tóm tắt minh bạch sao kê")
    expect(html).toContain("Sao kê cập nhật lúc")
    expect(html).toContain("65%")
    expect(html).toContain("14")
    expect(html).toContain("ảnh hóa đơn / biên nhận")
    expect(html).toContain("0 chưa giải trình")
    expect(html).toContain('href="/campaigns/xay-truong-ban-may/statement"')
    expect(html).not.toContain("#bao-cao-tong-ket")
  })

  it("renders empty freshness copy, dash for zero disbursable %, unexplained breakdown, and impact report jump link when present", () => {
    const html = renderToStaticMarkup(
      createElement(TransparencySummaryBox, {
        slug: "xay-truong-ban-may",
        summary: summaryFixture({
          last_statement_at: null,
          disbursable_total: 0,
          disbursed_total: 0,
          unexplained_inbound_count: 2,
          unexplained_out_count: 1,
          has_impact_report: true,
          impact_report_published_at: "2026-11-21T00:00:00Z",
        }),
      })
    )
    expect(html).toContain("Chưa có giao dịch sao kê nào được ghi nhận")
    expect(html).toContain(">—<")
    expect(html).not.toContain(">0%<")
    expect(html).toContain("3 chưa giải trình")
    expect(html).toContain("(2 vào · 1 ra)")
    expect(html).toContain('href="#bao-cao-tong-ket"')
    expect(html).toContain("bg-primary-soft")
    expect(html).not.toContain("bg-brand-soft")
  })

  it("omits #bao-cao-tong-ket anchor when showImpactReportLink is false even if summary.has_impact_report is true", () => {
    const html = renderToStaticMarkup(
      createElement(TransparencySummaryBox, {
        slug: "xay-truong-ban-may",
        summary: summaryFixture({ has_impact_report: true }),
        showImpactReportLink: false,
      })
    )
    expect(html).not.toContain("#bao-cao-tong-ket")
  })
})
