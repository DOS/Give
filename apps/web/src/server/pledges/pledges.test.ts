import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  listPublicTiers,
  organizesCampaign,
  ownPledgeByCode,
  PLEDGE_COLUMNS,
  loadPledgeMoney,
  pledgeBalances,
  pledgePayment,
} from "./index"

const USER = "11111111-1111-4111-8111-111111111111"
const PLEDGE = "33333333-3333-4333-8333-333333333333"

const paymentRow = {
  reference_code: "GVABCDEFG",
  status: "partially_paid",
  intended_amount: "500000",
  received_amount: 200_000,
  amount_due: "300000",
  payment_due_at: "2026-11-10T00:00:00Z",
  channel: "bank",
  bank_bin: "970436",
  account_number: "0123456789",
  account_name: "NGUYEN VAN A",
}

describe("pledgePayment", () => {
  it("asks give.pledge_payment for the backer's own pledge and converts the amounts", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: paymentRow }), calls)
    expect(await pledgePayment(db as never, PLEDGE, USER)).toEqual({
      reference_code: "GVABCDEFG",
      status: "partially_paid",
      intended_amount: 500_000,
      received_amount: 200_000,
      amount_due: 300_000,
      payment_due_at: "2026-11-10T00:00:00Z",
      account: { bank_bin: "970436", account_number: "0123456789", account_name: "NGUYEN VAN A" },
    })
    expect(calls[0].target).toBe("rpc:pledge_payment")
    expect(op(calls[0], "args")).toEqual([{ p_contribution_id: PLEDGE, p_user_id: USER }])
  })

  it.each([
    ["no usable account", { bank_bin: null, account_number: null, channel: null }],
    ["a wallet", { channel: "crypto" }],
  ])("shows no payment details for %s", async (_name, values) => {
    const db = fakeDb(() => ({ data: { ...paymentRow, ...values } }))
    expect((await pledgePayment(db as never, PLEDGE, USER))?.account).toBeNull()
  })

  it("returns null when the pledge is not waiting for payment, and throws database errors", async () => {
    expect(await pledgePayment(fakeDb(() => ({ data: null })) as never, PLEDGE, USER)).toBeNull()
    await expect(
      pledgePayment(fakeDb(() => ({ error: { code: "42501", message: "denied" } })) as never, PLEDGE, USER)
    ).rejects.toMatchObject({ code: "42501" })
  })
})

const balanceRow = {
  contribution_id: PLEDGE,
  status: "partially_paid",
  received_amount: "100000",
  refunded_amount: 50_000,
  amount_due: "150000",
  refund_owed_amount: 0,
  payments_stopped: false,
}

describe("pledgeBalances", () => {
  it("asks give.pledge_balances for the backer's pledges and converts the amounts", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [balanceRow] }), calls)
    expect((await pledgeBalances(db as never, USER, PLEDGE)).get(PLEDGE)).toEqual({
      status: "partially_paid",
      received_amount: 100_000,
      refunded_amount: 50_000,
      amount_due: 150_000,
      refund_owed_amount: 0,
      payments_stopped: false,
    })
    expect(calls[0].target).toBe("rpc:pledge_balances")
    expect(op(calls[0], "args")).toEqual([{ p_user_id: USER, p_contribution_id: PLEDGE }])
    await pledgeBalances(db as never, USER)
    expect(op(calls[1], "args")).toEqual([{ p_user_id: USER, p_contribution_id: null }])
  })

  it("throws database errors", async () => {
    await expect(
      pledgeBalances(fakeDb(() => ({ error: { code: "42501", message: "denied" } })) as never, USER)
    ).rejects.toMatchObject({ code: "42501" })
  })
})

describe("loadPledgeMoney (the payment page, DOS/Give#89)", () => {
  const waiting = { id: PLEDGE, status: "partially_paid" }

  it("never asks for the payment details while payment requests are stopped", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      (call) => (call.target === "rpc:pledge_payment" ? { data: paymentRow } : { data: [balanceRow] }),
      calls
    )
    const money = await loadPledgeMoney(db as never, waiting, { payments_stopped_at: "2026-11-05T00:00:00Z" }, USER)
    expect(money.payment).toBeNull()
    expect(money.balance?.amount_due).toBe(150_000)
    expect(calls.map((c) => c.target)).toEqual(["rpc:pledge_balances"])
  })

  it("reads the payment details of a pledge waiting for payment when not stopped", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      (call) => (call.target === "rpc:pledge_payment" ? { data: paymentRow } : { data: [balanceRow] }),
      calls
    )
    const money = await loadPledgeMoney(db as never, waiting, { payments_stopped_at: null }, USER)
    expect(money.payment?.account?.account_number).toBe("0123456789")
    expect(calls.map((c) => c.target).sort()).toEqual(["rpc:pledge_balances", "rpc:pledge_payment"])
  })

  it("skips the payment details for a paid pledge, and a failed balance read gives null", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ error: { code: "XX000", message: "boom" } }), calls)
    const money = await loadPledgeMoney(
      db as never,
      { id: PLEDGE, status: "paid" },
      { payments_stopped_at: null },
      USER
    )
    expect(money).toEqual({ payment: null, balance: null })
    expect(calls.map((c) => c.target)).toEqual(["rpc:pledge_balances"])
  })
})

describe("organizesCampaign", () => {
  it("is true only for the campaign's own organizer", async () => {
    const calls: Call[] = []
    expect(await organizesCampaign(fakeDb(() => ({ data: { organizer_id: USER } }), calls) as never, "c", USER)).toBe(
      true
    )
    expect(op(calls[0], "args")).toEqual([{ p_campaign_id: "c" }])
    // Staff see other organizers' campaigns in managed_campaigns too.
    expect(await organizesCampaign(fakeDb(() => ({ data: { organizer_id: "other" } })) as never, "c", USER)).toBe(false)
    expect(await organizesCampaign(fakeDb(() => ({ data: null })) as never, "c", USER)).toBe(false)
    expect(await organizesCampaign(fakeDb(() => ({ error: { code: "PGRST301" } })) as never, "c", USER)).toBe(false)
  })
})

describe("reads", () => {
  it("reads the backer's own pledge by code with an explicit column list", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: { id: PLEDGE, intended_amount: "500000", received_amount: "0" } }), calls)
    const pledge = await ownPledgeByCode(db as never, USER, "GVABCDEFG")
    expect(pledge?.intended_amount).toBe(500_000)
    expect(op(calls[0], "select")).toEqual([PLEDGE_COLUMNS])
    expect(PLEDGE_COLUMNS).not.toContain("*")
    const filters = calls[0].ops.filter(([name]) => name === "eq")
    expect(filters).toEqual([
      ["eq", "reference_code", "GVABCDEFG"],
      ["eq", "kind", "pledge"],
      ["eq", "contributor_user_id", USER],
    ])
  })

  it("lists a campaign's public tiers in the creator's order, unlimited ones with no remaining count", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          { id: "a", min_amount: "200000", quantity_limit: null, quantity_claimed: 3, quantity_remaining: null },
          { id: "b", min_amount: 500_000, quantity_limit: "10", quantity_claimed: "10", quantity_remaining: "0" },
        ],
      }),
      calls
    )
    const tiers = await listPublicTiers(db as never, "c")
    expect(calls[0].target).toBe("public_reward_tiers")
    expect(tiers.map((t) => [t.min_amount, t.quantity_limit, t.quantity_remaining])).toEqual([
      [200_000, null, null],
      [500_000, 10, 0],
    ])
    expect(calls[0].ops.filter(([name]) => name === "order").map(([, column]) => column)).toEqual(["sort_order", "id"])
  })
})
