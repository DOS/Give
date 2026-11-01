import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { formatVnd } from "@/lib/format"
import type { MoneyTotals as Totals } from "@/lib/statement"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { MoneyTotals } = await import("./MoneyTotals")

const totals: Totals = {
  campaign_id: "22222222-2222-4222-8222-222222222222",
  type: "give",
  asset: "VND",
  goal_amount: 50_000_000,
  pledged_amount: 0,
  paid_amount: 1_500_000,
  disbursable_amount: 1_500_000,
  disbursed_amount: 700_000,
  refunded_amount: 100_000,
  unexplained_out_amount: 200_000,
  unexplained_out_count: 1,
  supporters_count: 3,
}

/** The text of each figure, by its data-figure key. */
function figures(html: string): Record<string, string> {
  return Object.fromEntries([...html.matchAll(/data-figure="(\w+)">([^<]*)</g)].map((m) => [m[1], m[2]]))
}

describe("MoneyTotals", () => {
  it("shows exactly the view's values for a give campaign, without pledged", () => {
    const html = renderToStaticMarkup(createElement(MoneyTotals, { totals, statementHref: "/campaigns/a/statement" }))
    expect(figures(html)).toEqual({
      paid: formatVnd(1_500_000),
      refunded: formatVnd(100_000),
      remaining: formatVnd(700_000),
      disbursed: formatVnd(700_000),
      unexplained: formatVnd(200_000),
    })
    // The gross amount is the headline; refunded and remaining follow right below it.
    const order = ["paid", "refunded", "remaining", "disbursed"].map((k) => html.indexOf(`data-figure="${k}"`))
    expect(order).toEqual([...order].sort((x, y) => x - y))
    expect(html).toContain("1 khoản")
    expect(html).toContain('href="/campaigns/a/statement"')
  })

  it("adds pledged for a back campaign", () => {
    const html = renderToStaticMarkup(
      createElement(MoneyTotals, { totals: { ...totals, type: "back", pledged_amount: 9_000_000 } })
    )
    expect(figures(html).pledged).toBe(formatVnd(9_000_000))
  })
})
