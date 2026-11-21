// @vitest-environment happy-dom
import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { CampaignAnalytics } from "@/lib/analytics"
import { AnalyticsTab } from "./AnalyticsTab"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

function sampleAnalytics(overrides: Partial<CampaignAnalytics> = {}): CampaignAnalytics {
  return {
    campaign_id: CAMPAIGN,
    campaign_type: "give",
    days: 30,
    start_date: "2026-10-24",
    end_date: "2026-11-22",
    totals: {
      views: 250,
      share_clicks: 18,
      contributions_count: 10,
      contributions_amount: 5_500_000,
      conversion_rate: 0.04,
    },
    daily: [
      {
        date: "2026-11-20",
        views: 100,
        share_clicks: 7,
        contributions_count: 4,
        contributions_amount: 2_000_000,
      },
      {
        date: "2026-11-21",
        views: 0,
        share_clicks: 0,
        contributions_count: 0,
        contributions_amount: 0,
      },
      {
        date: "2026-11-22",
        views: 150,
        share_clicks: 11,
        contributions_count: 6,
        contributions_amount: 3_500_000,
      },
    ],
    referrers: [
      { bucket: "facebook.com", views: 150 },
      { bucket: "zalo", views: 60 },
      { bucket: "direct", views: 40 },
    ],
    ...overrides,
  }
}

function renderDoc(html: string) {
  const doc = new Window().document
  doc.body.innerHTML = html
  return doc
}

describe("AnalyticsTab (DOS/Give#252)", () => {
  it("renders KPI summary, period switcher, daily chart/table, and referrer breakdown for a give campaign", () => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsTab, {
        campaignId: CAMPAIGN,
        campaignType: "give",
        campaignStatus: "live",
        days: 30,
        analytics: sampleAnalytics(),
        error: null,
      })
    )
    const doc = renderDoc(html)

    // Period switcher links with aria-current on active period
    const periodLinks = [...doc.querySelectorAll('nav[aria-label="Khoảng thời gian thống kê"] a')]
    expect(periodLinks.map((a) => a.textContent)).toEqual(["7 ngày", "30 ngày", "90 ngày"])
    expect(periodLinks[0].getAttribute("href")).toBe(`/me/campaigns/${CAMPAIGN}?tab=analytics&days=7`)
    expect(periodLinks[1].getAttribute("aria-current")).toBe("page")
    expect(periodLinks[2].getAttribute("href")).toBe(`/me/campaigns/${CAMPAIGN}?tab=analytics&days=90`)

    // KPI figures
    expect(doc.querySelector('[data-metric="views"]')?.textContent).toBe("250")
    expect(doc.querySelector('[data-metric="share_clicks"]')?.textContent).toBe("18")
    expect(doc.querySelector('[data-metric="conversion_rate"]')?.textContent).toBe("4%")
    expect(doc.querySelector('[data-metric="contributions_count"]')?.textContent).toBe("10")
    expect(doc.querySelector('[data-metric="contributions_amount"]')?.textContent).toContain("5.500.000")

    // Daily trend bar chart & active daily rows (zero day omitted from active table, newest first)
    const chart = doc.querySelector('[role="img"]')
    expect(chart?.getAttribute("aria-label")).toContain("150 lượt xem")
    expect(chart?.getAttribute("aria-label")).toContain("22/11/2026")
    const tableRows = [...doc.querySelectorAll("tbody tr")]
    expect(tableRows).toHaveLength(2)
    expect(tableRows[0].textContent).toContain("22/11/2026")
    expect(tableRows[1].textContent).toContain("20/11/2026")

    // Referrers
    const referrerSection = doc.querySelector('aside[aria-labelledby="analytics-referrers-heading"]')
    expect(referrerSection?.textContent).toContain("Facebook")
    expect(referrerSection?.textContent).toContain("150 (60%)")
    expect(referrerSection?.textContent).toContain("Zalo")
    expect(referrerSection?.textContent).toContain("Truy cập trực tiếp")
    expect(referrerSection?.textContent).toContain("không lưu địa chỉ IP")
  })

  it("uses pledge terminology for back campaigns", () => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsTab, {
        campaignId: CAMPAIGN,
        campaignType: "back",
        campaignStatus: "live",
        days: 7,
        analytics: sampleAnalytics({ campaign_type: "back", days: 7 }),
        error: null,
      })
    )
    expect(html).toContain("Lượt cam kết")
    expect(html).toContain("Tiền đã cam kết")
    expect(html).not.toContain("Tiền đã nhận")
  })

  it("renders distinct empty states for non-public vs public campaigns with no activity", () => {
    const zeroAnalytics = sampleAnalytics({
      totals: {
        views: 0,
        share_clicks: 0,
        contributions_count: 0,
        contributions_amount: 0,
        conversion_rate: 0,
      },
      daily: [],
      referrers: [],
    })

    const draftHtml = renderToStaticMarkup(
      createElement(AnalyticsTab, {
        campaignId: CAMPAIGN,
        campaignType: "give",
        campaignStatus: "draft",
        days: 30,
        analytics: zeroAnalytics,
        error: null,
      })
    )
    expect(draftHtml).toContain("Chiến dịch chưa có số liệu thống kê")
    expect(draftHtml).toContain("chưa hiển thị công khai")

    const liveEmptyHtml = renderToStaticMarkup(
      createElement(AnalyticsTab, {
        campaignId: CAMPAIGN,
        campaignType: "give",
        campaignStatus: "live",
        days: 7,
        analytics: zeroAnalytics,
        error: null,
      })
    )
    expect(liveEmptyHtml).toContain("Chưa có dữ liệu trong 7 ngày qua")

    const suspendedHtml = renderToStaticMarkup(
      createElement(AnalyticsTab, {
        campaignId: CAMPAIGN,
        campaignType: "give",
        campaignStatus: "suspended",
        days: 30,
        analytics: zeroAnalytics,
        error: null,
      })
    )
    expect(suspendedHtml).toContain("Chưa có dữ liệu trong 30 ngày qua")
    expect(suspendedHtml).toContain("Chiến dịch đang tạm dừng")
    expect(suspendedHtml).not.toContain("khi chiến dịch mở gây quỹ")

    const cancelledHtml = renderToStaticMarkup(
      createElement(AnalyticsTab, {
        campaignId: CAMPAIGN,
        campaignType: "give",
        campaignStatus: "cancelled",
        days: 30,
        analytics: zeroAnalytics,
        error: null,
      })
    )
    expect(cancelledHtml).toContain("Chiến dịch đã hủy")
    expect(cancelledHtml).not.toContain("khi chiến dịch mở gây quỹ")
  })

  it("renders a danger Callout when analytics failed to load", () => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsTab, {
        campaignId: CAMPAIGN,
        campaignType: "give",
        campaignStatus: "live",
        days: 30,
        analytics: null,
        error: "Có lỗi xảy ra. Hãy thử lại sau.",
      })
    )
    expect(html).toContain("Không tải được số liệu thống kê")
    expect(html).toContain("Có lỗi xảy ra. Hãy thử lại sau.")
  })
})
