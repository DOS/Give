import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

import type { Db } from "./campaigns"
import { listOwnTransfers, listSwapTransfers, pairCandidates, sentElsewhere, type TransferLeg } from "./own-transfers"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const OTHER_CAMPAIGN = "33333333-3333-4333-8333-333333333333"
const OLD_B = "b0000000-0000-4000-8000-000000000001"
const NEW_B = "b0000000-0000-4000-8000-000000000002"
const EARLY_B = "b0000000-0000-4000-8000-000000000003"
const OLD_ACC = "a0000000-0000-4000-8000-000000000001"
const NEW_ACC = "a0000000-0000-4000-8000-000000000002"

const account = (id: string) => ({
  owner_user_id: "u",
  channel: "bank",
  bank_bin: "970436",
  account_number: id,
  account_name: "NGUYEN VAN A",
})

const swapRow = {
  id: "s1",
  campaign_id: CAMPAIGN,
  old_binding_id: OLD_B,
  new_binding_id: NEW_B,
  decided_at: "2026-11-10T03:00:00Z",
  campaign: { id: CAMPAIGN, slug: "a", title: "A", status: "live", type: "give" },
  old_binding: { id: OLD_B, receiving_account_id: OLD_ACC, released_at: "2026-11-10T03:00:00Z", account: account("1") },
  // Some PostgREST setups send a to-one embed as a one-row array.
  new_binding: [{ id: NEW_B, receiving_account_id: NEW_ACC, bound_at: "2026-11-10T03:00:00Z", account: account("2") }],
}

function leg(id: string, over: Partial<TransferLeg> = {}): Record<string, unknown> {
  return {
    id,
    campaign_id: CAMPAIGN,
    binding_id: OLD_B,
    amount: "3000000",
    asset: "VND",
    booked_at: "2026-11-11T02:00:00Z",
    booked_date_only: false,
    description: null,
    counterparty_name: null,
    counterparty_account_masked: null,
    disbursements: null,
    own_out: null,
    ...over,
  }
}

function db(handler: Handler, calls: Call[]) {
  return fakeDb(handler, calls) as unknown as Db
}

describe("listSwapTransfers", () => {
  it("lists open outgoing legs of each approved swap's old binding with the incoming candidates", async () => {
    const calls: Call[] = []
    const result = await listSwapTransfers(
      db((call) => {
        if (call.target === "account_swap_requests") return { data: [swapRow] }
        if (op(call, "eq")?.[1] === "out") return { data: [leg("out1")] }
        return {
          data: [
            leg("in1", { binding_id: NEW_B }),
            leg("in-elsewhere", { binding_id: NEW_B, campaign_id: OTHER_CAMPAIGN }),
          ],
        }
      }, calls)
    )
    expect(calls[0].target).toBe("account_swap_requests")
    expect(op(calls[0], "eq")).toEqual(["status", "approved"])
    expect(String(op(calls[0], "select")?.[0])).toContain("account_bindings!account_swap_requests_new_binding_id_fkey(")

    const [outs, ins] = [calls[1], calls[2]]
    expect(op(outs, "in")).toEqual(["binding_id", [OLD_B]])
    expect(outs.ops.filter(([n]) => n === "is").map((o) => o.slice(1))).toEqual([
      ["disbursements", null],
      ["own_out", null],
    ])
    expect(op(ins, "in")).toEqual(["binding_id", [NEW_B]])
    expect(ins.ops.filter(([n]) => n === "is").map((o) => o.slice(1))).toEqual([
      ["transaction_matches", null],
      ["inbound_explanations", null],
      ["own_in", null],
    ])

    expect(result).toHaveLength(1)
    expect(result[0].old_account?.account_number).toBe("1")
    expect(result[0].new_account?.account_number).toBe("2")
    expect(result[0].target_account_numbers).toEqual(["2"])
    expect(result[0].outs.map((t) => [t.id, t.amount])).toEqual([["out1", 3_000_000]])
    // Only the same campaign's legs; extra embed columns are not carried along.
    expect(result[0].ins.map((t) => t.id)).toEqual(["in1"])
    expect(result[0].outs[0]).not.toHaveProperty("own_out")
  })

  it("only offers incoming legs on a binding a swap started at or after the old one ended", async () => {
    const early = {
      ...swapRow,
      id: "s0",
      old_binding_id: "b-older",
      new_binding_id: EARLY_B,
      old_binding: { ...swapRow.old_binding, id: "b-older", released_at: "2026-11-01T00:00:00Z" },
      new_binding: { id: EARLY_B, receiving_account_id: "a-x", bound_at: "2026-11-01T00:00:00Z", account: null },
    }
    const result = await listSwapTransfers(
      db((call) => {
        if (call.target === "account_swap_requests") return { data: [swapRow, early] }
        if (op(call, "eq")?.[1] === "out") return { data: [leg("out1")] }
        return { data: [leg("in-early", { binding_id: EARLY_B }), leg("in-new", { binding_id: NEW_B })] }
      }, [])
    )
    // s1's old binding ended on 10 Nov: EARLY_B (bound on 1 Nov) is not its new account; s0 has nothing open.
    expect(result.map((s) => [s.swap_id, s.ins.map((t) => t.id)])).toEqual([["s1", ["in-new"]]])
  })

  it("never offers an incoming leg on the old account itself", async () => {
    const back = { ...swapRow, new_binding: { ...swapRow.new_binding[0], receiving_account_id: OLD_ACC } }
    const result = await listSwapTransfers(
      db((call) => {
        if (call.target === "account_swap_requests") return { data: [back] }
        if (op(call, "eq")?.[1] === "out") return { data: [leg("out1")] }
        return { data: [leg("in1", { binding_id: NEW_B })] }
      }, [])
    )
    expect(result[0].ins).toEqual([])
  })

  it("leaves out swaps with nothing open and reads no transactions without swaps", async () => {
    const calls: Call[] = []
    expect(await listSwapTransfers(db(() => ({ data: [] }), calls))).toEqual([])
    expect(calls).toHaveLength(1)
    const result = await listSwapTransfers(
      db((call) => (call.target === "account_swap_requests" ? { data: [swapRow] } : { data: [] }), [])
    )
    expect(result).toEqual([])
  })

  it("throws database errors", async () => {
    await expect(
      listSwapTransfers(
        db(
          (call) => (call.target === "account_swap_requests" ? { data: [swapRow] } : { error: { message: "boom" } }),
          []
        )
      )
    ).rejects.toEqual({ message: "boom" })
  })
})

describe("pairCandidates", () => {
  const base = leg("out") as unknown as TransferLeg
  const out = { ...base, amount: 3_000_000 }
  const inLeg = (id: string, over: Partial<TransferLeg>) => ({ ...base, id, amount: 3_000_000, ...over })

  it("offers only the same amount and asset, closest booking first", () => {
    const ins = [
      inLeg("far", { booked_at: "2026-11-20T00:00:00Z" }),
      inLeg("near", { booked_at: "2026-11-11T03:00:00Z" }),
      inLeg("other-amount", { amount: 2_999_999 }),
      inLeg("other-asset", { asset: "USDT" }),
    ]
    expect(pairCandidates(out, ins).map((t) => t.id)).toEqual(["near", "far"])
  })
})

describe("listOwnTransfers", () => {
  it("reads marked pairs newest first, never who marked them", async () => {
    const calls: Call[] = []
    const rows = await listOwnTransfers(
      db(
        () => ({
          data: [
            {
              id: "p",
              campaign_id: CAMPAIGN,
              reason: "Sao kê hai tài khoản",
              marked_at: "2026-11-12T00:00:00Z",
              campaign: [{ slug: "a", title: "A" }],
              out_tx: { amount: "3000000", asset: "VND", booked_at: "x", booked_date_only: false },
              in_tx: [{ booked_at: "y", booked_date_only: true }],
            },
          ],
        }),
        calls
      )
    )
    expect(calls[0].target).toBe("own_account_transfers")
    expect(String(op(calls[0], "select")?.[0])).not.toContain("marked_by")
    expect(op(calls[0], "order")).toEqual(["marked_at", { ascending: false }])
    expect(rows[0].campaign).toEqual({ slug: "a", title: "A" })
    expect(rows[0].out_tx?.amount).toBe(3_000_000)
    expect(rows[0].in_tx).toEqual({ booked_at: "y", booked_date_only: true })
  })
})

describe("sentElsewhere", () => {
  it("warns only when the bank names another destination than the new account", () => {
    expect(sentElsewhere("****5602", ["0090212345602"])).toBe(false)
    expect(sentElsewhere("****9999", ["0090212345602"])).toBe(true)
    // A chain of swaps A -> B -> C: money from A straight to C is not "elsewhere".
    expect(sentElsewhere("****0003", ["0090212345602", "0011000000003"])).toBe(false)
    // Nothing to compare: no warning.
    expect(sentElsewhere(null, ["0090212345602"])).toBe(false)
    expect(sentElsewhere("****", ["0090212345602"])).toBe(false)
    expect(sentElsewhere("****5602", [])).toBe(false)
  })
})
