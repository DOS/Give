import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type {
  InboundExplanation,
  MatchCandidate,
  ReturnedTransfer,
  UnattributedTransaction,
} from "@/lib/reconciliation"

import { InboundExplanationList, ReturnedTransferList, UnattributedList } from "./Reconciliation"

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

  it("shows the fee the bank kept: on a refund the organizer bears it (DOS/Give#195)", () => {
    const out = html([link])
    expect(out).toContain(
      "Ngân hàng giữ 10.000 ₫ phí: tính là phí ngân hàng (đã chi) của chiến dịch, không tính là đã hoàn. Người ủng hộ cần được hoàn đủ bằng một khoản chuyển mới; người tổ chức chịu phí."
    )
    const payment = html([{ ...link, original: { ...link.original!, is_refund: false } }])
    expect(payment).toContain("Ngân hàng giữ 10.000 ₫ phí: vẫn tính là đã chi.")
    // Returned in full, or the original unreadable: no fee line.
    expect(html([{ ...link, tx: { ...link.tx, amount: 200_000 } }])).not.toContain("phí")
    expect(html([{ ...link, original: null }])).not.toContain("phí")
  })

  it("has an empty state", () => {
    expect(html([])).toContain("Chưa có khoản tiền nào được ghi nhận là bị ngân hàng trả lại.")
  })
})

describe("InboundExplanationList: correcting an explanation (DOS/Give#71)", () => {
  const explanation = (id: string, extra: Partial<InboundExplanation> = {}): InboundExplanation => ({
    bank_transaction_id: id,
    kind: "organizer_top_up",
    reason: "Organizer said it was a top-up",
    evidence: "Message of 2026-11-02",
    explained_at: "2026-11-02T03:00:00Z",
    tx: { amount: 300_000, booked_at: "2026-10-30T03:00:00Z", campaign_id: "c" },
    correction: null,
    returned: null,
    binding_released: false,
    ...extra,
  })
  const candidate: MatchCandidate = {
    id: "44444444-4444-4444-8444-444444444444",
    kind: "donation",
    reference_code: "GV7K2M9QX",
    intended_amount: 300_000,
    received_amount: 0,
    refunded_amount: 0,
    status: "awaiting_transfer",
    public_name: "Cô Ba",
    guest_name: null,
    is_anonymous: false,
    created_at: "2026-10-29T00:00:00Z",
    contributor_user_id: null,
  }
  const action = async () => null
  const render = (
    explanations: InboundExplanation[],
    corrections?: Parameters<typeof InboundExplanationList>[0]["corrections"],
    returns?: Parameters<typeof InboundExplanationList>[0]["returns"]
  ) => renderToStaticMarkup(createElement(InboundExplanationList, { explanations, corrections, returns }))

  it("offers the correction form with a required contribution and reason", () => {
    const html = render([explanation("t1")], new Map([["t1", { action, candidates: [candidate] }]]))
    expect(html).toContain("Giải trình nhầm? Sửa giải trình")
    expect(html).toContain('name="contribution_id"')
    expect(html).toContain('name="reference_code"')
    expect(html).toContain("Đang chờ đúng số tiền này")
    expect(html).toContain("GV7K2M9QX")
    expect(html).toMatch(/<textarea[^>]*name="reason"[^>]*required/)
    expect(html).toContain('maxLength="1000"')
    expect(html).toContain(">Sửa giải trình</button>")
  })

  it("offers nothing without an entry (finance staff) and says why when self-review blocks it", () => {
    expect(render([explanation("t1")])).not.toContain("Sửa giải trình")
    const blocked = "Bạn là người đã giải trình khoản này, nên không tự sửa được. Nhờ một quản trị viên khác."
    const html = render([explanation("t1")], new Map([["t1", { blocked }]]))
    expect(html).toContain(blocked)
    expect(html).not.toContain('name="contribution_id"')
  })

  it("shows a corrected explanation with its correction and no form", () => {
    const html = render(
      [
        explanation("t1", {
          correction: {
            contribution_id: candidate.id,
            reason: "Donor sent the bank receipt",
            corrected_at: "2026-11-15T03:00:00Z",
            contribution: { reference_code: "GV7K2M9QX" },
          },
        }),
      ],
      new Map([["t1", { action, candidates: [candidate] }]])
    )
    expect(html).toContain("Giải trình này đã được sửa.")
    expect(html).toContain("GV7K2M9QX")
    expect(html).toContain("Lý do sửa: Donor sent the bank receipt")
    expect(html).not.toContain('name="contribution_id"')
  })

  it("keeps the code field when the list has no contribution to offer", () => {
    const html = render([explanation("t1")], new Map([["t1", { action, candidates: [] }]]))
    expect(html).toContain("Không có lượt nào trong danh sách")
    expect(html).toContain('name="reference_code"')
    expect(html).toContain('name="reason"')
    expect(html).toContain("Lượt cũ hơn thì nhập mã ủng hộ.")
  })
})

describe("InboundExplanationList: returning an explanation to unmatched (DOS/Give#196)", () => {
  const explanation = (extra: Partial<InboundExplanation> = {}): InboundExplanation => ({
    bank_transaction_id: "t1",
    kind: "organizer_top_up",
    reason: "Organizer said it was a top-up",
    evidence: "Message of 2026-11-02",
    explained_at: "2026-11-02T03:00:00Z",
    tx: { amount: 300_000, booked_at: "2026-10-30T03:00:00Z", campaign_id: "c" },
    correction: null,
    returned: null,
    binding_released: false,
    ...extra,
  })
  const action = async () => null
  const render = (
    explanations: InboundExplanation[],
    returns?: Parameters<typeof InboundExplanationList>[0]["returns"],
    corrections?: Parameters<typeof InboundExplanationList>[0]["corrections"]
  ) =>
    renderToStaticMarkup(createElement(InboundExplanationList, { explanations, corrections, returns })).replace(
      /\s+/g,
      " "
    )

  it("offers 'Đưa về chưa khớp' with a required reason and says it is never explained again", () => {
    const html = render([explanation()], new Map([["t1", { action }]]))
    expect(html).toContain("Đưa về chưa khớp")
    expect(html).toMatch(/<textarea[^>]*id="return-unmatched-reason-t1"[^>]*required/)
    expect(html).toContain('maxLength="1000"')
    expect(html).toContain("khớp được với một lượt ủng hộ của chiến dịch")
    expect(html).toContain("không giải trình lại được là &quot;không phải tiền ủng hộ&quot;")
    expect(html).toContain("Mỗi giao dịch chỉ đưa về được một lần.")
    expect(html).toContain(">Đưa về chưa khớp</button>")
  })

  it("offers nothing without an entry (finance staff) and says why when it is blocked", () => {
    expect(render([explanation()])).not.toContain("Đưa về chưa khớp")
    const blocked = "Bạn là người tổ chức chiến dịch này, nên không đưa được khoản này về chưa khớp."
    const html = render([explanation()], new Map([["t1", { blocked }]]))
    expect(html).toContain(blocked)
    expect(html).not.toContain("return-unmatched-reason")
  })

  it("shows a returned explanation with its return, and neither form", () => {
    const html = render(
      [explanation({ returned: { reason: "Mai says it is hers", returned_at: "2026-11-15T03:00:00Z" } })],
      new Map([["t1", { action }]]),
      new Map([["t1", { action, candidates: [] }]])
    )
    expect(html).toContain("Giải trình này đã được đưa về chưa khớp.")
    expect(html).toContain("Lý do đưa về: Mai says it is hers")
    expect(html).toContain("line-through")
    expect(html).not.toContain("return-unmatched-reason")
    expect(html).not.toContain("Sửa giải trình")
  })

  it("offers no return on a corrected explanation", () => {
    const html = render(
      [
        explanation({
          correction: { contribution_id: "c", reason: "r", corrected_at: "2026-11-15T03:00:00Z", contribution: null },
        }),
      ],
      new Map([["t1", { action }]])
    )
    expect(html).not.toContain("return-unmatched-reason")
  })
})
