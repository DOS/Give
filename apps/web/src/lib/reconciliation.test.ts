import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import type { Db } from "./campaigns"
import {
  candidateLabel,
  getIncoming,
  listInboundExplanations,
  listManualMatches,
  listUnmatched,
  accountOwnerMismatch,
  campaignOrganizers,
  normalizeReferenceCode,
  paidAfterExplain,
  paidAfterMatch,
  paidBreakdown,
  REFERENCE_CODE,
  waitsFor,
  type MatchCandidate,
} from "./reconciliation"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const ORGANIZER = "33333333-3333-4333-8333-333333333333"
const OTHER = "44444444-4444-4444-8444-444444444444"

/** formatVnd puts a no-break space before the đồng sign. */
const vnd = (text: string) => text.replace(/ ₫/g, " ₫")

describe("paidBreakdown", () => {
  it("reads received, unmatched, other and paid in one call to campaign_paid", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({ data: { received_amount: "500000", unmatched_amount: 0, other_amount: 300000, paid_amount: "800000" } }),
      calls
    ) as unknown as Db
    expect(await paidBreakdown(db, CAMPAIGN)).toEqual({ received: 500000, unmatched: 0, other: 300000, paid: 800000 })
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe("rpc:campaign_paid")
    expect(op(calls[0], "args")).toEqual([{ p_campaign_id: CAMPAIGN }])
  })

  it("takes the database's total rather than adding the parts itself", async () => {
    const db = fakeDb(() => ({
      data: { received_amount: 1, unmatched_amount: 2, other_amount: 3, paid_amount: 7 },
    })) as unknown as Db
    expect((await paidBreakdown(db, CAMPAIGN))?.paid).toBe(7)
  })

  it("is null without a row and throws a database error", async () => {
    expect(await paidBreakdown(fakeDb(() => ({ data: null })) as unknown as Db, CAMPAIGN)).toBeNull()
    const failing = fakeDb(() => ({ error: { code: "PGRST301", message: "JWT expired" } })) as unknown as Db
    await expect(paidBreakdown(failing, CAMPAIGN)).rejects.toMatchObject({ code: "PGRST301" })
  })

  it("is null while the database does not have campaign_paid yet", async () => {
    const missing = fakeDb(() => ({
      error: { code: "PGRST202", message: "Could not find the function" },
    })) as unknown as Db
    expect(await paidBreakdown(missing, CAMPAIGN)).toBeNull()
  })
})

describe("paidAfterMatch", () => {
  const before = { received: 500000, unmatched: 200000, other: 0, paid: 700000 }
  it("says the paid total is unchanged when only the parts moved", () => {
    expect(paidAfterMatch(before, { received: 700000, unmatched: 0, other: 0, paid: 700000 })).toBe(
      vnd(" Tổng đã thanh toán không đổi: 700.000 ₫ (đã khớp 500.000 ₫ → 700.000 ₫, chưa khớp 200.000 ₫ → 0 ₫).")
    )
  })
  it("explains a total that moved because of another transaction", () => {
    expect(paidAfterMatch(before, { received: 700000, unmatched: 50000, other: 0, paid: 750000 })).toContain(
      "có giao dịch khác vừa được ghi"
    )
  })
  it("says nothing without both readings", () => {
    expect(paidAfterMatch(null, before)).toBe("")
  })
})

describe("paidAfterExplain", () => {
  const before = { received: 500000, unmatched: 200000, other: 0, paid: 700000 }
  it("says the paid total is unchanged when the money only moved to 'not a donation'", () => {
    expect(paidAfterExplain(before, { received: 500000, unmatched: 0, other: 200000, paid: 700000 })).toBe(
      vnd(
        " Tổng đã thanh toán không đổi: 700.000 ₫ (chưa khớp 200.000 ₫ → 0 ₫, không phải tiền ủng hộ 0 ₫ → 200.000 ₫)."
      )
    )
  })
  it("explains a total that moved because of another transaction", () => {
    expect(paidAfterExplain(before, { received: 600000, unmatched: 0, other: 200000, paid: 800000 })).toContain(
      "trước khi giải trình"
    )
    expect(paidAfterExplain(before, null)).toBe("")
  })
})

describe("listUnmatched", () => {
  it("selects incoming, attributed transactions with neither a match nor an explanation", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          { id: "t", campaign_id: CAMPAIGN, amount: "150000", transaction_matches: null, inbound_explanations: null },
        ],
      }),
      calls
    ) as unknown as Db
    expect(await listUnmatched(db, { campaignId: CAMPAIGN })).toEqual({
      transactions: [{ id: "t", campaign_id: CAMPAIGN, amount: 150000, account_owner_id: null }],
      total: 1,
    })
    expect(calls[0].target).toBe("bank_transactions")
    expect(String(op(calls[0], "select")?.[0])).toContain(
      "account:receiving_accounts!receiving_account_id(owner_user_id)"
    )
    expect(calls[0].ops).toEqual(
      expect.arrayContaining([
        ["eq", "direction", "in"],
        ["not", "campaign_id", "is", null],
        ["is", "transaction_matches", null],
        ["is", "inbound_explanations", null],
        ["eq", "campaign_id", CAMPAIGN],
      ])
    )
  })

  it("reads the owner of each transaction's receiving account, as an object or a one-row array", async () => {
    const db = fakeDb(() => ({
      data: [
        { id: "a", campaign_id: CAMPAIGN, amount: 1, account: { owner_user_id: ORGANIZER } },
        { id: "b", campaign_id: CAMPAIGN, amount: 2, account: [{ owner_user_id: OTHER }] },
        { id: "c", campaign_id: CAMPAIGN, amount: 3, account: null },
      ],
      count: 7,
    })) as unknown as Db
    const { transactions, total } = await listUnmatched(db)
    expect(transactions.map((t) => [t.id, t.account_owner_id])).toEqual([
      ["a", ORGANIZER],
      ["b", OTHER],
      ["c", null],
    ])
    expect(transactions[0]).not.toHaveProperty("account")
    expect(total).toBe(7)
  })
})

describe("accountOwnerMismatch (DOS/Give#148)", () => {
  it("is true when the account's owner is not the campaign's organizer", () => {
    expect(accountOwnerMismatch({ account_owner_id: ORGANIZER }, ORGANIZER)).toBe(false)
    expect(accountOwnerMismatch({ account_owner_id: OTHER }, ORGANIZER)).toBe(true)
  })

  it("counts an account the organizer may not read as not theirs", () => {
    // Organizers read only the accounts they own (receiving_accounts_read).
    expect(accountOwnerMismatch({ account_owner_id: null }, ORGANIZER)).toBe(true)
  })

  it("is false when the organizer is unknown, leaving the refusal to the database", () => {
    expect(accountOwnerMismatch({ account_owner_id: OTHER }, undefined)).toBe(false)
    expect(accountOwnerMismatch({ account_owner_id: null }, null)).toBe(false)
  })
})

describe("campaignOrganizers", () => {
  it("reads organizers through managed_campaigns, once per campaign", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [{ id: CAMPAIGN, organizer_id: ORGANIZER }] }), calls) as unknown as Db
    expect(await campaignOrganizers(db, [CAMPAIGN, CAMPAIGN])).toEqual(new Map([[CAMPAIGN, ORGANIZER]]))
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe("rpc:managed_campaigns")
    expect(op(calls[0], "select")).toEqual(["id, organizer_id"])
    expect(calls[0].ops).toEqual(expect.arrayContaining([["in", "id", [CAMPAIGN]]]))
  })

  it("does not call the database without campaigns", async () => {
    const calls: Call[] = []
    expect(await campaignOrganizers(fakeDb(() => ({ data: [] }), calls) as unknown as Db, [])).toEqual(new Map())
    expect(calls).toHaveLength(0)
  })
})

describe("getIncoming", () => {
  it("reads the match and the explanation of a transaction, as objects or arrays", async () => {
    const row = { id: "t", campaign_id: CAMPAIGN, amount: "150000", direction: "in" }
    const calls: Call[] = []
    let db = fakeDb(
      () => ({ data: { ...row, transaction_matches: null, inbound_explanations: { kind: "interest" } } }),
      calls
    ) as unknown as Db
    expect(await getIncoming(db, "t")).toMatchObject({ amount: 150000, matched_to: null, explained_as: "interest" })
    expect(String(op(calls[0], "select")?.[0])).toContain("inbound_explanations(kind)")

    db = fakeDb(() => ({
      data: { ...row, transaction_matches: [{ contribution_id: "c" }], inbound_explanations: [] },
    })) as unknown as Db
    expect(await getIncoming(db, "t")).toMatchObject({ matched_to: "c", explained_as: null })
  })
})

describe("listInboundExplanations", () => {
  it("reads the latest explanations with their transaction", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          {
            bank_transaction_id: "t",
            kind: "bank_adjustment",
            reason: "Bounced payment",
            evidence: "Bank letter",
            explained_at: "2026-11-02T00:00:00Z",
            tx: { amount: "200000", booked_at: "2026-10-30T00:00:00Z", campaign_id: CAMPAIGN },
          },
        ],
      }),
      calls
    ) as unknown as Db
    const explanations = await listInboundExplanations(db)
    expect(explanations[0].tx.amount).toBe(200000)
    expect(calls[0].target).toBe("inbound_explanations")
    expect(String(op(calls[0], "select")?.[0])).toContain("tx:bank_transactions!inner(")
    // Who explained it is never read (not granted to clients).
    expect(String(op(calls[0], "select")?.[0])).not.toContain("explained_by")
    expect(op(calls[0], "order")).toEqual(["explained_at", { ascending: false }])
  })
})

describe("listManualMatches", () => {
  it("filters manual matches of one campaign through the embedded transaction", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          {
            bank_transaction_id: "t",
            contribution_id: "c",
            matched_at: "2026-11-01T00:00:00Z",
            tx: { amount: "150000", booked_at: "2026-10-30T00:00:00Z", campaign_id: CAMPAIGN },
            contribution: { reference_code: "GV7K2M9QX" },
          },
        ],
      }),
      calls
    ) as unknown as Db
    const matches = await listManualMatches(db, { campaignId: CAMPAIGN })
    expect(matches[0].tx.amount).toBe(150000)
    expect(calls[0].target).toBe("transaction_matches")
    expect(String(op(calls[0], "select")?.[0])).toContain("tx:bank_transactions!inner(")
    expect(calls[0].ops).toEqual(
      expect.arrayContaining([
        ["eq", "matched_by", "manual"],
        ["eq", "tx.campaign_id", CAMPAIGN],
      ])
    )
  })
})

describe("reference codes and candidates", () => {
  it("normalizes what donors type", () => {
    expect(normalizeReferenceCode(" gv 7k2m-9qx ")).toBe("GV7K2M9QX")
    expect(REFERENCE_CODE.test("GV7K2M9QX")).toBe(true)
    expect(REFERENCE_CODE.test("GV7K2M9Q0")).toBe(false)
  })

  const candidate: MatchCandidate = {
    id: "c",
    kind: "donation",
    reference_code: "GV7K2M9QX",
    intended_amount: 200000,
    received_amount: 0,
    status: "awaiting_transfer",
    public_name: null,
    guest_name: "Nguyễn Văn A",
    is_anonymous: false,
    created_at: "2026-10-30T01:00:00Z",
  }

  it("labels a candidate and knows the amount it waits for", () => {
    expect(candidateLabel(candidate)).toBe(vnd("GV7K2M9QX · 200.000 ₫ · Nguyễn Văn A · chờ chuyển khoản"))
    expect(waitsFor(candidate, 200000)).toBe(true)
    expect(waitsFor({ ...candidate, received_amount: 50000 }, 150000)).toBe(true)
    expect(waitsFor(candidate, 100000)).toBe(false)
    expect(candidateLabel({ ...candidate, status: "partially_paid", received_amount: 50000 })).toBe(
      vnd("GV7K2M9QX · 200.000 ₫ (đã nhận 50.000 ₫) · Nguyễn Văn A · đã trả một phần")
    )
  })
})
