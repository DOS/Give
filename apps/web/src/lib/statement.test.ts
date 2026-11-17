import { describe, expect, it } from "vitest"

import { formatVnd } from "@/lib/format"
import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  counterpartyLabel,
  explainedNotDonation,
  evidenceCampaignId,
  evidencePath,
  evidenceUrl,
  explainedOutAmount,
  explainSchema,
  explanationOverdue,
  getMoneyTotals,
  getOutgoing,
  listMoneyTotals,
  listExplainedOutgoing,
  listPublicEvidence,
  getRefundable,
  listRefundable,
  listStatement,
  listStatementPairs,
  listUnexplainedOutgoing,
  parseEvidencePath,
  parseStatementParams,
  publicEvidenceUrl,
  raisedAmount,
  refundOptionLabel,
  remainingAmount,
  reportSchema,
  RETURNED_IN_LABEL,
  returnBankFee,
  returnedOutgoingText,
  returnedTransferText,
  returnedUnexplainedText,
  STATEMENT_PAGE_SIZE,
  statementHref,
  type MoneyTotals,
} from "./statement"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TX = "33333333-3333-4333-8333-333333333333"
const OBJECT = "44444444-4444-4444-8444-444444444444"
const CONTRIBUTION = "55555555-5555-4555-8555-555555555555"
const ORGANIZER = "77777777-7777-4777-8777-777777777777"
/** The organizer viewing the disbursements page; their auth email differs from their guest email in case and spaces. */
const ORGANIZER_VIEWER = { id: ORGANIZER, email: "Toc.Chuc@Example.vn" }

/** A give.public_campaigns row as PostgREST returns it (bigint sums may be strings). */
const viewRow = {
  id: CAMPAIGN,
  type: "give",
  asset: "VND",
  goal_amount: 50_000_000,
  pledged_amount: 0,
  paid_amount: "1500000",
  disbursable_amount: "1500000",
  disbursed_amount: 700_000,
  refunded_amount: 100_000,
  unexplained_out_amount: 200_000,
  unexplained_out_count: 1,
  supporters_count: 3,
  other_in_amount: "250000",
  refund_owed_amount: "40000",
  backers_count: 2,
  own_transfer_amount: "3000000",
}

function selected(call: Call | undefined): string {
  return String(op(call, "select")?.[0] ?? "")
}

describe("money totals", () => {
  it("reads give.public_campaigns with an explicit column list and converts the sums", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: viewRow }), calls)
    const totals = await getMoneyTotals(db as never, CAMPAIGN)

    expect(calls[0].target).toBe("public_campaigns")
    expect(selected(calls[0])).not.toContain("*")
    expect(op(calls[0], "eq")).toEqual(["id", CAMPAIGN])
    expect(totals).toEqual({
      campaign_id: CAMPAIGN,
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
      other_in_amount: 250_000,
      refund_owed_amount: 40_000,
      backers_count: 2,
      payments_stopped_at: null,
      payments_stopped_note: null,
      own_transfer_amount: 3_000_000,
    })
    // paid/disbursed come from the view as they are: it already leaves an own-account transfer out of both (DOS/Give#84).
    expect(selected(calls[0])).toContain("own_transfer_amount")
  })

  it("returns null for a campaign the view does not show", async () => {
    expect(await getMoneyTotals(fakeDb(() => ({ data: null })) as never, CAMPAIGN)).toBeNull()
  })

  it("throws database errors", async () => {
    const db = fakeDb(() => ({ error: { code: "42501", message: "denied" } }))
    await expect(getMoneyTotals(db as never, CAMPAIGN)).rejects.toMatchObject({ code: "42501" })
  })

  it("loads totals of several campaigns in one query, and none for no campaigns", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [viewRow] }), calls)
    const totals = await listMoneyTotals(db as never, [CAMPAIGN])
    expect(op(calls[0], "in")).toEqual(["id", [CAMPAIGN]])
    expect(totals.get(CAMPAIGN)?.paid_amount).toBe(1_500_000)

    expect((await listMoneyTotals(db as never, [])).size).toBe(0)
    expect(calls).toHaveLength(1)
  })

  it("asks for 100 ids at a time, so the URL stays short for a long discovery page", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `6a7e0000-0000-4000-8000-${String(i).padStart(12, "0")}`)
    const calls: Call[] = []
    const db = fakeDb((call) => ({ data: (op(call, "in")?.[1] as string[]).map((id) => ({ ...viewRow, id })) }), calls)
    const totals = await listMoneyTotals(db as never, ids)
    expect(calls.map((c) => (op(c, "in")?.[1] as string[]).length)).toEqual([100, 100, 50])
    expect(totals.size).toBe(250)
  })

  it("headlines paid money for give and pledged money for back", () => {
    const totals = { paid_amount: 10, pledged_amount: 99, other_in_amount: 0 } as MoneyTotals
    expect(raisedAmount(totals, "give")).toBe(10)
    expect(raisedAmount(totals, "back")).toBe(99)
    expect(raisedAmount(null, "give")).toBe(0)
  })

  it("leaves money explained as not a donation out of the raised amount (DOS/Give#49)", () => {
    const totals = { paid_amount: 1_500_000, pledged_amount: 0, other_in_amount: 500_000 } as MoneyTotals
    expect(raisedAmount(totals, "give")).toBe(1_000_000)
    expect(raisedAmount({ ...totals, other_in_amount: 2_000_000 }, "give")).toBe(0)
  })

  it("splits disbursed money into explained and unexplained", () => {
    expect(explainedOutAmount({ disbursed_amount: 700, unexplained_out_amount: 200 } as MoneyTotals)).toBe(500)
    expect(explainedOutAmount({ disbursed_amount: 0, unexplained_out_amount: 0 } as MoneyTotals)).toBe(0)
  })

  it("computes what remains: paid in minus spent minus refunded, never negative", () => {
    const t = (paid: number, disbursed: number, refunded: number) =>
      ({ paid_amount: paid, disbursed_amount: disbursed, refunded_amount: refunded }) as MoneyTotals
    expect(remainingAmount(t(1_500_000, 700_000, 100_000))).toBe(700_000)
    expect(remainingAmount(t(100, 150, 0))).toBe(0)
  })
})

describe("public statement", () => {
  it("reads give.public_statement only, newest first, one page at a time", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [{ id: TX, amount: "500000", direction: "in" }], count: 120 }), calls)
    const { rows, total } = await listStatement(db as never, CAMPAIGN, "all", 3)

    expect(calls[0].target).toBe("public_statement")
    const columns = selected(calls[0])
    expect(columns).not.toContain("*")
    // Fields the view never exposes must not be asked for either.
    for (const hidden of ["description", "raw", "reference_code", "guest", "email", "provider_tx_id"]) {
      expect(columns).not.toContain(hidden)
    }
    expect(op(calls[0], "select")?.[1]).toEqual({ count: "exact", head: false })
    expect(op(calls[0], "range")).toEqual([2 * STATEMENT_PAGE_SIZE, 3 * STATEMENT_PAGE_SIZE - 1])
    expect(op(calls[0], "order")).toEqual(["booked_at", { ascending: false }])
    expect(rows[0].amount).toBe(500_000)
    expect(total).toBe(120)
  })

  it("returns no rows and the real total for a page past the end", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      (call) =>
        op(call, "range") ? { error: { code: "PGRST103", message: "Requested range not satisfiable" } } : { count: 7 },
      calls
    )
    expect(await listStatement(db as never, CAMPAIGN, "unexplained", 3)).toEqual({ rows: [], total: 7 })
    expect(op(calls[1], "select")).toEqual(["id", { count: "exact", head: true }])
    expect(calls[1].ops).toContainEqual(["eq", "explained", false])
  })

  it("filters by direction and by unexplained outgoing rows", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [] }), calls)
    await listStatement(db as never, CAMPAIGN, "in")
    await listStatement(db as never, CAMPAIGN, "unexplained")
    const eqs = (call: Call) => call.ops.filter(([name]) => name === "eq").map((o) => o.slice(1))
    expect(eqs(calls[0])).toEqual([
      ["campaign_id", CAMPAIGN],
      ["direction", "in"],
    ])
    expect(eqs(calls[1])).toEqual([
      ["campaign_id", CAMPAIGN],
      ["direction", "out"],
      ["explained", false],
    ])
  })

  it("parses filter and page from the query string, falling back to safe defaults", () => {
    expect(parseStatementParams({ filter: "out", page: "2" })).toEqual({ filter: "out", page: 2 })
    expect(parseStatementParams({ filter: "evil", page: "-1" })).toEqual({ filter: "all", page: 1 })
    expect(parseStatementParams({ filter: ["in", "out"], page: "1.5" })).toEqual({ filter: "in", page: 1 })
    expect(parseStatementParams({ page: "100000" })).toEqual({ filter: "all", page: 1 })
  })

  it("builds statement links", () => {
    expect(statementHref("quy-a", "all")).toBe("/campaigns/quy-a/statement")
    expect(statementHref("quy-a", "unexplained", 2)).toBe("/campaigns/quy-a/statement?filter=unexplained&page=2")
  })

  it("labels money in by the donor's chosen name or Ẩn danh, never a bank name", () => {
    const row = { direction: "in" as const, recipient: null, explained: null }
    expect(counterpartyLabel({ ...row, matched: true, donor_name: "Cô Ba", donor_anonymous: false })).toBe("Cô Ba")
    expect(counterpartyLabel({ ...row, matched: true, donor_name: null, donor_anonymous: true })).toBe("Ẩn danh")
    // Even if a name ever came back for an anonymous donor, it is not shown.
    expect(counterpartyLabel({ ...row, matched: true, donor_name: "Leak", donor_anonymous: true })).toBe("Ẩn danh")
    expect(counterpartyLabel({ ...row, matched: true, donor_name: null, donor_anonymous: false })).toBe("Người ủng hộ")
    expect(counterpartyLabel({ ...row, matched: false, donor_name: null, donor_anonymous: null })).toBe(
      "Chưa khớp với lượt ủng hộ nào"
    )
  })

  it("labels money in that is not a donation by its kind only (DOS/Give#49)", () => {
    const row = { direction: "in" as const, recipient: null, explained: null, matched: false }
    const unnamed = { donor_name: null, donor_anonymous: null }
    expect(counterpartyLabel({ ...row, ...unnamed, in_explanation: "organizer_top_up" })).toBe(
      "Người tổ chức nạp thêm tiền"
    )
    expect(counterpartyLabel({ ...row, ...unnamed, in_explanation: "interest" })).toBe("Lãi ngân hàng")
    // A kind added later still reads as "not a donation", never as a raw code.
    expect(counterpartyLabel({ ...row, ...unnamed, in_explanation: "grant" })).toBe(
      "Khoản khác, không phải tiền ủng hộ"
    )
    expect(counterpartyLabel({ ...row, ...unnamed, in_explanation: null })).toBe("Chưa khớp với lượt ủng hộ nào")
  })

  it("shows a corrected explanation as the donation it is, not as money that is not a donation (DOS/Give#71)", () => {
    const row = { direction: "in" as const, recipient: null, explained: null }
    // give.public_statement after a correction: matched, the donor's name, in_explanation NULL.
    const corrected = { ...row, matched: true, donor_name: "Cô Ba", donor_anonymous: false, in_explanation: null }
    expect(counterpartyLabel(corrected)).toBe("Cô Ba")
    expect(explainedNotDonation(corrected)).toBe(false)
    // A matched row never reads as "not a donation", even with a superseded kind still present.
    const stale = { ...corrected, in_explanation: "organizer_top_up" }
    expect(counterpartyLabel(stale)).toBe("Cô Ba")
    expect(explainedNotDonation(stale)).toBe(false)
    // An uncorrected explanation still does; an outgoing row never does.
    expect(explainedNotDonation({ ...row, matched: false, in_explanation: "interest" })).toBe(true)
    expect(explainedNotDonation({ ...row, direction: "out", matched: false, in_explanation: "interest" })).toBe(false)
  })

  it("labels money a bank returned from a transfer out, never by the sender (DOS/Give#72)", () => {
    const row = { direction: "in" as const, recipient: null, explained: null, matched: false }
    const unnamed = { donor_name: null, donor_anonymous: null }
    expect(counterpartyLabel({ ...row, ...unnamed, return_of: "o1" })).toBe(RETURNED_IN_LABEL)
    expect(RETURNED_IN_LABEL).toBe("Ngân hàng trả lại tiền chuyển đi")
    // The outgoing row keeps its explained recipient.
    expect(
      counterpartyLabel({
        ...unnamed,
        direction: "out",
        matched: false,
        recipient: "Nhà sách B",
        explained: true,
        return_of: null,
      })
    ).toBe("Nhà sách B")
  })

  it("reads the other row of each returned transfer on the page from the public view", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          {
            id: "o1",
            direction: "out",
            is_refund: true,
            amount: "200000",
            booked_at: "2026-11-08T03:00:00Z",
          },
          {
            id: "i2",
            direction: "in",
            is_refund: null,
            amount: 50000,
            booked_at: "2026-11-09T00:00:00Z",
          },
        ],
      }),
      calls
    )
    const pairs = await listStatementPairs(db as never, CAMPAIGN, [
      { id: "i1", return_of: "o1", returned_by: null },
      { id: "o2", return_of: null, returned_by: "i2" },
      { id: "x", return_of: null, returned_by: null },
      // Its pair could not be read (not returned by the view): no entry.
      { id: "i3", return_of: "o3", returned_by: null },
    ])
    expect(pairs.get("i1")).toEqual({
      id: "o1",
      direction: "out",
      is_refund: true,
      amount: 200_000,
      booked_at: "2026-11-08T03:00:00Z",
    })
    expect(pairs.get("o2")?.amount).toBe(50_000)
    expect(pairs.has("x")).toBe(false)
    expect(pairs.has("i3")).toBe(false)
    expect(calls[0].target).toBe("public_statement")
    expect(op(calls[0], "select")).toEqual(["id, direction, is_refund, amount, booked_at"])
    expect(calls[0].ops).toEqual(
      expect.arrayContaining([
        ["eq", "campaign_id", CAMPAIGN],
        ["in", "id", ["o1", "i2", "o3"]],
      ])
    )
  })

  it("does not read pairs for a page without returned transfers", async () => {
    const calls: Call[] = []
    const pairs = await listStatementPairs(fakeDb(() => ({ data: [] }), calls) as never, CAMPAIGN, [
      { id: "x", return_of: null, returned_by: null },
    ])
    expect(pairs.size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it("labels money out by the explained recipient only", () => {
    const row = { direction: "out" as const, matched: false, donor_name: null, donor_anonymous: null }
    expect(counterpartyLabel({ ...row, recipient: "Nhà sách B", explained: true })).toBe("Nhà sách B")
    expect(counterpartyLabel({ ...row, recipient: null, explained: true })).toBe("Không công khai")
    expect(counterpartyLabel({ ...row, recipient: null, explained: false })).toBe("Chưa rõ người nhận")
  })

  it("labels both legs of a transfer between the campaign's own accounts by the public label only (DOS/Give#84)", () => {
    const base = { matched: false, donor_name: null, donor_anonymous: null, recipient: null }
    const label = "Chuyển sang tài khoản mới"
    // The paired outgoing leg counts as explained but has no recipient: it is not "Không công khai".
    expect(counterpartyLabel({ ...base, direction: "out", explained: true, own_transfer_label: label })).toBe(label)
    expect(counterpartyLabel({ ...base, direction: "in", explained: null, own_transfer_label: label })).toBe(label)
    expect(counterpartyLabel({ ...base, direction: "in", explained: null, own_transfer_label: null })).toBe(
      "Chưa khớp với lượt ủng hộ nào"
    )
  })

  it("reads the own-transfer columns, never finance's reason (DOS/Give#84)", async () => {
    const calls: Call[] = []
    await listStatement(fakeDb(() => ({ data: [] }), calls) as never, CAMPAIGN)
    const columns = selected(calls[0])
      .split(",")
      .map((c) => c.trim())
    expect(columns).toEqual(expect.arrayContaining(["own_transfer_id", "own_transfer_at", "own_transfer_label"]))
    expect(columns.join(",")).not.toMatch(/reason|marked_by/)
  })

  it("never asks the view for the bank account-holder name", async () => {
    const calls: Call[] = []
    await listStatement(fakeDb(() => ({ data: [] }), calls) as never, CAMPAIGN)
    const columns = selected(calls[0])
      .split(",")
      .map((c) => c.trim())
    expect(columns).not.toContain("counterparty_name")
    expect(columns).toEqual(expect.arrayContaining(["donor_name", "donor_anonymous", "counterparty_account_masked"]))
    // An explanation of money in shows its kind and time; its reason and evidence are not in the view.
    expect(columns).toEqual(expect.arrayContaining(["in_explanation", "in_explained_at"]))
    // A returned transfer shows its pair and when it was recorded, never why (DOS/Give#72).
    expect(columns).toEqual(expect.arrayContaining(["return_of", "returned_by", "returned_at"]))
    expect(columns.join(",")).not.toMatch(/reason|evidence/)
  })
})

describe("bank fee on a returned transfer (DOS/Give#195)", () => {
  const vnd = (text: string) => text.replace(/\u00a0/g, " ")
  // A 300k refund the bank sent back as 289k: the view puts the 11k fee on BOTH rows.
  const outRow = {
    id: "o1",
    direction: "out" as const,
    amount: 300_000,
    is_refund: true,
    return_of: null,
    returned_by: "i1",
    return_bank_fee: 11_000,
  }
  const inRow = {
    id: "i1",
    direction: "in" as const,
    amount: 289_000,
    is_refund: null,
    return_of: "o1",
    returned_by: null,
    return_bank_fee: 11_000,
  }
  const outPair = {
    id: "o1",
    direction: "out" as const,
    is_refund: true,
    amount: 300_000,
    booked_at: "2026-11-08T03:00:00Z",
  }
  const inPair = {
    id: "i1",
    direction: "in" as const,
    is_refund: null,
    amount: 289_000,
    booked_at: "2026-11-10T03:00:00Z",
  }

  it("reads return_bank_fee with the statement and turns it into a number", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          { ...inRow, return_bank_fee: "11000" },
          { id: "x", amount: 1, return_bank_fee: null },
        ],
        count: 2,
      }),
      calls
    )
    const { rows } = await listStatement(db as never, CAMPAIGN)
    expect(selected(calls[0])).toContain("return_bank_fee")
    expect(rows[0].return_bank_fee).toBe(11_000)
    expect(rows[1].return_bank_fee).toBeNull()
  })

  it("takes the fee once per pair: the same 11k on each row, never 22k", () => {
    expect(returnBankFee(inRow, null)).toBe(11_000)
    expect(returnBankFee(outRow, null)).toBe(11_000)
    const notes = [returnedTransferText(inRow, outPair), returnedTransferText(outRow, inPair)].map(vnd)
    for (const note of notes) {
      expect(note.match(/giữ(?: lại)? [\d.]+ ₫ phí/g)).toEqual([expect.stringContaining("11.000 ₫")])
      expect(note).not.toContain("22.000 ₫")
    }
  })

  it("shows the fee as a bank fee, not as money that reached the backer", () => {
    const incoming = vnd(returnedTransferText(inRow, outPair))
    expect(incoming).toContain("Tiền của khoản hoàn tiền −300.000 ₫ ngày 08/11/2026 quay về")
    expect(incoming).toContain(
      "Ngân hàng giữ lại 11.000 ₫ phí: phần này là phí ngân hàng, tính vào tổng đã chi, không phải tiền người ủng hộ đã nhận."
    )
    expect(incoming).toContain("Người ủng hộ được hoàn đủ bằng một khoản chuyển mới; người tổ chức chịu phí.")
    // #72's wording counted the fee as refunded; that is gone.
    expect(incoming).not.toContain("vẫn tính là đã hoàn lại")
    const outgoing = vnd(returnedTransferText(outRow, inPair))
    expect(outgoing).toContain(
      "Khoản hoàn tiền này không đến được người ủng hộ: ngân hàng đã trả lại +289.000 ₫ ngày 10/11/2026."
    )
    expect(outgoing).toContain("Cả khoản −300.000 ₫ không còn tính vào tổng đã hoàn lại")
    expect(outgoing).toContain("ngân hàng giữ 11.000 ₫ phí, tính là phí ngân hàng trong tổng đã chi")
    expect(outgoing).toContain("Người ủng hộ được hoàn đủ bằng một khoản chuyển mới; người tổ chức chịu phí.")
  })

  it("keeps a fee on a returned payment spent, and names no fee when the bank returned everything", () => {
    const payOut = { ...outRow, is_refund: false }
    expect(vnd(returnedTransferText(payOut, inPair))).toContain(
      "Ngân hàng giữ 11.000 ₫ phí, phần này vẫn tính là đã chi."
    )
    const payIn = vnd(returnedTransferText(inRow, { ...outPair, is_refund: false }))
    expect(payIn).toContain("tính vào tổng đã chi.")
    expect(payIn).not.toContain("người ủng hộ")
    const full = { ...inRow, amount: 300_000, return_bank_fee: 0 }
    expect(returnBankFee(full, outPair)).toBe(0)
    expect(returnedTransferText(full, outPair)).not.toContain("phí")
    expect(returnedTransferText({ ...outRow, return_bank_fee: 0 }, null)).not.toContain("phí")
  })

  it("falls back to the pair's amounts, and is 0 off a returned pair", () => {
    expect(returnBankFee({ ...inRow, return_bank_fee: null }, outPair)).toBe(11_000)
    expect(returnBankFee({ ...outRow, return_bank_fee: undefined }, inPair)).toBe(11_000)
    expect(returnBankFee({ ...inRow, return_bank_fee: null }, null)).toBe(0)
    expect(returnBankFee({ ...inRow, return_of: null, return_bank_fee: 5 }, null)).toBe(0)
    // Without the other row, the incoming note still names the fee from the column.
    expect(vnd(returnedTransferText(inRow, null))).toContain("Ngân hàng giữ lại 11.000 ₫ phí")
  })

  it("reads the returned money for the organizer with each explained transfer out", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          {
            id: "o1",
            amount: "300000",
            disbursement: { is_refund: true },
            returned: {
              linked_at: "2026-11-12T03:00:00Z",
              back: { amount: "289000", booked_at: "2026-11-10T03:00:00Z" },
            },
          },
          { id: "o2", amount: 50_000, disbursement: { is_refund: false }, returned: null },
          { id: "o3", amount: 70_000, disbursement: { is_refund: false }, returned: [] },
        ],
      }),
      calls
    )
    const rows = await listExplainedOutgoing(db as never, CAMPAIGN)
    expect(selected(calls[0])).toContain(
      "returned:returned_transfers!original_transaction_id(linked_at, back:bank_transactions!bank_transaction_id(amount, booked_at))"
    )
    // The private reason and evidence of the link are never read here.
    expect(selected(calls[0])?.split("returned:")[1]).not.toMatch(/reason|evidence|linked_by/)
    expect(rows[0].amount).toBe(300_000)
    expect(rows[0].returned).toEqual({
      amount: 289_000,
      booked_at: "2026-11-10T03:00:00Z",
      linked_at: "2026-11-12T03:00:00Z",
    })
    expect(rows[1].returned).toBeNull()
    expect(rows[2].returned).toBeNull()
  })

  it("tells the organizer to send the full refund again, the fee being theirs", () => {
    const back = { amount: 289_000, booked_at: "2026-11-10T03:00:00Z", linked_at: "2026-11-12T03:00:00Z" }
    const refund = vnd(returnedOutgoingText({ amount: 300_000 }, { is_refund: true }, back))
    expect(refund).toContain("Ngân hàng đã trả lại +289.000 ₫ ngày 10/11/2026 và giữ 11.000 ₫ phí")
    expect(refund).toContain("Cả khoản −300.000 ₫ không còn tính là đã hoàn, kể cả phần phí.")
    expect(refund).toContain("Phí 11.000 ₫ do bạn chịu")
    expect(refund).toContain("chuyển lại đủ 300.000 ₫")
    expect(refund).not.toContain("289.000 ₫ rồi")
    // A re-sent refund must not be sent twice.
    expect(refund).toContain("Nếu đã chuyển lại rồi, đừng chuyển thêm")
    const full = vnd(returnedOutgoingText({ amount: 300_000 }, { is_refund: true }, { ...back, amount: 300_000 }))
    expect(full).not.toContain("phí")
    expect(full).toContain("chuyển lại 300.000 ₫")
    const payment = vnd(returnedOutgoingText({ amount: 300_000 }, { is_refund: false }, back))
    expect(payment).toContain("phí 11.000 ₫ vẫn tính là đã chi")
    expect(payment).not.toContain("người ủng hộ")
  })

  it("does not take the fee off the refund queue: a returned refund is refundable in full again", async () => {
    const db = fakeDb((call) =>
      call.target === "contributions"
        ? { data: [{ id: "a", reference_code: "GVA", received_amount: 300_000 }] }
        : // The refund (+300k) and its return post (−300k, the original amount); the 11k fee is a
          // 'disbursed' post with no contribution, so it never reaches this read.
          {
            data: [
              { contribution_id: "a", amount: 300_000 },
              { contribution_id: "a", amount: -300_000 },
            ],
          }
    )
    const rows = await listRefundable(db as never, CAMPAIGN, ORGANIZER_VIEWER)
    expect(rows.map((x) => [x.id, x.refundable_amount])).toEqual([["a", 300_000]])
  })
})

describe("public evidence", () => {
  it("reads give.public_disbursement_evidence for the page's transactions, grouped by transaction", async () => {
    const calls: Call[] = []
    const OTHER = "66666666-6666-4666-8666-666666666666"
    const db = fakeDb(
      () => ({
        data: [
          { id: "e1", bank_transaction_id: TX, storage_path: "p1", kind: "receipt", created_at: "2026-11-01" },
          { id: "e2", bank_transaction_id: OTHER, storage_path: "p2", kind: "photo", created_at: "2026-11-01" },
          { id: "e3", bank_transaction_id: TX, storage_path: "p3", kind: "photo", created_at: "2026-11-02" },
        ],
      }),
      calls
    )
    const byTx = await listPublicEvidence(db as never, CAMPAIGN, [TX, OTHER, TX])
    expect(calls[0].target).toBe("public_disbursement_evidence")
    expect(selected(calls[0])).not.toMatch(/added_by|hidden|reporter|moderat/)
    expect(op(calls[0], "eq")).toEqual(["campaign_id", CAMPAIGN])
    expect(op(calls[0], "in")).toEqual(["bank_transaction_id", [TX, OTHER]])
    expect(byTx.get(TX)?.map((e) => e.id)).toEqual(["e1", "e3"])
    expect(byTx.get(OTHER)?.map((e) => e.id)).toEqual(["e2"])
  })

  it("does not query without transactions", async () => {
    const calls: Call[] = []
    expect((await listPublicEvidence(fakeDb(() => ({ data: [] }), calls) as never, CAMPAIGN, [])).size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it("limits a report reason to 500 characters and treats an empty one as none", () => {
    expect(reportSchema.parse({ reason: "  " })).toEqual({ reason: null })
    expect(reportSchema.parse({ reason: " Lộ CCCD " })).toEqual({ reason: "Lộ CCCD" })
    expect(reportSchema.safeParse({ reason: "x".repeat(501) }).success).toBe(false)
  })
})

describe("organizer reads", () => {
  it("lists every unexplained outgoing transaction of the campaign, without a limit", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [{ id: TX, amount: "250000", disbursements: null }] }), calls)
    const { pending: rows, returned } = await listUnexplainedOutgoing(db as never, CAMPAIGN)
    expect(calls[0].target).toBe("bank_transactions")
    expect(selected(calls[0])).not.toContain("raw")
    expect(calls[0].ops.filter(([n]) => n === "eq").map((o) => o.slice(1))).toEqual([
      ["campaign_id", CAMPAIGN],
      ["direction", "out"],
    ])
    // Neither explained nor paired as a transfer to the campaign's new account (DOS/Give#84).
    expect(calls[0].ops.filter(([n]) => n === "is").map((o) => o.slice(1))).toEqual([
      ["disbursements", null],
      ["own_out", null],
    ])
    expect(selected(calls[0])).toContain("own_out:own_account_transfers!out_transaction_id(id)")
    expect(op(calls[0], "limit")).toBeUndefined()
    expect(rows).toEqual([{ id: TX, amount: 250_000 }])
    expect(returned).toEqual([])
  })

  it("splits off a transfer the bank returned: it is not spending to explain (DOS/Give#194)", async () => {
    const calls: Call[] = []
    const link = { linked_at: "2026-11-12T03:00:00Z", back: { amount: "289000", booked_at: "2026-11-10T03:00:00Z" } }
    const db = fakeDb(
      () => ({
        data: [
          { id: "p1", amount: 100_000, disbursements: null, returned: null },
          { id: "r1", amount: "300000", disbursements: null, returned: link },
          { id: "p2", amount: 200_000, disbursements: null, returned: [] },
          { id: "r2", amount: 50_000, disbursements: null, returned: [{ ...link, back: null }] },
        ],
      }),
      calls
    )
    const { pending, returned } = await listUnexplainedOutgoing(db as never, CAMPAIGN)
    // The link is read under RLS in the same query, never its private reason or evidence.
    expect(calls).toHaveLength(1)
    expect(selected(calls[0])).toContain(
      "returned:returned_transfers!original_transaction_id(linked_at, back:bank_transactions!bank_transaction_id(amount, booked_at))"
    )
    expect(selected(calls[0])?.split("returned:")[1]).not.toMatch(/reason|evidence|linked_by/)
    // Only what is still to explain counts; the order (oldest first) is kept.
    expect(pending).toEqual([
      { id: "p1", amount: 100_000 },
      { id: "p2", amount: 200_000 },
    ])
    expect(returned).toEqual([
      {
        id: "r1",
        amount: 300_000,
        returned: { amount: 289_000, booked_at: "2026-11-10T03:00:00Z", linked_at: "2026-11-12T03:00:00Z" },
        linked_at: "2026-11-12T03:00:00Z",
      },
      // Linked, but the money that came back could not be read: still not offered to explain.
      { id: "r2", amount: 50_000, returned: null, linked_at: "2026-11-12T03:00:00Z" },
    ])
  })

  it("words a returned, unexplained transfer with the return day and any fee, promising no total", () => {
    const vnd = (text: string) => text.replace(/\u00a0/g, " ")
    const back = { amount: 289_000, booked_at: "2026-11-10T03:00:00Z", linked_at: "2026-11-12T03:00:00Z" }
    const fee = vnd(returnedUnexplainedText({ amount: 300_000 }, back, back.linked_at))
    expect(fee).toBe(
      "Ngân hàng đã trả lại +289.000 ₫ ngày 10/11/2026 và giữ 11.000 ₫ phí ngân hàng. Bộ phận tài chính của Give đã ghi nhận và sẽ xử lý khoản này trên sao kê công khai, nên bạn không giải trình nó như một khoản chi. Nếu sao kê vẫn tính khoản này là chưa giải trình, hãy liên hệ Give qua email help@dos.me."
    )
    // The public totals still count it until finance settles it: no "not spent" claim.
    expect(fee).not.toMatch(/không (còn )?tính vào tổng|không phải khoản chi/)
    expect(
      vnd(returnedUnexplainedText({ amount: 300_000 }, { ...back, amount: 300_000 }, back.linked_at))
    ).not.toContain("phí")
    // Without the money that came back, the day finance linked it.
    expect(returnedUnexplainedText({ amount: 300_000 }, null, "2026-11-12T03:00:00Z")).toMatch(
      /^Ngày 12\/11\/2026, bộ phận tài chính của Give đã ghi nhận khoản chuyển này bị ngân hàng trả lại/
    )
  })

  it("reads whether a bank return is linked to the transaction being explained", async () => {
    const calls: Call[] = []
    const row = { id: TX, amount: "300000", disbursement: null }
    const linked = await getOutgoing(
      fakeDb(() => ({ data: { ...row, returned: { linked_at: "t", back: null } } }), calls) as never,
      CAMPAIGN,
      TX
    )
    expect(selected(calls[0])).toContain("returned:returned_transfers!original_transaction_id(")
    expect(linked).toEqual({ id: TX, amount: 300_000, disbursement: null, returned: true })
    const open = await getOutgoing(fakeDb(() => ({ data: { ...row, returned: [] } })) as never, CAMPAIGN, TX)
    expect(open?.returned).toBe(false)
  })

  it("lists explained transactions with their explanation and evidence in one query", async () => {
    const calls: Call[] = []
    await listExplainedOutgoing(fakeDb(() => ({ data: [] }), calls) as never, CAMPAIGN)
    expect(calls).toHaveLength(1)
    expect(selected(calls[0])).toContain("disbursements!inner(")
    expect(selected(calls[0])).toContain("disbursement_evidence(")
  })

  it("offers only what can still be refunded, and never selects guest names or emails", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "contributions") {
        return {
          data: [
            { id: "a", reference_code: "GVA", received_amount: 500_000 },
            { id: "b", reference_code: "GVB", received_amount: 200_000 },
          ],
        }
      }
      // Ledger 'refunded' rows: 'a' was refunded 150k, 'b' fully (a post and a reversal net to 200k).
      return {
        data: [
          { contribution_id: "a", amount: 150_000 },
          { contribution_id: "b", amount: 250_000 },
          { contribution_id: "b", amount: -50_000 },
        ],
      }
    }, calls)
    const rows = await listRefundable(db as never, CAMPAIGN, ORGANIZER_VIEWER)
    const contributions = calls.find((c) => c.target === "contributions")
    // Only the columns the own-contribution rule needs (DOS/Give#199); never the guest's name.
    expect(selected(contributions)).not.toMatch(/guest_name/)
    expect(selected(contributions)).toContain("contributor_user_id, guest_email")
    expect(op(contributions, "gt")).toEqual(["received_amount", 0])
    expect(calls.find((c) => c.target === "ledger_entries")?.ops).toContainEqual(["eq", "bucket", "refunded"])
    expect(rows.map((x) => [x.id, x.refundable_amount])).toEqual([["a", 350_000]])
    expect(refundOptionLabel(rows[0], formatVnd)).toContain(`còn hoàn được ${formatVnd(350_000)}`)
  })

  it("leaves the organizer's own contributions out of the refund picker, signed in or by guest email (DOS/Give#199)", async () => {
    const db = fakeDb((call) =>
      call.target === "contributions"
        ? {
            data: [
              {
                id: "mine",
                reference_code: "GVM",
                received_amount: 100_000,
                contributor_user_id: ORGANIZER,
                guest_email: null,
              },
              {
                id: "guest-mine",
                reference_code: "GVG",
                received_amount: 100_000,
                contributor_user_id: null,
                guest_email: " toc.chuc@example.VN ",
              },
              {
                id: "other",
                reference_code: "GVO",
                received_amount: 100_000,
                contributor_user_id: null,
                guest_email: "lan@example.vn",
              },
              {
                id: "user",
                reference_code: "GVU",
                received_amount: 100_000,
                contributor_user_id: "someone",
                guest_email: null,
              },
            ],
          }
        : { data: [] }
    )
    const rows = await listRefundable(db as never, CAMPAIGN, ORGANIZER_VIEWER)
    expect(rows.map((x) => x.id)).toEqual(["other", "user"])
    for (const row of rows) {
      expect(row).not.toHaveProperty("guest_email")
      expect(row).not.toHaveProperty("contributor_user_id")
    }
    // Without an email on the session, a guest contribution is never taken for the organizer's.
    const noEmail = await listRefundable(db as never, CAMPAIGN, { id: ORGANIZER, email: null })
    expect(noEmail.map((x) => x.id)).toEqual(["guest-mine", "other", "user"])
  })

  it("flags the organizer's own contribution when the refund action reads it (DOS/Give#199)", async () => {
    const row = (over: Record<string, unknown>) =>
      fakeDb((call) =>
        call.target === "contributions"
          ? {
              data: {
                id: CONTRIBUTION,
                reference_code: "GVA",
                received_amount: 100_000,
                contributor_user_id: null,
                guest_email: null,
                ...over,
              },
            }
          : { data: [] }
      )
    const guest = await getRefundable(
      row({ guest_email: "TOC.CHUC@example.vn" }) as never,
      CAMPAIGN,
      CONTRIBUTION,
      ORGANIZER_VIEWER
    )
    expect(guest).toMatchObject({ id: CONTRIBUTION, own: true, refundable_amount: 100_000 })
    expect(guest).not.toHaveProperty("guest_email")
    expect(
      await getRefundable(row({ contributor_user_id: ORGANIZER }) as never, CAMPAIGN, CONTRIBUTION, ORGANIZER_VIEWER)
    ).toMatchObject({ own: true })
    expect(
      await getRefundable(row({ guest_email: "lan@example.vn" }) as never, CAMPAIGN, CONTRIBUTION, ORGANIZER_VIEWER)
    ).toMatchObject({ own: false })
    expect(
      await getRefundable(fakeDb(() => ({ data: null })) as never, CAMPAIGN, CONTRIBUTION, ORGANIZER_VIEWER)
    ).toBeNull()
  })

  it("flags explanations older than seven days", () => {
    const now = new Date("2026-11-10T00:00:00Z")
    expect(explanationOverdue("2026-11-02T23:00:00Z", now)).toBe(true)
    expect(explanationOverdue("2026-11-04T00:00:00Z", now)).toBe(false)
    expect(explanationOverdue("not a date", now)).toBe(false)
  })
})

describe("evidence paths", () => {
  it("round-trips a storage key through its URL", () => {
    const path = evidencePath(CAMPAIGN, TX, OBJECT)
    expect(path).toBe(`disbursements/${CAMPAIGN}/${TX}/${OBJECT}.webp`)
    const url = evidenceUrl(path)
    expect(url).toBe(`/media/evidence/${CAMPAIGN}/${TX}/${OBJECT}.webp`)
    expect(parseEvidencePath(url.replace("/media/evidence/", "").split("/"))).toBe(path)
    const publicUrl = publicEvidenceUrl(path)
    expect(publicUrl).toBe(`/media/public/evidence/${CAMPAIGN}/${TX}/${OBJECT}.webp`)
    expect(parseEvidencePath(publicUrl.replace("/media/public/evidence/", "").split("/"))).toBe(path)
    expect(evidenceCampaignId(path)).toBe(CAMPAIGN)
    expect(evidenceCampaignId("disbursements/x/y/z.webp")).toBeNull()
  })

  it("rejects anything that is not exactly an evidence key", () => {
    expect(parseEvidencePath([CAMPAIGN, TX, `${OBJECT}.png`])).toBeNull()
    expect(parseEvidencePath(["..", "campaigns", CAMPAIGN, `${OBJECT}.webp`])).toBeNull()
    expect(parseEvidencePath([CAMPAIGN, `${OBJECT}.webp`])).toBeNull()
    expect(parseEvidencePath([CAMPAIGN, TX, OBJECT, `${OBJECT}.webp`])).toBeNull()
  })
})

describe("explain form", () => {
  const base = {
    purpose: " Mua sách ",
    category: "goods",
    recipient: "",
    refund_contribution_id: "",
    evidence_kind: "invoice",
  }

  it("accepts a plain explanation", () => {
    expect(explainSchema.parse(base)).toEqual({
      purpose: "Mua sách",
      category: "goods",
      recipient: null,
      refund_contribution_id: null,
      evidence_kind: "invoice",
      is_refund: false,
    })
  })

  it("makes it a refund when a contribution is picked", () => {
    const parsed = explainSchema.parse({ ...base, category: "refund", refund_contribution_id: CONTRIBUTION })
    expect(parsed.is_refund).toBe(true)
    expect(parsed.refund_contribution_id).toBe(CONTRIBUTION)
  })

  it("ties the refund category to a refunded contribution, both ways", () => {
    expect(explainSchema.safeParse({ ...base, category: "refund" }).error?.issues[0].message).toBe(
      "Khoản hoàn tiền cần chọn lượt ủng hộ được hoàn"
    )
    expect(explainSchema.safeParse({ ...base, refund_contribution_id: CONTRIBUTION }).success).toBe(false)
  })

  it("rejects a missing purpose, unknown category or kind, and a forged contribution id", () => {
    expect(explainSchema.safeParse({ ...base, purpose: "  " }).success).toBe(false)
    expect(explainSchema.safeParse({ ...base, category: "bribes" }).success).toBe(false)
    expect(explainSchema.safeParse({ ...base, evidence_kind: "pdf" }).success).toBe(false)
    expect(explainSchema.safeParse({ ...base, category: "refund", refund_contribution_id: "x' or 1=1" }).success).toBe(
      false
    )
    expect(explainSchema.safeParse({ ...base, purpose: "a".repeat(1001) }).success).toBe(false)
  })
})
