// @vitest-environment happy-dom
import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { MyAmbassadorLinksSection } from "@/components/me/MyAmbassadorLinksSection"

describe("MyAmbassadorLinksSection (DOS/Give#319)", () => {
  it("renders a calm empty state pointing to /campaigns when the user has no ambassador links", () => {
    const html = renderToStaticMarkup(createElement(MyAmbassadorLinksSection, { links: [], origin: "https://give.vn" }))
    const doc = new Window().document
    doc.body.innerHTML = html

    expect(doc.querySelector("h2")?.textContent).toBe("Liên kết đồng hành của tôi")
    expect(html).toContain("Bạn chưa tạo liên kết đồng hành cho chiến dịch nào.")
    expect(doc.querySelector('a[href="/campaigns"]')).not.toBeNull()
  })

  it("renders ambassador links with ?ref= URL, copy button, visibility badge, and net matched stats", () => {
    const html = renderToStaticMarkup(
      createElement(MyAmbassadorLinksSection, {
        origin: "https://give.vn",
        links: [
          {
            campaign_id: "22222222-2222-4222-8222-222222222222",
            campaign_slug: "xay-truong-ban-may",
            campaign_title: "Xây trường Bản Mây",
            campaign_status: "live",
            campaign_type: "give",
            ref_code: "ab23cd45ef",
            display_name: "CLB Sinh viên Xanh",
            show_on_leaderboard: true,
            matched_count: 4,
            matched_total_vnd: 1_200_000,
            created_at: "2026-11-22T00:00:00Z",
            updated_at: "2026-11-22T00:00:00Z",
          },
          {
            campaign_id: "33333333-3333-4333-8333-333333333333",
            campaign_slug: "du-an-den",
            campaign_title: "Dự án đèn",
            campaign_status: "succeeded",
            campaign_type: "back",
            ref_code: "xy98zw76ab",
            display_name: "Ẩn Danh Lan Tỏa",
            show_on_leaderboard: false,
            matched_count: 1,
            matched_total_vnd: 300_000,
            created_at: "2026-11-20T00:00:00Z",
            updated_at: "2026-11-20T00:00:00Z",
          },
        ],
      })
    )
    const doc = new Window().document
    doc.body.innerHTML = html

    expect(html).toContain("Liên kết đồng hành của tôi")
    expect(html).toContain("5 lượt đã đối soát")
    expect(html).toContain("1.500.000")
    expect(html).toContain("https://give.vn/campaigns/xay-truong-ban-may?ref=ab23cd45ef")
    expect(html).toContain("https://give.vn/campaigns/du-an-den?ref=xy98zw76ab")
    expect(html).toContain("Hiện trên bảng lan tỏa")
    expect(html).toContain("Ẩn khỏi bảng lan tỏa")
    expect(doc.querySelectorAll("button")).toHaveLength(2)
    expect(doc.querySelector('a[href="/campaigns/xay-truong-ban-may"]')).not.toBeNull()
  })
})
