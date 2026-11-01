import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import type { Db } from "./campaigns"
import {
  candidateLabel,
  listManualMatches,
  listUnmatched,
  normalizeReferenceCode,
  paidAfterMatch,
  paidBreakdown,
  REFERENCE_CODE,
  waitsFor,
  type MatchCandidate,
} from "./reconciliation"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

/** formatVnd puts a no-break space before the đồng sign. */
const vnd = (text: string) => text.replace(/ ₫/g, " ₫")

describe("paidBreakdown", () => {
  it("sums received and unmatched_in, reversals included", async () => {
    const db = fakeDb(() => ({
      data: [
        { bucket: "received", amount: "500000" },
        { bucket: "unmatched_in", amount: 200000 },
        { bucket: "unmatched_in", amount: -200000 },
        { bucket: "received", amount: 200000 },
      ],
    })) as unknown as Db
    expect(await paidBreakdown(db, CAMPAIGN)).toEqual({ received: 700000, unmatched: 0, paid: 700000 })
  })

  it("reads every page of a long ledger, after the last id read", async () => {
    const calls: Call[] = []
    let page = 0
    const db = fakeDb(() => {
      page += 1
      const first = page === 1 ? 1 : 1001
      return {
        data: Array.from({ length: page === 1 ? 1000 : 3 }, (_, i) => ({
          id: String(first + i),
          bucket: "unmatched_in",
          amount: 1,
        })),
      }
    }, calls) as unknown as Db
    expect(await paidBreakdown(db, CAMPAIGN)).toEqual({ received: 0, unmatched: 1003, paid: 1003 })
    expect(calls.map((c) => op(c, "gt"))).toEqual([
      ["id", 0],
      ["id", 1000],
    ])
    expect(op(calls[0], "in")).toEqual(["bucket", ["received", "unmatched_in"]])
  })

  it("gives up on a ledger too large to read here instead of showing a partial sum", async () => {
    let next = 0
    const db = fakeDb(() => ({
      data: Array.from({ length: 1000 }, () => ({ id: ++next, bucket: "received", amount: 1 })),
    })) as unknown as Db
    expect(await paidBreakdown(db, CAMPAIGN)).toBeNull()
  })
})

describe("paidAfterMatch", () => {
  const before = { received: 500000, unmatched: 200000, paid: 700000 }
  it("says the paid total is unchanged when only the parts moved", () => {
    expect(paidAfterMatch(before, { received: 700000, unmatched: 0, paid: 700000 })).toBe(
      vnd(" Tổng đã thanh toán không đổi: 700.000 ₫ (đã khớp 500.000 ₫ → 700.000 ₫, chưa khớp 200.000 ₫ → 0 ₫).")
    )
  })
  it("explains a total that moved because of another transaction", () => {
    expect(paidAfterMatch(before, { received: 700000, unmatched: 50000, paid: 750000 })).toContain(
      "có giao dịch khác vừa được ghi"
    )
  })
  it("says nothing without both readings", () => {
    expect(paidAfterMatch(null, before)).toBe("")
  })
})

describe("listUnmatched", () => {
  it("selects incoming, attributed transactions without a match", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({ data: [{ id: "t", campaign_id: CAMPAIGN, amount: "150000", transaction_matches: null }] }),
      calls
    ) as unknown as Db
    expect(await listUnmatched(db, { campaignId: CAMPAIGN })).toEqual({
      transactions: [{ id: "t", campaign_id: CAMPAIGN, amount: 150000 }],
      total: 1,
    })
    expect(calls[0].target).toBe("bank_transactions")
    expect(calls[0].ops).toEqual(
      expect.arrayContaining([
        ["eq", "direction", "in"],
        ["not", "campaign_id", "is", null],
        ["is", "transaction_matches", null],
        ["eq", "campaign_id", CAMPAIGN],
      ])
    )
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
