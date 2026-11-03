import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { formatVnd } from "@/lib/format"
import type { MoneyTotals } from "@/lib/statement"

import { PledgeTotals } from "./PledgeTotals"

const totals: MoneyTotals = {
  campaign_id: "c",
  type: "back",
  asset: "VND",
  goal_amount: 500_000,
  pledged_amount: 200_000,
  paid_amount: 350_000,
  disbursable_amount: 350_000,
  disbursed_amount: 0,
  refunded_amount: 0,
  unexplained_out_amount: 0,
  unexplained_out_count: 0,
  supporters_count: 2,
  other_in_amount: 50_000,
  refund_owed_amount: 100_000,
  backers_count: 1,
  payments_stopped_at: null,
  payments_stopped_note: null,
}

function figure(html: string, name: string): string | undefined {
  return new RegExp(`data-figure="${name}"[^>]*>([^<]*)`).exec(html)?.[1]
}

describe("PledgeTotals", () => {
  it("shows pledged, paid by backers and goal side by side, and the refund owed", () => {
    const html = renderToStaticMarkup(createElement(PledgeTotals, { totals }))
    expect(figure(html, "pledged")).toBe(formatVnd(200_000))
    // The organizer's own top-up (other_in) is not a backer payment.
    expect(figure(html, "paid")).toBe(formatVnd(300_000))
    expect(figure(html, "goal")).toBe(formatVnd(500_000))
    expect(html).toContain("Hoàn tiền còn nợ người ủng hộ")
    expect(html).toContain(formatVnd(100_000))
  })

  it("hides the refund line once nothing is owed", () => {
    const html = renderToStaticMarkup(createElement(PledgeTotals, { totals: { ...totals, refund_owed_amount: 0 } }))
    expect(html).not.toContain("Hoàn tiền còn nợ")
  })

  it("shows no stop notice while payment requests run", () => {
    const html = renderToStaticMarkup(createElement(PledgeTotals, { totals }))
    expect(html).not.toContain('data-notice="payments_stopped"')
  })

  it("puts the moderator's public notice first when payment requests are stopped (DOS/Give#89)", () => {
    const html = renderToStaticMarkup(
      createElement(PledgeTotals, {
        totals: {
          ...totals,
          payments_stopped_at: "2026-11-10T03:00:00Z",
          payments_stopped_note: "Give đang xác minh dự án <b>này</b>.",
        },
      })
    )
    expect(html.indexOf('data-notice="payments_stopped"')).toBeLessThan(html.indexOf('data-figure="pledged"'))
    expect(html).toContain("Give đã tạm dừng yêu cầu thanh toán")
    expect(html).toContain("đừng chuyển thêm tiền")
    // The note is text, never markup.
    expect(html).toContain("Give đang xác minh dự án &lt;b&gt;này&lt;/b&gt;.")
  })
})
