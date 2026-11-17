import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  OWNER_MISMATCH_FOR_ORGANIZER,
  OWNER_MISMATCH_FOR_STAFF,
  type MatchCandidate,
  type ReturnCandidate,
  type UnmatchedTransaction,
} from "@/lib/reconciliation"

import { UnmatchedTransactionCard } from "./UnmatchedTransaction"

const tx: UnmatchedTransaction = {
  id: "11111111-1111-4111-8111-111111111111",
  campaign_id: "22222222-2222-4222-8222-222222222222",
  receiving_account_id: "33333333-3333-4333-8333-333333333333",
  provider_tx_id: "FT1",
  asset: "VND",
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

  it("links Give's contact address in the organizer's notice (DOS/Give#205)", () => {
    const html = render({ matchBlocked: OWNER_MISMATCH_FOR_ORGANIZER, explainAction: action })
    expect(html).toContain(
      'Hãy liên hệ đội ngũ Give qua email <a href="mailto:hi@give.vn" class="font-medium underline">hi@give.vn</a> để kiểm tra lại'
    )
  })

  it("groups candidates by net amount due after partial refunds (DOS/Give#93)", () => {
    const base: MatchCandidate = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      kind: "pledge",
      reference_code: "GVNET2345",
      intended_amount: 500_000,
      received_amount: 400_000,
      refunded_amount: 50_000,
      status: "partially_paid",
      public_name: "Lê Thị B",
      guest_name: null,
      is_anonymous: false,
      created_at: "2026-11-09T00:00:00Z",
    }
    const grossOnly: MatchCandidate = {
      ...base,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      reference_code: "GVGRS2345",
      received_amount: 350_000,
      refunded_amount: 50_000,
    }
    const html = render({ candidates: [grossOnly, base] })
    const exactGroup = /<optgroup label="Đang chờ đúng số tiền này">([\s\S]*?)<\/optgroup>/.exec(html)?.[1] ?? ""
    const otherGroup = /<optgroup label="Lượt ủng hộ khác">([\s\S]*?)<\/optgroup>/.exec(html)?.[1] ?? ""
    expect(exactGroup).toContain("GVNET2345")
    expect(exactGroup).not.toContain("GVGRS2345")
    expect(otherGroup).toContain("GVGRS2345")
  })
})

describe("UnmatchedTransactionCard: returned transfers (DOS/Give#72)", () => {
  const candidate: ReturnCandidate = {
    id: "44444444-4444-4444-8444-444444444444",
    campaign_id: tx.campaign_id,
    receiving_account_id: tx.receiving_account_id,
    asset: "VND",
    amount: 200_000,
    booked_at: "2026-11-08T03:00:00Z",
    booked_date_only: false,
    counterparty_account_masked: "****9999",
    is_refund: true,
    purpose: "Hoàn tiền vì dự án dừng",
    refund_reference_code: "GVAB12CD",
  }

  it("offers the link form with the candidates, a private reason and evidence", () => {
    const html = render({ explainAction: action, returnAction: action, returnCandidates: [candidate] })
    expect(html).toContain("Tiền chuyển đi bị ngân hàng trả lại? Ghi nhận khoản này")
    expect(html).toContain('name="original_transaction_id"')
    expect(html).toContain(`value="${candidate.id}"`)
    expect(html).toContain("Hoàn tiền GVAB12CD")
    expect(html).toContain('id="return-reason-11111111-1111-4111-8111-111111111111"')
    expect(html).toContain('name="evidence"')
    expect(html).toContain("Ghi nhận tiền bị trả lại</button>")
    // The explanation form now points to the link form instead of "báo quản trị viên".
    expect(html).toContain("ở mục &quot;Tiền chuyển đi bị ngân hàng trả lại?&quot; bên dưới")
    expect(html).not.toContain("báo quản trị viên")
  })

  it("words a bank fee as #195 books it: a refund's fee is spent, never refunded", () => {
    const html = render({ explainAction: action, returnAction: action, returnCandidates: [candidate] }).replace(
      /\s+/g,
      " "
    )
    expect(html).toContain("Với khoản chi, phần phí vẫn tính là đã chi.")
    expect(html).toContain(
      "Với khoản hoàn tiền, cả khoản hoàn không còn tính là đã hoàn (kể cả phí), phần phí tính vào tổng đã chi, và người tổ chức phải hoàn lại đủ cho người ủng hộ."
    )
    expect(html).not.toContain("đã chi hoặc đã hoàn")
  })

  it("says why no outgoing transaction fits, without a form", () => {
    const html = render({ returnAction: action, returnCandidates: [] })
    expect(html).toContain("Không có khoản chuyển đi nào phù hợp.")
    expect(html).toContain("nhắc người tổ chức giải trình trước")
    expect(html).not.toContain('name="original_transaction_id"')
  })

  it("is left out on the organizer page, which passes no returnAction", () => {
    const html = render({ returnCandidates: [candidate] })
    expect(html).not.toContain("bị ngân hàng trả lại")
  })
})

describe("UnmatchedTransactionCard: an explanation returned to unmatched (DOS/Give#196)", () => {
  const returnedExplanation = {
    kind: "organizer_top_up",
    reason: "Mai says it is her donation",
    returned_at: "2026-11-15T03:00:00Z",
  }

  it("says what it was and why it came back, and keeps only the match form", () => {
    const html = render({ explainAction: action, returnAction: action, returnedExplanation, showReturnReason: true })
    expect(html).toContain("Khoản này từng được giải trình nhầm và đã được đưa về chưa khớp.")
    expect(html).toContain("Người tổ chức nạp thêm tiền")
    expect(html).toContain("Lý do đưa về: Mai says it is her donation")
    expect(html).toContain("không giải trình lại được là &quot;không phải tiền ủng hộ&quot;")
    expect(html).toContain('name="contribution_id"')
    expect(html).toContain('name="reference_code"')
    // Neither explained again nor linked as a returned transfer: the database refuses both.
    expect(html).not.toContain("Giải trình khoản này")
    expect(html).not.toContain('name="kind"')
    expect(html).not.toContain("bị ngân hàng trả lại? Ghi nhận")
  })

  it("shows the organizer the note without the admin's private reason", () => {
    const html = render({ returnedExplanation })
    expect(html).toContain("đã được đưa về chưa khớp")
    expect(html).toContain("Người tổ chức nạp thêm tiền")
    expect(html).not.toContain("Lý do đưa về")
    expect(html).not.toContain("Mai says it is her donation")
    expect(html).toContain(">Khớp</button>")
  })

  it("adds nothing to money that was never explained", () => {
    expect(render({ explainAction: action })).not.toContain("đưa về chưa khớp")
  })
})
