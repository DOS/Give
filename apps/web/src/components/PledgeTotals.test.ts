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
})
