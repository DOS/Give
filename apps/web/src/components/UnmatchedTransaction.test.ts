import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { OWNER_MISMATCH_FOR_STAFF, type UnmatchedTransaction } from "@/lib/reconciliation"

import { UnmatchedTransactionCard } from "./UnmatchedTransaction"

const tx: UnmatchedTransaction = {
  id: "11111111-1111-4111-8111-111111111111",
  campaign_id: "22222222-2222-4222-8222-222222222222",
  receiving_account_id: "33333333-3333-4333-8333-333333333333",
  provider_tx_id: "FT1",
  amount: 150_000,
  booked_at: "2026-11-10T03:00:00Z",
  booked_date_only: false,
  description: "UNG HO",
  counterparty_name: "NGUYEN VAN A",
  counterparty_account_masked: "****1234",
  source: "statement_import",
  after_close: false,
}

const action = async () => null

function render(props: Partial<Parameters<typeof UnmatchedTransactionCard>[0]>) {
  return renderToStaticMarkup(createElement(UnmatchedTransactionCard, { tx, candidates: [], action, ...props }))
}

describe("UnmatchedTransactionCard (DOS/Give#148)", () => {
  it("shows the match form when a match can succeed", () => {
    const html = render({})
    expect(html).toContain('name="contribution_id"')
    expect(html).toContain(">Khớp</button>")
  })

  it("shows the notice instead of the match form when the account's owner is not the organizer", () => {
    const html = render({ matchBlocked: OWNER_MISMATCH_FOR_STAFF, explainAction: action })
    expect(html).toContain(OWNER_MISMATCH_FOR_STAFF)
    expect(html).not.toContain('name="contribution_id"')
    expect(html).not.toContain('name="reference_code"')
    // The explanation form stays: whether it should refuse too is DOS/Give#137.
    expect(html).toContain("Không phải tiền ủng hộ? Giải trình khoản này")
    expect(html).toContain('name="kind"')
  })
})
