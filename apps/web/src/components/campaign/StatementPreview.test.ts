import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { formatVnd } from "@/lib/format"
import type { MoneyTotals, StatementRow } from "@/lib/statement"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { StatementPreview } = await import("./StatementPreview")

const totals: MoneyTotals = {
  campaign_id: "22222222-2222-4222-8222-222222222222",
  type: "give",
  asset: "VND",
  goal_amount: 50_000_000,
  pledged_amount: 0,
  paid_amount: 1_500_000,
  disbursable_amount: 1_500_000,
  disbursed_amount: 700_000,
  refunded_amount: 0,
  unexplained_out_amount: 0,
  unexplained_out_count: 0,
  supporters_count: 3,
  other_in_amount: 0,
  refund_owed_amount: 0,
  backers_count: 0,
  payments_stopped_at: null,
  payments_stopped_note: null,
  own_transfer_amount: 0,
}

const row = (over: Partial<StatementRow>): StatementRow => ({
  id: "t",
  direction: "out",
  asset: "VND",
  amount: 3_000_000,
  booked_at: "2026-11-11T02:00:00Z",
  booked_date_only: false,
  after_close: false,
  matched: false,
  counterparty_account_masked: null,
  explained: null,
  purpose: null,
  category: null,
  recipient: null,
  is_refund: null,
  explained_at: null,
  donor_name: null,
  donor_anonymous: null,
  in_explanation: null,
  in_explained_at: null,
  own_transfer_id: null,
  own_transfer_at: null,
  own_transfer_label: null,
  ...over,
})

describe("StatementPreview: a transfer between the campaign's own accounts (DOS/Give#84)", () => {
  const pair = {
    own_transfer_id: "p",
    own_transfer_at: "2026-11-12T00:00:00Z",
    own_transfer_label: "Chuyển sang tài khoản mới",
  }

  it("labels both legs, never as explained spending or as a donation", () => {
    const html = renderToStaticMarkup(
      createElement(StatementPreview, {
        slug: "a",
        totals: { ...totals, own_transfer_amount: 3_000_000 },
        rows: [row({ id: "out", explained: true, ...pair }), row({ id: "in", direction: "in", ...pair })],
      })
    )
    expect(html.match(/Chuyển sang tài khoản mới/g)?.length).toBeGreaterThanOrEqual(2)
    expect(html).toContain("Chuyển tài khoản")
    expect(html).not.toContain("Đã giải trình")
    expect(html).not.toContain("Không công khai")
    // The incoming leg is not shown in the donation green.
    expect(html).not.toContain('text-primary">+')
    expect(html).toContain(formatVnd(3_000_000))
    expect(html).toContain("không phải tiền ủng hộ mới hay khoản chi")
  })

  it("shows no transfer note without a pair", () => {
    const html = renderToStaticMarkup(createElement(StatementPreview, { slug: "a", totals, rows: [] }))
    expect(html).not.toContain("tài khoản cũ")
  })
})
