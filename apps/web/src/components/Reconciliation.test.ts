import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { ReturnedTransfer, UnattributedTransaction } from "@/lib/reconciliation"

import { ReturnedTransferList, UnattributedList } from "./Reconciliation"

const ACCOUNT = "33333333-3333-4333-8333-333333333333"

const tx = (id: string, extra: Partial<UnattributedTransaction> = {}): UnattributedTransaction => ({
  id,
  receiving_account_id: ACCOUNT,
  provider_tx_id: `FT-${id}`,
  amount: 250_000,
  booked_at: "2026-11-10T03:00:00Z",
  booked_date_only: false,
  description: "CHUYEN TIEN",
  counterparty_name: "TRAN THI B",
  counterparty_account_masked: "****9876",
  source: "statement_import",
  ...extra,
})

function render(transactions: UnattributedTransaction[], total: number) {
  return renderToStaticMarkup(
    createElement(UnattributedList, { transactions, total, accounts: new Map([[ACCOUNT, "VCB · ****6789 · A"]]) })
  )
}

describe("UnattributedList (DOS/Give#148)", () => {
  it("lists each transaction read only: amount, account, sender, note and source", () => {
    const html = render(
      [tx("a"), tx("b", { receiving_account_id: "other", counterparty_name: null, description: null })],
      2
    )
    expect(html).toContain("VCB · ****6789 · A")
    expect(html).toContain("Tài khoản nhận")
    expect(html).toContain("TRAN THI B")
    expect(html).toContain("CHUYEN TIEN")
    expect(html).toContain("nguồn: sao kê tải lên")
    expect(html).toContain("FT-a")
    // A missing note is a plain dash, not set in the machine-id face.
    expect(html).toMatch(/Nội dung chuyển khoản: (<!-- -->)?—/)
    expect(html).not.toMatch(/<form|<button/)
    expect(html).not.toContain("Đang hiện")
  })

  it("says so when the list is cut at the newest ones", () => {
    expect(render([tx("a")], 140)).toContain("Đang hiện 1 khoản mới nhất trong tổng số 140 khoản.")
  })
})

describe("ReturnedTransferList (DOS/Give#72)", () => {
  const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
  const link: ReturnedTransfer = {
    bank_transaction_id: "i1",
    original_transaction_id: "o1",
    reason: "Sai số tài khoản người nhận",
    evidence: "Thông báo của ngân hàng ngày 10/11",
    linked_at: "2026-11-12T03:00:00Z",
    tx: { amount: 190_000, booked_at: "2026-11-10T03:00:00Z", campaign_id: CAMPAIGN },
    original: { amount: 200_000, booked_at: "2026-11-08T03:00:00Z", is_refund: true },
  }
  const html = (returns: ReturnedTransfer[]) =>
    renderToStaticMarkup(
      createElement(ReturnedTransferList, { returns, titles: new Map([[CAMPAIGN, "Đèn cho bản"]]) })
    ).replace(/\u00a0/g, " ")

  it("lists each link with both amounts, the campaign and the private reason and evidence", () => {
    const out = html([link, { ...link, bank_transaction_id: "i2", original: null }])
    expect(out).toContain("Tiền bị trả lại đã ghi nhận gần đây (2)")
    expect(out).toContain("+190.000 ₫</span> trả lại khoản hoàn tiền")
    expect(out).toContain("−200.000 ₫</span> ngày 08/11/2026")
    expect(out).toContain("Đèn cho bản")
    expect(out).toContain("Lý do: Sai số tài khoản người nhận")
    expect(out).toContain("Bằng chứng: Thông báo của ngân hàng ngày 10/11")
    // An original the reader cannot read still lists the link.
    expect(out).toContain("trả lại khoản chi")
  })

  it("has an empty state", () => {
    expect(html([])).toContain("Chưa có khoản tiền nào được ghi nhận là bị ngân hàng trả lại.")
  })
})
