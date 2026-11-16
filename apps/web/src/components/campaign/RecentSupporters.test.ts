import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { formatDate, formatVnd } from "@/lib/format"
import type { StatementRow } from "@/lib/statement"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { RECENT_SUPPORTERS, RecentSupporters } = await import("./RecentSupporters")

const row = (overrides: Partial<StatementRow> = {}): StatementRow => ({
  id: "tx-1",
  direction: "in",
  asset: "VND",
  amount: 200_000,
  booked_at: "2026-11-15T03:00:00Z",
  booked_date_only: false,
  after_close: false,
  matched: true,
  counterparty_account_masked: null,
  explained: null,
  purpose: null,
  category: null,
  recipient: null,
  is_refund: null,
  explained_at: null,
  donor_name: "Chị Lan",
  donor_anonymous: false,
  in_explanation: null,
  in_explained_at: null,
  own_transfer_id: null,
  own_transfer_at: null,
  own_transfer_label: null,
  return_of: null,
  returned_by: null,
  returned_at: null,
  return_bank_fee: null,
  ...overrides,
})

describe("RecentSupporters", () => {
  it("returns null when rows are empty or contain no matched incoming donations", () => {
    expect(RecentSupporters({ slug: "be-an", rows: [], count: 0 })).toBeNull()

    const nonDonations: StatementRow[] = [
      row({ id: "out-1", direction: "out", matched: true, donor_name: "Nhà cung cấp" }),
      row({ id: "unmatched-in", direction: "in", matched: false, donor_name: "Anh Nam" }),
      row({ id: "explained-in", direction: "in", matched: false, in_explanation: "organizer_top_up" }),
      row({ id: "returned-in", direction: "in", matched: false, return_of: "out-1" }),
    ]
    expect(RecentSupporters({ slug: "be-an", rows: nonDonations, count: 5 })).toBeNull()
  })

  it("filters to direction === 'in' && row.matched and caps at RECENT_SUPPORTERS = 4", () => {
    expect(RECENT_SUPPORTERS).toBe(4)

    const rows: StatementRow[] = [
      row({ id: "out-1", direction: "out", matched: true, donor_name: "Khoản chi" }),
      row({ id: "in-unmatched", direction: "in", matched: false, donor_name: "Chưa khớp" }),
      row({ id: "in-1", donor_name: "Người 1", amount: 100_000, booked_at: "2026-11-15T08:00:00Z" }),
      row({ id: "in-2", donor_name: "Người 2", amount: 250_000, booked_at: "2026-11-14T08:00:00Z" }),
      row({ id: "in-3", donor_name: "Người 3", amount: 300_000, booked_at: "2026-11-13T08:00:00Z" }),
      row({ id: "in-4", donor_name: "Người 4", amount: 450_000, booked_at: "2026-11-12T08:00:00Z" }),
      row({ id: "in-5", donor_name: "Người 5", amount: 500_000, booked_at: "2026-11-11T08:00:00Z" }),
    ]

    const html = renderToStaticMarkup(createElement(RecentSupporters, { slug: "be-an", rows, count: 12 }))
    expect(html.match(/<li\b/g)).toHaveLength(4)
    expect(html).toContain("Người 1")
    expect(html).toContain("Người 2")
    expect(html).toContain("Người 3")
    expect(html).toContain("Người 4")
    expect(html).not.toContain("Người 5")
    expect(html).not.toContain("Khoản chi")
    expect(html).not.toContain("Chưa khớp")
    expect(html).toContain(formatVnd(100_000))
    expect(html).toContain(formatDate("2026-11-15T08:00:00Z"))
    expect(html).toContain('href="/campaigns/be-an/statement?filter=in"')
    expect(html).toContain("Xem tất cả 12 người ủng hộ")
  })

  it("renders counterpartyLabel so anonymous donors and bank account-holder names never leak", () => {
    const withExtraneousBankName = Object.assign(
      row({ id: "in-anon", donor_name: "NGUYEN VAN BI MAT", donor_anonymous: true }),
      { counterparty_name: "LE THI TAI KHOAN NGAN HANG" }
    )
    const unnamed = row({ id: "in-unnamed", donor_name: null, donor_anonymous: false })
    const named = row({ id: "in-named", donor_name: "Cô Tư", donor_anonymous: false })

    const html = renderToStaticMarkup(
      createElement(RecentSupporters, {
        slug: "be-an",
        rows: [withExtraneousBankName, unnamed, named],
        count: 0,
      })
    )

    expect(html).toContain("Ẩn danh")
    expect(html).toContain("Người ủng hộ")
    expect(html).toContain("Cô Tư")
    expect(html).not.toContain("NGUYEN VAN BI MAT")
    expect(html).not.toContain("LE THI TAI KHOAN NGAN HANG")
    expect(html).toContain("Xem tất cả lượt ủng hộ")
  })
})
