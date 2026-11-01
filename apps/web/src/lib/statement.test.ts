import { describe, expect, it } from "vitest"

import { formatVnd } from "@/lib/format"
import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  counterpartyLabel,
  evidenceCampaignId,
  evidencePath,
  evidenceUrl,
  explainedOutAmount,
  explainSchema,
  explanationOverdue,
  getMoneyTotals,
  listMoneyTotals,
  listExplainedOutgoing,
  listPublicEvidence,
  listPendingOutgoing,
  listRefundable,
  listStatement,
  parseEvidencePath,
  parseStatementParams,
  publicEvidenceUrl,
  raisedAmount,
  refundOptionLabel,
  remainingAmount,
  reportSchema,
  STATEMENT_PAGE_SIZE,
  statementHref,
  type MoneyTotals,
} from "./statement"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TX = "33333333-3333-4333-8333-333333333333"
const OBJECT = "44444444-4444-4444-8444-444444444444"
const CONTRIBUTION = "55555555-5555-4555-8555-555555555555"

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
    })
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

  it("headlines paid money for give and pledged money for back", () => {
    const totals = { paid_amount: 10, pledged_amount: 99 } as MoneyTotals
    expect(raisedAmount(totals, "give")).toBe(10)
    expect(raisedAmount(totals, "back")).toBe(99)
    expect(raisedAmount(null, "give")).toBe(0)
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

  it("labels money out by the explained recipient only", () => {
    const row = { direction: "out" as const, matched: false, donor_name: null, donor_anonymous: null }
    expect(counterpartyLabel({ ...row, recipient: "Nhà sách B", explained: true })).toBe("Nhà sách B")
    expect(counterpartyLabel({ ...row, recipient: null, explained: true })).toBe("Không công khai")
    expect(counterpartyLabel({ ...row, recipient: null, explained: false })).toBe("Chưa rõ người nhận")
  })

  it("never asks the view for the bank account-holder name", async () => {
    const calls: Call[] = []
    await listStatement(fakeDb(() => ({ data: [] }), calls) as never, CAMPAIGN)
    const columns = selected(calls[0])
      .split(",")
      .map((c) => c.trim())
    expect(columns).not.toContain("counterparty_name")
    expect(columns).toEqual(expect.arrayContaining(["donor_name", "donor_anonymous", "counterparty_account_masked"]))
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
    const rows = await listPendingOutgoing(db as never, CAMPAIGN)
    expect(calls[0].target).toBe("bank_transactions")
    expect(selected(calls[0])).not.toContain("raw")
    expect(calls[0].ops.filter(([n]) => n === "eq").map((o) => o.slice(1))).toEqual([
      ["campaign_id", CAMPAIGN],
      ["direction", "out"],
    ])
    expect(op(calls[0], "is")).toEqual(["disbursements", null])
    expect(op(calls[0], "limit")).toBeUndefined()
    expect(rows).toEqual([{ id: TX, amount: 250_000 }])
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
    const rows = await listRefundable(db as never, CAMPAIGN)
    const contributions = calls.find((c) => c.target === "contributions")
    expect(selected(contributions)).not.toMatch(/guest|email|contributor_user_id/)
    expect(op(contributions, "gt")).toEqual(["received_amount", 0])
    expect(calls.find((c) => c.target === "ledger_entries")?.ops).toContainEqual(["eq", "bucket", "refunded"])
    expect(rows.map((x) => [x.id, x.refundable_amount])).toEqual([["a", 350_000]])
    expect(refundOptionLabel(rows[0], formatVnd)).toContain(`còn hoàn được ${formatVnd(350_000)}`)
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
