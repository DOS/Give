import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { UnattributedTransaction } from "@/lib/reconciliation"

import { UnattributedList } from "./Reconciliation"

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
    const html = render([tx("a"), tx("b", { receiving_account_id: "other", counterparty_name: null })], 2)
    expect(html).toContain("VCB · ****6789 · A")
    expect(html).toContain("Tài khoản nhận")
    expect(html).toContain("TRAN THI B")
    expect(html).toContain("CHUYEN TIEN")
    expect(html).toContain("sao kê tải lên")
    expect(html).not.toMatch(/<form|<button/)
    expect(html).not.toContain("Đang hiện")
  })

  it("says so when the list is cut at the newest ones", () => {
    expect(render([tx("a")], 140)).toContain("Đang hiện 1 khoản mới nhất trong tổng số 140 khoản.")
  })
})
