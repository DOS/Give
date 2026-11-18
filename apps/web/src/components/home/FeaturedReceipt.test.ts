/**
 * Covers the home hero's `FeaturedReceipt` statement card (DESIGN.md 8, DOS/Give#233):
 * give vs back breakdowns, empty/missing totals fallback, non-donation inbound note
 * (`other_in_amount`), `display_options` toggles, and campaign/statement links.
 */
import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { CardCampaign } from "@/lib/campaigns"
import { formatVnd } from "@/lib/format"
import type { MoneyTotals } from "@/lib/statement"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { FeaturedReceipt } = await import("./FeaturedReceipt")

const parser = new new Window().DOMParser()

function makeCampaign(overrides: Partial<CardCampaign> = {}): CardCampaign {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "bua-com-vung-cao",
    type: "give",
    title: "Bữa cơm vùng cao cho em",
    goal_amount: 100_000_000,
    ends_at: "2999-01-01T00:00:00.000Z",
    status: "live",
    display_options: { progress_bar: true, backers_count: true, time_remaining: true },
    cover: null,
    ...overrides,
  }
}

function makeTotals(overrides: Partial<MoneyTotals> = {}): MoneyTotals {
  return {
    campaign_id: "11111111-1111-4111-8111-111111111111",
    type: "give",
    asset: "VND",
    goal_amount: 100_000_000,
    pledged_amount: 0,
    paid_amount: 65_000_000,
    disbursable_amount: 65_000_000,
    disbursed_amount: 20_000_000,
    refunded_amount: 5_000_000,
    unexplained_out_amount: 0,
    unexplained_out_count: 0,
    supporters_count: 18,
    other_in_amount: 0,
    refund_owed_amount: 0,
    backers_count: 0,
    payments_stopped_at: null,
    payments_stopped_note: null,
    own_transfer_amount: 0,
    ...overrides,
  }
}

function renderReceipt(campaign: CardCampaign, totals?: MoneyTotals) {
  const html = renderToStaticMarkup(createElement(FeaturedReceipt, { campaign, totals })).replace(/\u00a0/g, " ")
  const doc = parser.parseFromString(html, "text/html")
  const rows = Array.from(doc.querySelectorAll("dl > div")).map((row) => [
    row.querySelector("dt")?.textContent.trim(),
    row.querySelector("dd")?.textContent.trim(),
  ])
  return { html, doc, rows }
}

const norm = (s: string) => s.replace(/\u00a0/g, " ")

describe("FeaturedReceipt (DOS/Give#233)", () => {
  it("renders give campaign statement figures, progress, supporters, remaining days, and campaign/statement links", () => {
    const { html, doc, rows } = renderReceipt(makeCampaign(), makeTotals())

    expect(html).toContain("Từ thiện")
    expect(html).toContain("Theo sao kê tài khoản nhận")
    expect(doc.querySelector("h2 a")?.getAttribute("href")).toBe("/campaigns/bua-com-vung-cao")
    expect(doc.querySelector("h2 a")?.textContent.trim()).toBe("Bữa cơm vùng cao cho em")

    expect(rows).toEqual([
      ["Đã nhận", norm(formatVnd(65_000_000))],
      ["Đã hoàn lại", norm(formatVnd(5_000_000))],
      ["Đã chi", norm(formatVnd(20_000_000))],
      ["Còn lại", norm(formatVnd(40_000_000))],
    ])
    expect(html).not.toContain("không phải tiền ủng hộ")
    expect(doc.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("65")
    expect(html).toContain("65% mục tiêu")
    expect(html).toMatch(/18 người ủng hộ · Còn \d+ ngày/)

    const statementLink = Array.from(doc.querySelectorAll("a")).find(
      (a) => a.textContent.trim() === "Xem sao kê của chiến dịch"
    )
    expect(statementLink?.getAttribute("href")).toBe("/campaigns/bua-com-vung-cao/statement")
  })

  it("explains non-donation inbound money (other_in_amount) on give campaigns and excludes it from goal progress", () => {
    const { html, doc, rows } = renderReceipt(
      makeCampaign({ goal_amount: 100_000_000 }),
      makeTotals({ paid_amount: 60_000_000, other_in_amount: 10_000_000, disbursed_amount: 0, refunded_amount: 0 })
    )

    // Gross receipt amount stays 60M, while goal progress counts only the 50M of donations.
    expect(rows[0]).toEqual(["Đã nhận", norm(formatVnd(60_000_000))])
    expect(html).toContain(`Trong đó ${norm(formatVnd(10_000_000))} không phải tiền ủng hộ, đã được Give giải trình.`)
    expect(doc.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("50")
    expect(html).toContain("50% mục tiêu")
  })

  it("falls back cleanly to zero figures when totals are undefined and marks expired end dates", () => {
    const { html, doc, rows } = renderReceipt(makeCampaign({ ends_at: "2020-01-01T00:00:00.000Z" }), undefined)

    const zero = norm(formatVnd(0))
    expect(rows).toEqual([
      ["Đã nhận", zero],
      ["Đã hoàn lại", zero],
      ["Đã chi", zero],
      ["Còn lại", zero],
    ])
    expect(html).not.toContain("không phải tiền ủng hộ")
    expect(doc.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("0")
    expect(html).toContain("0% mục tiêu")
    expect(html).toContain("0 người ủng hộ · Đã hết hạn")
    expect(doc.querySelector('a[href="/campaigns/bua-com-vung-cao/statement"]')).toBeTruthy()
  })

  it("renders pledged vs goal figures and backers_count for back campaigns, both with totals and without", () => {
    const backCampaign = makeCampaign({
      slug: "board-game-lich-su",
      type: "back",
      title: "Board game Lịch sử Việt",
      goal_amount: 80_000_000,
    })
    const live = renderReceipt(
      backCampaign,
      makeTotals({
        type: "back",
        goal_amount: 80_000_000,
        pledged_amount: 60_000_000,
        paid_amount: 10_000_000,
        other_in_amount: 5_000_000,
        backers_count: 42,
        supporters_count: 99,
      })
    )

    expect(live.html).toContain("Dự án")
    expect(live.html).toContain("Theo các cam kết đã ghi nhận")
    expect(live.rows).toEqual([
      ["Đã cam kết", norm(formatVnd(60_000_000))],
      ["Mục tiêu", norm(formatVnd(80_000_000))],
    ])
    expect(live.html).not.toContain("không phải tiền ủng hộ")
    expect(live.html).toContain("75% mục tiêu")
    expect(live.html).toMatch(/42 người đồng hành · Còn \d+ ngày/)
    expect(live.doc.querySelector('a[href="/campaigns/board-game-lich-su/statement"]')).toBeTruthy()

    const empty = renderReceipt(backCampaign, undefined)
    expect(empty.rows).toEqual([
      ["Đã cam kết", norm(formatVnd(0))],
      ["Mục tiêu", norm(formatVnd(80_000_000))],
    ])
    expect(empty.html).toContain("0% mục tiêu")
    expect(empty.html).toContain("0 người đồng hành")
  })

  it("respects display_options when progress_bar, backers_count, or time_remaining are hidden", () => {
    const metaOnly = renderReceipt(
      makeCampaign({
        ends_at: null,
        display_options: { progress_bar: false, backers_count: true, time_remaining: true },
      }),
      makeTotals({ supporters_count: 9 })
    )
    expect(metaOnly.doc.querySelector('[role="progressbar"]')).toBeNull()
    expect(metaOnly.html).not.toContain("% mục tiêu")
    expect(metaOnly.html).toContain("9 người ủng hộ")

    const allHidden = renderReceipt(
      makeCampaign({
        display_options: { progress_bar: false, backers_count: false, time_remaining: false },
      }),
      makeTotals({ supporters_count: 9 })
    )
    expect(allHidden.doc.querySelector('[role="progressbar"]')).toBeNull()
    expect(allHidden.html).not.toContain("% mục tiêu")
    expect(allHidden.html).not.toContain("người ủng hộ")
    expect(allHidden.html).not.toMatch(/Còn \d+ ngày/)
    expect(allHidden.doc.querySelector('a[href="/campaigns/bua-com-vung-cao/statement"]')).toBeTruthy()
  })
})
