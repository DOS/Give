import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { formatVnd } from "@/lib/format"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { DonorImpactCard } = await import("./DonorImpactCard")

describe("DonorImpactCard (/me/contributions, DOS/Give#315)", () => {
  it("renders impact totals, category breakdown percentages, and followed organizer profile links", () => {
    const html = renderToStaticMarkup(
      createElement(DonorImpactCard, {
        summary: {
          total_matched_vnd: 1250000,
          campaigns_supported_count: 3,
          active_monthly_plans_count: 1,
          followed_campaigns_count: 4,
          followed_organizers_count: 2,
          category_breakdown: [
            {
              category_id: "c1",
              category_slug: "healthcare",
              category_name: "Y tế",
              total_vnd: 750000,
              campaigns_count: 2,
            },
            {
              category_id: "c2",
              category_slug: "technology",
              category_name: "Công nghệ",
              total_vnd: 500000,
              campaigns_count: 1,
            },
          ],
        },
        followedOrganizers: [
          {
            handle: "quy-ban-may",
            display_name: "Quỹ Bản Mây",
            avatar_url: "https://cdn.dos.me/a.png",
            kind: "organization",
            verification_status: "verified",
            followed_at: "2026-11-20T00:00:00Z",
          },
          {
            handle: "admin", // reserved handle must never render as a link
            display_name: "Bad Handle",
            avatar_url: null,
            kind: "individual",
            verification_status: "unverified",
            followed_at: "2026-11-19T00:00:00Z",
          },
        ],
      })
    )
    const win = new Window()
    win.document.body.innerHTML = html
    const text = win.document.body.textContent ?? ""

    expect(text).toContain("Dấu ấn đóng góp của tôi")
    expect(text).toContain(formatVnd(1250000))
    expect(text).toContain("4 chiến dịch · 2 người tổ chức")
    expect(text).toContain("Phân bổ theo danh mục")
    expect(text).toContain("Y tế")
    expect(text).toContain("60%")
    expect(text).toContain("Công nghệ")
    expect(text).toContain("40%")
    expect(win.document.querySelector('a[href="/u/quy-ban-may"]')?.textContent).toContain("Quỹ Bản Mây")
    expect(win.document.querySelector('a[href="/u/admin"]')).toBeNull()
  })
})
