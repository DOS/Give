import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import type { Db } from "./campaigns"
import {
  candidateLabel,
  correctionBlocked,
  correctionCandidates,
  explainersOf,
  explanationOpen,
  paidAfterReturnToUnmatched,
  RETURN_TO_UNMATCHED_EFFECT,
  returnToUnmatchedBlocked,
  getIncoming,
  paidAfterCorrect,
  listInboundExplanations,
  listManualMatches,
  listMatchCandidates,
  listReturnCandidates,
  listReturnedTransfers,
  listUnmatched,
  paidAfterReturn,
  returnCandidateLabel,
  returnCandidatesFor,
  RETURN_CANDIDATE_LIMIT,
  accountOwnerMismatch,
  campaignOrganizers,
  listUnattributed,
  OWNER_MISMATCH_FOR_ORGANIZER,
  OWNER_MISMATCH_FOR_STAFF,
  ownerMismatchNotice,
  transactionSourceLabel,
  normalizeReferenceCode,
  paidAfterExplain,
  paidAfterMatch,
  paidBreakdown,
  REFERENCE_CODE,
  waitsFor,
  type MatchCandidate,
  type ReturnCandidate,
} from "./reconciliation"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const ORGANIZER = "33333333-3333-4333-8333-333333333333"
const OTHER = "44444444-4444-4444-8444-444444444444"
const STAFF = "66666666-6666-4666-8666-666666666666"
/** A finance staff member viewing /admin/unmatched; their auth email differs from their guest email in case and spaces. */
const STAFF_VIEWER = { id: STAFF, email: "Tai.Chinh@Give.vn" }

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

/** The read of returned explanations in listUnmatched (DOS/Give#196). */
const RETURNED_EMBED =
  "explanation:inbound_explanations!inner(kind, returned:inbound_explanation_returns!inner(reason, returned_at))"
const isReturnedRead = (call: Call) => String(op(call, "select")?.[0]).includes(RETURNED_EMBED)

describe("listUnmatched", () => {
  it("selects incoming, attributed transactions with neither a match nor an explanation", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      (call) =>
        isReturnedRead(call)
          ? { data: [], count: 0 }
          : {
              data: [
                {
                  id: "t",
                  campaign_id: CAMPAIGN,
                  amount: "150000",
                  booked_at: "2026-11-01T00:00:00Z",
                  transaction_matches: null,
                  inbound_explanations: null,
                  own_in: null,
                },
              ],
            },
      calls
    ) as unknown as Db
    expect(await listUnmatched(db, { campaignId: CAMPAIGN })).toEqual({
      transactions: [
        {
          id: "t",
          campaign_id: CAMPAIGN,
          amount: 150000,
          booked_at: "2026-11-01T00:00:00Z",
          account_owner_id: null,
          binding_account_id: null,
          returned_explanation: null,
        },
      ],
      total: 1,
    })
    expect(calls).toHaveLength(2)
    const [open, returned] = calls
    for (const call of calls) {
      expect(call.target).toBe("bank_transactions")
      expect(String(op(call, "select")?.[0])).toContain(
        "account:receiving_accounts!receiving_account_id(owner_user_id)"
      )
      expect(String(op(call, "select")?.[0])).toContain("binding:account_bindings!binding_id(receiving_account_id)")
      expect(call.ops).toEqual(
        expect.arrayContaining([
          ["eq", "direction", "in"],
          ["not", "campaign_id", "is", null],
          ["is", "transaction_matches", null],
          // The incoming leg of a transfer between the campaign's own accounts is settled (DOS/Give#84).
          ["is", "own_in", null],
          ["is", "returned_transfers", null],
          ["eq", "campaign_id", CAMPAIGN],
        ])
      )
      expect(String(op(call, "select")?.[0])).toContain("own_in:own_account_transfers!in_transaction_id(id)")
      // A transaction linked as returned (DOS/Give#72) leaves the queue; the embed names the incoming foreign key.
      expect(String(op(call, "select")?.[0])).toContain("returned_transfers!bank_transaction_id(bank_transaction_id)")
      expect(String(op(call, "select")?.[0])).toContain("asset")
      expect(op(call, "order")).toEqual(["booked_at", { ascending: false }])
    }
    // Never explained...
    expect(isReturnedRead(open)).toBe(false)
    expect(open.ops).toContainEqual(["is", "inbound_explanations", null])
    // ...or explained and returned to unmatched (DOS/Give#196): both embeds are required, returned_by is not read.
    expect(isReturnedRead(returned)).toBe(true)
    expect(returned.ops).not.toContainEqual(["is", "inbound_explanations", null])
    expect(String(op(returned, "select")?.[0])).not.toContain("returned_by")
  })

  it("reads the account's owner and the binding's account, as an object or a one-row array", async () => {
    const db = fakeDb((call) =>
      isReturnedRead(call)
        ? { data: [], count: 0 }
        : {
            data: [
              {
                id: "a",
                campaign_id: CAMPAIGN,
                amount: 1,
                booked_at: "2026-11-03T00:00:00Z",
                account: { owner_user_id: ORGANIZER },
                binding: { receiving_account_id: "r" },
              },
              {
                id: "b",
                campaign_id: CAMPAIGN,
                amount: 2,
                booked_at: "2026-11-02T00:00:00Z",
                account: [{ owner_user_id: OTHER }],
                binding: [{ receiving_account_id: "r" }],
              },
              {
                id: "c",
                campaign_id: CAMPAIGN,
                amount: 3,
                booked_at: "2026-11-01T00:00:00Z",
                account: null,
                binding: null,
              },
            ],
            count: 7,
          }
    ) as unknown as Db
    const { transactions, total } = await listUnmatched(db)
    expect(transactions.map((t) => [t.id, t.account_owner_id, t.binding_account_id])).toEqual([
      ["a", ORGANIZER, "r"],
      ["b", OTHER, "r"],
      ["c", null, null],
    ])
    expect(transactions[0]).not.toHaveProperty("account")
    expect(transactions[0]).not.toHaveProperty("binding")
    expect(total).toBe(7)
  })

  it("lists money whose explanation was returned once, newest first, with what it was (DOS/Give#196)", async () => {
    const returnedRow = (id: string, booked: string, nested: "object" | "array") => {
      const ret = { reason: "Mai says it is her donation", returned_at: "2026-11-15T09:00:00Z" }
      const explanation = { kind: "organizer_top_up", returned: nested === "object" ? ret : [ret] }
      return {
        id,
        campaign_id: CAMPAIGN,
        amount: "300000",
        booked_at: booked,
        explanation: nested === "object" ? explanation : [explanation],
      }
    }
    const db = fakeDb((call) =>
      isReturnedRead(call)
        ? {
            data: [
              returnedRow("r1", "2026-11-02T00:00:00Z", "object"),
              returnedRow("r2", "2026-10-20T00:00:00Z", "array"),
            ],
            count: 2,
          }
        : {
            data: [
              { id: "o1", campaign_id: CAMPAIGN, amount: 1, booked_at: "2026-11-05T00:00:00Z" },
              { id: "o2", campaign_id: CAMPAIGN, amount: 2, booked_at: "2026-10-25T00:00:00Z" },
            ],
            count: 5,
          }
    ) as unknown as Db
    const { transactions, total } = await listUnmatched(db, { limit: 3 })
    // Merged by booking time and cut to the limit; the total counts both sets, which never overlap.
    expect(transactions.map((t) => t.id)).toEqual(["o1", "r1", "o2"])
    expect(total).toBe(7)
    expect(transactions[1]).toMatchObject({
      amount: 300000,
      returned_explanation: {
        kind: "organizer_top_up",
        reason: "Mai says it is her donation",
        returned_at: "2026-11-15T09:00:00Z",
      },
    })
    expect(transactions[1]).not.toHaveProperty("explanation")
    expect(transactions[0].returned_explanation).toBeNull()
    expect((await listUnmatched(db)).transactions.find((t) => t.id === "r2")?.returned_explanation?.kind).toBe(
      "organizer_top_up"
    )
  })

  it("throws when either read fails, rather than hiding unmatched money", async () => {
    const failing = (returned: boolean) =>
      fakeDb((call) =>
        isReturnedRead(call) === returned ? { error: { code: "PGRST200", message: "no relationship" } } : { data: [] }
      ) as unknown as Db
    await expect(listUnmatched(failing(true))).rejects.toMatchObject({ code: "PGRST200" })
    await expect(listUnmatched(failing(false))).rejects.toMatchObject({ code: "PGRST200" })
  })
})

describe("accountOwnerMismatch and ownerMismatchNotice (DOS/Give#148)", () => {
  const ACCOUNT = "55555555-5555-4555-8555-555555555555"
  const row = (owner: string | null, bindingAccount: string | null) => ({
    receiving_account_id: ACCOUNT,
    account_owner_id: owner,
    binding_account_id: bindingAccount,
  })

  it("staff: compares the account's owner with the campaign's organizer", () => {
    // Staff read every account, so the owner is always there.
    expect(accountOwnerMismatch(row(ORGANIZER, ACCOUNT), ORGANIZER)).toBe(false)
    expect(accountOwnerMismatch(row(OTHER, ACCOUNT), ORGANIZER)).toBe(true)
    expect(ownerMismatchNotice(row(OTHER, ACCOUNT), ORGANIZER, STAFF)).toBe(OWNER_MISMATCH_FOR_STAFF)
    expect(ownerMismatchNotice(row(ORGANIZER, ACCOUNT), ORGANIZER, STAFF)).toBeNull()
  })

  it("organizer: an account they cannot read is not theirs when their binding points at it", () => {
    // Organizers read only accounts they own, and the bindings of their campaigns.
    expect(accountOwnerMismatch(row(null, ACCOUNT), ORGANIZER)).toBe(true)
    expect(ownerMismatchNotice(row(null, ACCOUNT), ORGANIZER, ORGANIZER)).toBe(OWNER_MISMATCH_FOR_ORGANIZER)
    expect(ownerMismatchNotice(row(ORGANIZER, ACCOUNT), ORGANIZER, ORGANIZER)).toBeNull()
  })

  it("never shows the notice when the binding is missing or points elsewhere", () => {
    // An embed left out (RLS, a missing binding) must not read as a refusal.
    expect(accountOwnerMismatch(row(null, null), ORGANIZER)).toBe(false)
    expect(accountOwnerMismatch(row(null, OTHER), ORGANIZER)).toBe(false)
    expect(ownerMismatchNotice(row(null, null), ORGANIZER, ORGANIZER)).toBeNull()
  })

  it("is false when the organizer is unknown, leaving the refusal to the database", () => {
    expect(accountOwnerMismatch(row(OTHER, ACCOUNT), undefined)).toBe(false)
    expect(accountOwnerMismatch(row(null, ACCOUNT), null)).toBe(false)
    expect(ownerMismatchNotice(row(OTHER, ACCOUNT), undefined, STAFF)).toBeNull()
  })

  it("words the notice like the match action's refusal (DOS/Give#136)", () => {
    expect(OWNER_MISMATCH_FOR_ORGANIZER).toBe(
      "Tài khoản nhận khoản tiền này không thuộc về người tổ chức của chiến dịch, nên giao dịch không khớp được. Hãy liên hệ đội ngũ Give để kiểm tra lại tài khoản nhận và chiến dịch."
    )
    expect(OWNER_MISMATCH_FOR_STAFF).toBe(
      "Tài khoản nhận khoản tiền này không thuộc về người tổ chức của chiến dịch, nên giao dịch không khớp được. Hãy báo quản trị viên kiểm tra lại tài khoản nhận và người tổ chức của chiến dịch trước khi xử lý giao dịch này."
    )
  })
})

describe("listUnattributed (DOS/Give#148)", () => {
  it("reads incoming transactions with no campaign, newest 100 first, with the total", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({ data: [{ id: "u", amount: "250000", source: "statement_import" }], count: 140 }),
      calls
    ) as unknown as Db
    expect(await listUnattributed(db)).toEqual({
      transactions: [{ id: "u", amount: 250000, source: "statement_import" }],
      total: 140,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe("bank_transactions")
    expect(calls[0].ops).toEqual(
      expect.arrayContaining([
        ["eq", "direction", "in"],
        ["is", "campaign_id", null],
        ["order", "booked_at", { ascending: false }],
        ["limit", 100],
      ])
    )
    expect(op(calls[0], "select")?.[1]).toEqual({ count: "exact" })
  })

  it("passes the read error on", async () => {
    const db = fakeDb(() => ({ error: { code: "42501", message: "denied" } })) as unknown as Db
    await expect(listUnattributed(db)).rejects.toMatchObject({ code: "42501" })
  })

  it("words where the money came from", () => {
    expect(transactionSourceLabel("statement_import")).toBe("sao kê tải lên")
    expect(transactionSourceLabel("something_new")).toBe("something_new")
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
    expect(await getIncoming(db, "t")).toMatchObject({
      amount: 150000,
      matched_to: null,
      explained_as: "interest",
      returned_of: null,
    })
    expect(String(op(calls[0], "select")?.[0])).toContain("inbound_explanations(kind, ")
    expect(String(op(calls[0], "select")?.[0])).toContain(
      "returned_transfers!bank_transaction_id(original_transaction_id)"
    )

    db = fakeDb(() => ({
      data: { ...row, transaction_matches: [{ contribution_id: "c" }], inbound_explanations: [] },
    })) as unknown as Db
    expect(await getIncoming(db, "t")).toMatchObject({ matched_to: "c", explained_as: null })

    db = fakeDb(() => ({
      data: { ...row, transaction_matches: null, returned_transfers: [{ original_transaction_id: "o1" }] },
    })) as unknown as Db
    expect(await getIncoming(db, "t")).toMatchObject({ returned_of: "o1" })
  })
})

describe("getIncoming with a corrected explanation (DOS/Give#71)", () => {
  it("prefers the correction: matched to its contribution, no longer explained", async () => {
    const row = { id: "t", campaign_id: CAMPAIGN, amount: "300000", direction: "in" }
    const calls: Call[] = []
    let db = fakeDb(
      () => ({
        data: {
          ...row,
          transaction_matches: { contribution_id: "c1" },
          inbound_explanations: {
            kind: "organizer_top_up",
            inbound_explanation_corrections: { contribution_id: "c1" },
          },
        },
      }),
      calls
    ) as unknown as Db
    expect(await getIncoming(db, "t")).toMatchObject({
      amount: 300000,
      matched_to: "c1",
      explained_as: null,
      corrected_to: "c1",
    })
    expect(String(op(calls[0], "select")?.[0])).toContain(
      "inbound_explanations(kind, inbound_explanation_corrections(contribution_id), inbound_explanation_returns(returned_at))"
    )

    // Arrays, and the correction wins even if the match were not visible.
    db = fakeDb(() => ({
      data: {
        ...row,
        transaction_matches: [],
        inbound_explanations: [{ kind: "interest", inbound_explanation_corrections: [{ contribution_id: "c2" }] }],
      },
    })) as unknown as Db
    expect(await getIncoming(db, "t")).toMatchObject({ matched_to: "c2", explained_as: null, corrected_to: "c2" })

    // Not corrected: still explained, not matched.
    db = fakeDb(() => ({
      data: {
        ...row,
        transaction_matches: null,
        inbound_explanations: { kind: "interest", inbound_explanation_corrections: null },
      },
    })) as unknown as Db
    expect(await getIncoming(db, "t")).toMatchObject({
      matched_to: null,
      explained_as: "interest",
      corrected_to: null,
      explanation_returned: false,
    })
  })
})

describe("getIncoming with a returned explanation (DOS/Give#196)", () => {
  const row = { id: "t", campaign_id: CAMPAIGN, amount: "300000", direction: "in" }

  it("is no longer explained: unmatched until matched, and flagged as returned", async () => {
    for (const returns of [{ returned_at: "2026-11-15T00:00:00Z" }, [{ returned_at: "2026-11-15T00:00:00Z" }]]) {
      const db = fakeDb(() => ({
        data: {
          ...row,
          transaction_matches: null,
          inbound_explanations: {
            kind: "organizer_top_up",
            inbound_explanation_corrections: null,
            inbound_explanation_returns: returns,
          },
        },
      })) as unknown as Db
      expect(await getIncoming(db, "t")).toMatchObject({
        matched_to: null,
        explained_as: null,
        corrected_to: null,
        explanation_returned: true,
      })
    }
  })

  it("keeps the match once the returned money is matched", async () => {
    const db = fakeDb(() => ({
      data: {
        ...row,
        transaction_matches: [{ contribution_id: "c3" }],
        inbound_explanations: [{ kind: "interest", inbound_explanation_returns: [{ returned_at: "x" }] }],
      },
    })) as unknown as Db
    expect(await getIncoming(db, "t")).toMatchObject({
      matched_to: "c3",
      explained_as: null,
      explanation_returned: true,
    })
  })

  it("is not returned without a return row (an empty embed)", async () => {
    const db = fakeDb(() => ({
      data: { ...row, inbound_explanations: { kind: "interest", inbound_explanation_returns: [] } },
    })) as unknown as Db
    expect(await getIncoming(db, "t")).toMatchObject({ explained_as: "interest", explanation_returned: false })
  })
})

describe("returning an explanation to unmatched (DOS/Give#196)", () => {
  const ME = "me"
  const open = { correction: null, returned: null, binding_released: false }
  const returned = { reason: "r", returned_at: "2026-11-15T00:00:00Z" }
  const correction = { contribution_id: "c", reason: "r", corrected_at: "x", contribution: null }

  it("offers nothing to non-admins, or once corrected or returned", () => {
    expect(returnToUnmatchedBlocked(open, { id: ME, isAdmin: false, organizerId: ME })).toBeNull()
    expect(returnToUnmatchedBlocked({ ...open, correction }, { id: ME, isAdmin: true, organizerId: ME })).toBeNull()
    expect(returnToUnmatchedBlocked({ ...open, returned }, { id: ME, isAdmin: true, explainerId: ME })).toBeNull()
    expect(explanationOpen(open)).toBe(true)
    expect(explanationOpen({ correction, returned: null })).toBe(false)
    expect(explanationOpen({ correction: null, returned })).toBe(false)
  })

  it("blocks the organizer, the explainer and a released binding, and lets another admin return it", () => {
    expect(returnToUnmatchedBlocked(open, { id: ME, isAdmin: true, organizerId: ME })).toContain(
      "Bạn là người tổ chức chiến dịch này"
    )
    expect(returnToUnmatchedBlocked(open, { id: ME, isAdmin: true, organizerId: "x", explainerId: ME })).toContain(
      "Bạn là người đã giải trình khoản này"
    )
    expect(
      returnToUnmatchedBlocked({ ...open, binding_released: true }, { id: ME, isAdmin: true, organizerId: "x" })
    ).toContain("Sửa giải trình")
    expect(returnToUnmatchedBlocked(open, { id: ME, isAdmin: true, organizerId: "x", explainerId: "y" })).toBeNull()
    // Unknown binding or explainer: the form stays and the database decides.
    expect(returnToUnmatchedBlocked({ ...open, binding_released: null }, { id: ME, isAdmin: true })).toBeNull()
  })

  it("hides the correction of a returned explanation", () => {
    expect(correctionBlocked({ correction: null, returned }, { id: ME, isAdmin: true, organizerId: ME })).toBeNull()
  })

  it("says the money can be matched but never explained again", () => {
    expect(RETURN_TO_UNMATCHED_EFFECT).toContain("khớp được với một lượt ủng hộ")
    expect(RETURN_TO_UNMATCHED_EFFECT).toContain('không giải trình lại được là "không phải tiền ủng hộ"')
  })

  it("says the paid total did not move when the money only moved back to unmatched", () => {
    const before = { received: 0, unmatched: 0, other: 300000, paid: 300000 }
    expect(paidAfterReturnToUnmatched(before, { received: 0, unmatched: 300000, other: 0, paid: 300000 })).toBe(
      vnd(
        " Tổng đã thanh toán không đổi: 300.000 ₫ (không phải tiền ủng hộ 300.000 ₫ → 0 ₫, chưa khớp 0 ₫ → 300.000 ₫)."
      )
    )
    expect(paidAfterReturnToUnmatched(before, { ...before, paid: 400000 })).toContain("trước khi đưa về")
    expect(paidAfterReturnToUnmatched(null, before)).toBe("")
  })
})

describe("correcting an explanation (DOS/Give#71)", () => {
  const ME = "me"
  const open = { correction: null }

  it("reads who explained each transaction from the audit log, skipping deleted actors", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          { entity_id: "t1", actor_id: "u1" },
          { entity_id: "t2", actor_id: null },
        ],
      }),
      calls
    ) as unknown as Db
    expect(await explainersOf(db, ["t1", "t2", "t1"])).toEqual(new Map([["t1", "u1"]]))
    expect(calls[0].target).toBe("audit_log")
    expect(calls[0].ops).toContainEqual(["eq", "action", "bank_transaction.explain_inbound"])
    expect(calls[0].ops).toContainEqual(["eq", "entity", "bank_transaction"])
    expect(op(calls[0], "in")).toEqual(["entity_id", ["t1", "t2"]])

    const none: Call[] = []
    expect(await explainersOf(fakeDb(() => ({ data: [] }), none) as unknown as Db, [])).toEqual(new Map())
    expect(none).toHaveLength(0)
  })

  it("offers the correction to admins only, never on their own campaign or explanation, and once", () => {
    const viewer = { id: ME, isAdmin: true, organizerId: "org", explainerId: "fin" }
    expect(correctionBlocked(open, viewer)).toBeNull()
    expect(correctionBlocked(open, { ...viewer, organizerId: ME })).toContain("người tổ chức chiến dịch này")
    expect(correctionBlocked(open, { ...viewer, explainerId: ME })).toContain("người đã giải trình khoản này")
    // Not an admin, or already corrected: nothing to block, the caller offers nothing.
    expect(correctionBlocked(open, { ...viewer, isAdmin: false, organizerId: ME })).toBeNull()
    const corrected = {
      correction: { contribution_id: "c", reason: "r", corrected_at: "2026-11-15T00:00:00Z", contribution: null },
    }
    expect(correctionBlocked(corrected, { ...viewer, organizerId: ME })).toBeNull()
  })

  it("leaves the admin's own contributions out of the candidates", () => {
    const c = (id: string, contributor_user_id: string | null) =>
      ({ id, contributor_user_id }) as unknown as Parameters<typeof correctionCandidates>[0][number]
    expect(correctionCandidates([c("a", ME), c("b", "other"), c("g", null)], ME).map((x) => x.id)).toEqual(["b", "g"])
  })

  it("says the paid total did not move: the money moves from not a donation to matched", () => {
    const before = { received: 500_000, unmatched: 0, other: 300_000, paid: 800_000 }
    const after = { received: 800_000, unmatched: 0, other: 0, paid: 800_000 }
    expect(paidAfterCorrect(before, after).replace(/\u00a0/g, " ")).toBe(
      " Tổng đã thanh toán không đổi: 800.000 ₫ (đã khớp 500.000 ₫ → 800.000 ₫, không phải tiền ủng hộ 300.000 ₫ → 0 ₫)."
    )
    expect(paidAfterCorrect(before, { ...after, paid: 900_000 })).toContain("trước khi sửa")
    expect(paidAfterCorrect(null, after)).toBe("")
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
    expect(explanations[0].correction).toBeNull()
    // The correction is read without corrected_by (never granted to clients).
    expect(String(op(calls[0], "select")?.[0])).toContain(
      "correction:inbound_explanation_corrections(contribution_id, reason, corrected_at, contribution:contributions(reference_code))"
    )
    expect(String(op(calls[0], "select")?.[0])).not.toContain("corrected_by")
    // The return is read without returned_by, and the binding's release with the transaction (DOS/Give#196).
    expect(String(op(calls[0], "select")?.[0])).toContain("returned:inbound_explanation_returns(reason, returned_at)")
    expect(String(op(calls[0], "select")?.[0])).not.toContain("returned_by")
    expect(String(op(calls[0], "select")?.[0])).toContain("binding:account_bindings!binding_id(released_at)")
    expect(explanations[0]).toMatchObject({ returned: null, binding_released: null })
    expect(explanations[0].tx).not.toHaveProperty("binding")
  })

  it("reads a return and the binding's release, as an object or an array (DOS/Give#196)", async () => {
    const ret = { reason: "Mai says it is hers", returned_at: "2026-11-15T00:00:00Z" }
    const db = fakeDb(() => ({
      data: [
        {
          bank_transaction_id: "a",
          kind: "interest",
          reason: "r",
          evidence: "e",
          explained_at: "2026-11-02T00:00:00Z",
          tx: { amount: "1", booked_at: "x", campaign_id: CAMPAIGN, binding: { released_at: null } },
          returned: ret,
        },
        {
          bank_transaction_id: "b",
          kind: "interest",
          reason: "r",
          evidence: "e",
          explained_at: "2026-11-01T00:00:00Z",
          tx: {
            amount: "2",
            booked_at: "x",
            campaign_id: CAMPAIGN,
            binding: [{ released_at: "2026-11-10T00:00:00Z" }],
          },
          returned: [],
        },
      ],
    })) as unknown as Db
    const [a, b] = await listInboundExplanations(db)
    expect(a).toMatchObject({ returned: ret, binding_released: false })
    expect(b).toMatchObject({ returned: null, binding_released: true })
  })

  it("reads a correction as an object or an array (DOS/Give#71)", async () => {
    const correction = {
      contribution_id: "c",
      reason: "Donor proof",
      corrected_at: "2026-11-15T00:00:00Z",
      contribution: [{ reference_code: "GV7K2M9QX" }],
    }
    const db = fakeDb(() => ({
      data: [
        {
          bank_transaction_id: "t",
          kind: "organizer_top_up",
          reason: "r",
          evidence: "e",
          explained_at: "2026-11-02T00:00:00Z",
          tx: { amount: "300000", booked_at: "2026-10-30T00:00:00Z", campaign_id: CAMPAIGN },
          correction: [correction],
        },
      ],
    })) as unknown as Db
    expect((await listInboundExplanations(db))[0].correction).toEqual({
      ...correction,
      contribution: { reference_code: "GV7K2M9QX" },
    })
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
    refunded_amount: 0,
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

  it("suggests a partially refunded pledge for its net amount due, not its gross remainder (DOS/Give#93)", () => {
    const pledge: MatchCandidate = {
      ...candidate,
      kind: "pledge",
      status: "partially_paid",
      intended_amount: 500_000,
      received_amount: 200_000,
      refunded_amount: 50_000,
    }
    // Net received is 150k, so 350k is really due (as give.pledge_payment computes).
    expect(waitsFor(pledge, 350_000)).toBe(true)
    expect(waitsFor(pledge, 300_000)).toBe(false)
    expect(waitsFor(pledge, 0)).toBe(false)
    expect(candidateLabel(pledge)).toBe(
      vnd("GV7K2M9QX · 500.000 ₫ (đã nhận 200.000 ₫, đã hoàn 50.000 ₫) · Nguyễn Văn A · đã trả một phần")
    )

    // A paid pledge that later received a partial compensation refund is already settled.
    expect(waitsFor({ ...pledge, status: "paid", received_amount: 500_000, refunded_amount: 50_000 }, 50_000)).toBe(
      false
    )

    // Refunded give donations keep status 'received' in the database, so they must not be suggested again.
    const refundedDonation: MatchCandidate = {
      ...candidate,
      kind: "donation",
      status: "received",
      intended_amount: 500_000,
      received_amount: 500_000,
      refunded_amount: 500_000,
    }
    expect(waitsFor(refundedDonation, 500_000)).toBe(false)
    expect(waitsFor({ ...refundedDonation, refunded_amount: 100_000 }, 100_000)).toBe(false)
    expect(waitsFor({ ...refundedDonation, received_amount: 600_000, refunded_amount: 200_000 }, 100_000)).toBe(false)
  })

  it("reads ledger refunds with match candidates and never falls back to gross (DOS/Give#93)", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          {
            ...candidate,
            id: "p1",
            kind: "pledge",
            status: "partially_paid",
            intended_amount: "500000",
            received_amount: "200000",
            refunds: [{ amount: "80000" }, { amount: -30000 }],
          },
          { ...candidate, id: "d1", refunds: [] },
        ],
      }),
      calls
    ) as unknown as Db
    const candidates = await listMatchCandidates(db, CAMPAIGN, STAFF_VIEWER)
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe("contributions")
    expect(String(op(calls[0], "select")?.[0])).toContain("refunds:ledger_entries!contribution_id(amount)")
    expect(calls[0].ops).toEqual(
      expect.arrayContaining([
        ["eq", "campaign_id", CAMPAIGN],
        ["eq", "refunds.bucket", "refunded"],
      ])
    )
    expect(candidates[0]).not.toHaveProperty("refunds")
    expect(candidates.map((c) => [c.id, c.intended_amount, c.received_amount, c.refunded_amount])).toEqual([
      ["p1", 500_000, 200_000, 50_000],
      ["d1", 200_000, 0, 0],
    ])
    expect(waitsFor(candidates[0], 350_000)).toBe(true)

    const missingRefunds = fakeDb(() => ({ data: [{ ...candidate, refunds: null }] })) as unknown as Db
    await expect(listMatchCandidates(missingRefunds, CAMPAIGN, STAFF_VIEWER)).rejects.toThrow(/ledger refunds/)

    const denied = fakeDb(() => ({ error: { code: "42501", message: "denied" } })) as unknown as Db
    await expect(listMatchCandidates(denied, CAMPAIGN, STAFF_VIEWER)).rejects.toMatchObject({ code: "42501" })
  })

  it("leaves the viewer's own contributions out of the match list, signed in or by guest email (DOS/Give#199)", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          { ...candidate, id: "mine", contributor_user_id: STAFF, guest_email: null, refunds: [] },
          {
            ...candidate,
            id: "guest-mine",
            contributor_user_id: null,
            guest_email: "  tai.chinh@GIVE.vn ",
            refunds: [],
          },
          { ...candidate, id: "guest", contributor_user_id: null, guest_email: "lan@example.vn", refunds: [] },
          { ...candidate, id: "user", contributor_user_id: OTHER, guest_email: null, refunds: [] },
        ],
      }),
      calls
    ) as unknown as Db
    const candidates = await listMatchCandidates(db, CAMPAIGN, STAFF_VIEWER)
    expect(candidates.map((c) => c.id)).toEqual(["guest", "user"])
    expect(String(op(calls[0], "select")?.[0])).toContain("guest_email")
    // The email is read only to filter: no page receives it.
    for (const c of candidates) expect(c).not.toHaveProperty("guest_email")
    // The organizer viewing their campaign: their signed-in contribution goes, the staff member's stays.
    const asOrganizer = await listMatchCandidates(db, CAMPAIGN, { id: OTHER, email: null })
    expect(asOrganizer.map((c) => c.id)).toEqual(["mine", "guest-mine", "guest"])
  })
})

describe("returned transfers (DOS/Give#72)", () => {
  const ACCOUNT = "55555555-5555-4555-8555-555555555555"
  const base: ReturnCandidate = {
    id: "o1",
    campaign_id: CAMPAIGN,
    receiving_account_id: ACCOUNT,
    asset: "VND",
    amount: 200_000,
    booked_at: "2026-11-08T03:00:00Z",
    booked_date_only: false,
    counterparty_account_masked: "****9999",
    is_refund: false,
    purpose: "Mua gạo",
    refund_reference_code: null,
  }
  const incoming = {
    campaign_id: CAMPAIGN,
    receiving_account_id: ACCOUNT,
    asset: "VND",
    amount: 200_000,
    booked_at: "2026-11-10T03:00:00Z",
  }

  it("reads explained, not yet returned outgoing transactions of one campaign", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          {
            ...base,
            amount: "200000",
            disbursement: { is_refund: true, purpose: "Hoàn tiền", refund: [{ reference_code: "GVAB12CD" }] },
            returned_transfers: null,
          },
          // Defensive: a row without its explanation is never offered.
          { ...base, id: "o2", disbursement: null, returned_transfers: null },
        ],
      }),
      calls
    ) as unknown as Db
    expect(await listReturnCandidates(db, CAMPAIGN, STAFF_VIEWER)).toEqual([
      { ...base, is_refund: true, purpose: "Hoàn tiền", refund_reference_code: "GVAB12CD" },
    ])
    const select = String(op(calls[0], "select")?.[0])
    expect(select).toContain("disbursement:disbursements!inner(")
    expect(select).toContain(
      "refund:contributions!refund_contribution_id(reference_code, contributor_user_id, guest_email)"
    )
    expect(select).toContain("returned_transfers!original_transaction_id(bank_transaction_id)")
    expect(calls[0].ops).toEqual(
      expect.arrayContaining([
        ["eq", "direction", "out"],
        ["eq", "campaign_id", CAMPAIGN],
        ["is", "returned_transfers", null],
        ["limit", RETURN_CANDIDATE_LIMIT],
      ])
    )
  })

  it("throws a read error", async () => {
    const db = fakeDb(() => ({ error: { code: "57014", message: "timeout" } })) as unknown as Db
    await expect(listReturnCandidates(db, CAMPAIGN, STAFF_VIEWER)).rejects.toMatchObject({ code: "57014" })
  })

  it("leaves out a refund to the viewer's own contribution, signed in or by guest email (DOS/Give#199)", async () => {
    const refund = (id: string, contribution: object | null) => ({
      ...base,
      id,
      amount: "200000",
      disbursement: { is_refund: true, purpose: "Hoàn tiền", refund: contribution },
      returned_transfers: null,
    })
    const db = fakeDb(() => ({
      data: [
        refund("own", { reference_code: "GVOWN", contributor_user_id: STAFF, guest_email: null }),
        refund("own-guest", [{ reference_code: "GVOG", contributor_user_id: null, guest_email: "TAI.CHINH@give.vn" }]),
        refund("other", { reference_code: "GVOTH", contributor_user_id: null, guest_email: "lan@example.vn" }),
        // Unreadable contribution: kept, and the database still refuses an own one.
        refund("unknown", null),
        // A payment has no contribution and is never left out.
        {
          ...base,
          id: "pay",
          amount: "200000",
          disbursement: { is_refund: false, purpose: "Mua gạo", refund: null },
          returned_transfers: null,
        },
      ],
    })) as unknown as Db
    const list = await listReturnCandidates(db, CAMPAIGN, STAFF_VIEWER)
    expect(list.map((c) => [c.id, c.refund_reference_code])).toEqual([
      ["other", "GVOTH"],
      ["unknown", null],
      ["pay", null],
    ])
    for (const c of list) expect(Object.keys(c)).not.toEqual(expect.arrayContaining(["guest_email"]))
  })

  it("offers only what the database would accept: campaign, account, asset, amount and local day", () => {
    const fits = (c: Partial<ReturnCandidate>, tx = incoming) =>
      returnCandidatesFor(tx, [{ ...base, ...c }]).length === 1
    expect(fits({})).toBe(true)
    expect(fits({ amount: 250_000 })).toBe(true) // the bank kept a fee
    expect(fits({ amount: 199_999 })).toBe(false)
    expect(fits({ campaign_id: OTHER })).toBe(false)
    expect(fits({ receiving_account_id: OTHER })).toBe(false)
    expect(fits({ asset: "USDT" })).toBe(false)
    expect(fits({ booked_at: "2026-11-10T03:00:00Z" })).toBe(true) // same moment
    // Same local day in Vietnam (UTC+7), later hour: still accepted, as the database compares days.
    expect(fits({ booked_at: "2026-11-10T16:59:00Z" }, { ...incoming, booked_at: "2026-11-09T17:00:00Z" })).toBe(true)
    // The next local day: refused.
    expect(fits({ booked_at: "2026-11-10T17:00:00Z" }, { ...incoming, booked_at: "2026-11-10T16:59:00Z" })).toBe(false)
  })

  it("labels a candidate by amount, local day, kind and purpose", () => {
    expect(returnCandidateLabel(base)).toBe(vnd("−200.000 ₫ · 08/11/2026 · Khoản chi · Mua gạo"))
    expect(
      returnCandidateLabel({
        ...base,
        booked_at: "2026-11-08T18:00:00Z",
        is_refund: true,
        refund_reference_code: "GVAB12CD",
        purpose: "x".repeat(80),
      })
    ).toBe(vnd(`−200.000 ₫ · 09/11/2026 · Hoàn tiền GVAB12CD · ${"x".repeat(59)}…`))
    expect(returnCandidateLabel({ ...base, is_refund: true })).toContain("· Hoàn tiền · Mua gạo")
  })

  it("says the paid total dropped by the returned amount, or that something else moved too", () => {
    const before = { received: 500_000, unmatched: 200_000, other: 0, paid: 700_000 }
    expect(paidAfterReturn(before, { received: 500_000, unmatched: 0, other: 0, paid: 500_000 }, 200_000)).toBe(
      vnd(
        " Tổng đã thanh toán giảm từ 700.000 ₫ xuống 500.000 ₫ (chưa khớp 200.000 ₫ → 0 ₫): tiền bị trả lại là tiền của chiến dịch quay về, không phải tiền ủng hộ mới."
      )
    )
    expect(paidAfterReturn(before, { received: 500_000, unmatched: 50_000, other: 0, paid: 550_000 }, 200_000)).toBe(
      vnd(
        " Tổng đã thanh toán hiện là 550.000 ₫ (trước khi ghi nhận: 700.000 ₫; có giao dịch khác vừa được ghi cùng lúc)."
      )
    )
    expect(paidAfterReturn(null, before, 1)).toBe("")
  })

  it("reads the latest links with both transactions and never linked_by", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          {
            bank_transaction_id: "i1",
            original_transaction_id: "o1",
            reason: "Sai số tài khoản",
            evidence: "Thư ngân hàng",
            linked_at: "2026-11-12T00:00:00Z",
            tx: { amount: "190000", booked_at: "2026-11-10T00:00:00Z", campaign_id: CAMPAIGN },
            original: { amount: "200000", booked_at: "2026-11-08T00:00:00Z", disbursement: [{ is_refund: true }] },
          },
          {
            bank_transaction_id: "i2",
            original_transaction_id: "o2",
            reason: "r",
            evidence: "e",
            linked_at: "2026-11-11T00:00:00Z",
            tx: { amount: 1, booked_at: "2026-11-10T00:00:00Z", campaign_id: CAMPAIGN },
            original: null,
          },
        ],
      }),
      calls
    ) as unknown as Db
    const returns = await listReturnedTransfers(db)
    expect(returns[0]).toEqual({
      bank_transaction_id: "i1",
      original_transaction_id: "o1",
      reason: "Sai số tài khoản",
      evidence: "Thư ngân hàng",
      linked_at: "2026-11-12T00:00:00Z",
      tx: { amount: 190_000, booked_at: "2026-11-10T00:00:00Z", campaign_id: CAMPAIGN },
      original: { amount: 200_000, booked_at: "2026-11-08T00:00:00Z", is_refund: true },
    })
    expect(returns[1].original).toBeNull()
    expect(calls[0].target).toBe("returned_transfers")
    const select = String(op(calls[0], "select")?.[0])
    expect(select).toContain("tx:bank_transactions!bank_transaction_id!inner(")
    expect(select).toContain("original:bank_transactions!original_transaction_id(")
    expect(select).not.toContain("linked_by")
    expect(op(calls[0], "order")).toEqual(["linked_at", { ascending: false }])
  })
})
