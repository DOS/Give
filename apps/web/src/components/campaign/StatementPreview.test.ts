import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { formatVnd } from "@/lib/format"
import type { MoneyTotals, StatementRow } from "@/lib/statement"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { PREVIEW_ROWS, StatementPreview } = await import("./StatementPreview")

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
  return_of: null,
  returned_by: null,
  returned_at: null,
  return_bank_fee: null,
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
        rows: [
          row({ id: "out", explained: true, purpose: "Chuyển nội bộ cũ", ...pair }),
          row({ id: "in", direction: "in", ...pair }),
        ],
      })
    )
    expect(html.match(/Chuyển sang tài khoản mới/g)?.length).toBeGreaterThanOrEqual(4)
    expect(html).not.toContain("Chuyển nội bộ cũ")
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

describe("StatementPreview: a transfer out that a bank returned (DOS/Give#72)", () => {
  it("labels the money that came back as not a donation and the transfer out as returned", () => {
    const html = renderToStaticMarkup(
      createElement(StatementPreview, {
        slug: "a",
        totals,
        rows: [
          row({ id: "in", direction: "in", amount: 290_000, return_of: "out", returned_at: "2026-11-12T00:00:00Z" }),
          row({
            id: "out",
            explained: true,
            purpose: "Mua rau",
            returned_by: "in",
            returned_at: "2026-11-12T00:00:00Z",
          }),
        ],
      })
    )
    expect(html).toContain("Ngân hàng trả lại tiền chuyển đi")
    expect(html).toContain("Không phải tiền ủng hộ")
    expect(html).toContain("Bị ngân hàng trả lại")
    // Neither leg is colored in donation green.
    expect(html).not.toContain('text-primary">+')
    expect(html).toContain(`text-fg">+${formatVnd(290_000)}`)
    // The returned transfer out keeps its purpose but not the "explained" badge.
    expect(html).toContain("Mua rau")
    expect(html).not.toContain("Đã giải trình")
    expect(html).not.toContain("Chưa khớp với lượt ủng hộ nào")
  })
})

describe("StatementPreview: a bank fee on a returned refund (DOS/Give#195)", () => {
  it("names the fee once per pair, on the money that came back, as a bank fee", () => {
    const html = renderToStaticMarkup(
      createElement(StatementPreview, {
        slug: "a",
        totals,
        rows: [
          row({ id: "in", direction: "in", amount: 289_000, return_of: "out", return_bank_fee: 11_000 }),
          row({
            id: "out",
            amount: 300_000,
            explained: true,
            is_refund: true,
            purpose: "Hoàn tiền",
            returned_by: "in",
            return_bank_fee: 11_000,
          }),
        ],
      })
    )
    const fee = `Ngân hàng giữ ${formatVnd(11_000)} phí`
    // Twice: once in the desktop table, once in the phone list; never on the transfer out.
    expect(html.split(fee).length - 1).toBe(2)
    expect(html).not.toContain(formatVnd(22_000))
    expect(html).toContain("Bị ngân hàng trả lại")
  })

  it("names no fee when the bank returned everything", () => {
    const html = renderToStaticMarkup(
      createElement(StatementPreview, {
        slug: "a",
        totals,
        rows: [row({ id: "in", direction: "in", amount: 300_000, return_of: "out", return_bank_fee: 0 })],
      })
    )
    expect(html).toContain("Không phải tiền ủng hộ")
    expect(html).not.toContain("phí")
  })
})

describe("StatementPreview: a corrected explanation (DOS/Give#71)", () => {
  it("shows the money once, as a donation, never also as not a donation", () => {
    // give.public_statement after a correction: matched, the donor's name, no explanation kind.
    const corrected = row({ id: "in", direction: "in", amount: 300_000, matched: true, donor_name: "Cô Ba" })
    const html = renderToStaticMarkup(createElement(StatementPreview, { slug: "a", totals, rows: [corrected] }))
    expect(html).toContain("Cô Ba")
    expect(html).not.toContain("Không phải tiền ủng hộ")
    // Exactly what any matched donation of the same amount shows: one row, counted once.
    const donation = row({ id: "in", direction: "in", amount: 300_000, matched: true, donor_name: "Cô Ba" })
    expect(html).toBe(renderToStaticMarkup(createElement(StatementPreview, { slug: "a", totals, rows: [donation] })))
    // Even if a row still carried the superseded kind, a matched row reads as a donation only.
    const stale = renderToStaticMarkup(
      createElement(StatementPreview, {
        slug: "a",
        totals,
        rows: [{ ...corrected, in_explanation: "organizer_top_up", in_explained_at: "2026-11-02T00:00:00Z" }],
      })
    )
    expect(stale).toContain("Cô Ba")
    expect(stale).not.toContain("Không phải tiền ủng hộ")
    expect(stale).not.toContain("Người tổ chức nạp thêm tiền")
    expect(stale).toBe(html)
  })

  it("still labels an uncorrected explanation as not a donation, without donation green", () => {
    const html = renderToStaticMarkup(
      createElement(StatementPreview, {
        slug: "a",
        totals,
        rows: [row({ id: "in", direction: "in", amount: 450_000, in_explanation: "organizer_top_up" })],
      })
    )
    expect(html).toContain("Không phải tiền ủng hộ")
    expect(html).toContain("Người tổ chức nạp thêm tiền")
    expect(html).not.toContain('text-primary">+')
    expect(html).toContain(`text-fg">+${formatVnd(450_000)}`)
  })
})

describe("StatementPreview: summary blocks, row states, and refund badge tone (DOS/Give#260)", () => {
  it("renders PledgeTotals for back campaigns and omits the give-only other_in_amount note", () => {
    const backTotals: MoneyTotals = {
      ...totals,
      type: "back",
      goal_amount: 40_000_000,
      pledged_amount: 30_000_000,
      paid_amount: 12_000_000,
      other_in_amount: 2_000_000,
      refund_owed_amount: 500_000,
    }
    const html = renderToStaticMarkup(
      createElement(StatementPreview, { slug: "du-an-a", totals: backTotals, rows: [] })
    )

    expect(html).toContain('aria-label="Số liệu cam kết"')
    expect(html).toContain("Đã cam kết")
    expect(html).toContain("Đã thanh toán")
    expect(html).toContain(formatVnd(10_000_000))
    expect(html).toContain("Còn thiếu")
    expect(html).toContain(`Hoàn tiền còn nợ người ủng hộ:`)
    expect(html).toContain(formatVnd(500_000))
    expect(html).not.toContain("người tổ chức nạp thêm, ngân hàng hoàn phí hoặc trả lãi")
    expect(html).toContain("Chưa có giao dịch nào trong sao kê.")
  })

  it("renders other_in_amount and unexplained_out_count notices on give campaigns, and omits row lists when rows === null", () => {
    const giveTotals: MoneyTotals = {
      ...totals,
      other_in_amount: 250_000,
      unexplained_out_count: 2,
      unexplained_out_amount: 1_200_000,
    }
    const html = renderToStaticMarkup(
      createElement(StatementPreview, { slug: "be-an", totals: giveTotals, rows: null })
    )

    expect(html).toContain('aria-label="Số liệu sao kê"')
    expect(html).toContain(`Trong đó ${formatVnd(250_000)} không phải tiền ủng hộ`)
    expect(html).toContain(`2 khoản chi, tổng ${formatVnd(1_200_000)}, chưa được người tổ chức giải trình.`)
    expect(html).not.toContain("Chưa có giao dịch nào trong sao kê.")
    expect(html).not.toContain("<table")
    expect(html).not.toContain('aria-label="Giao dịch mới nhất"')
  })

  it("matches the statement page's info-toned 'Hoàn tiền' badge on explained refund rows and caps rows at PREVIEW_ROWS", () => {
    expect(PREVIEW_ROWS).toBe(5)

    const rows: StatementRow[] = [
      row({
        id: "refund-1",
        direction: "out",
        amount: 200_000,
        explained: true,
        is_refund: true,
        purpose: "Hoàn tiền chuyển thừa",
      }),
      ...Array.from({ length: 5 }, (_, i) =>
        row({
          id: `in-${i + 1}`,
          direction: "in",
          amount: (i + 1) * 100_000,
          matched: true,
          donor_name: `Người ${i + 1}`,
        })
      ),
    ]

    const html = renderToStaticMarkup(createElement(StatementPreview, { slug: "be-an", totals, rows }))

    // Badge tone="info" uses bg-surface text-fg, never neutral text-muted or "Đã giải trình".
    expect(html).toMatch(/<span class="[^"]*bg-surface text-fg[^"]*">Hoàn tiền<\/span>/)
    expect(html).not.toContain("Đã giải trình")
    expect(html).toContain("Hoàn tiền chuyển thừa")
    // Matched donations keep donation green, and row 6 ("Người 5") is truncated by PREVIEW_ROWS = 5.
    expect(html).toContain(`text-primary">+${formatVnd(100_000)}`)
    expect(html).toContain("Người 4")
    expect(html).not.toContain("Người 5")
  })
})
