import { describe, expect, it } from "vitest"

import type { Db } from "@/lib/campaigns"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

import { listCampaignsWithUnexplainedOutgoing } from "./staff-refunds"

const A = "22222222-2222-4222-8222-222222222222"
const B = "33333333-3333-4333-8333-333333333333"

function db(rows: unknown[], campaigns: unknown[] = []) {
  const calls: Call[] = []
  const handler: Handler = (call) => {
    if (call.target === "bank_transactions") return { data: rows }
    if (call.target === "rpc:managed_campaigns") return { data: campaigns }
    return undefined
  }
  return { db: fakeDb(handler, calls) as unknown as Db, calls }
}

describe("listCampaignsWithUnexplainedOutgoing", () => {
  it("reads only unexplained transfers out that are not a move between own accounts, oldest first", async () => {
    const { db: client, calls } = db([])
    await listCampaignsWithUnexplainedOutgoing(client, 10)
    const query = calls[0]
    expect(query.target).toBe("bank_transactions")
    expect(op(query, "eq")).toEqual(["direction", "out"])
    expect(query.ops.filter(([name]) => name === "is")).toEqual([
      ["is", "disbursements", null],
      ["is", "own_out", null],
    ])
    expect(op(query, "select")?.[0]).toContain("own_out:own_account_transfers!out_transaction_id(id)")
    expect(op(query, "order")).toEqual(["booked_at", { ascending: true }])
    expect(op(query, "limit")).toEqual([10])
    // No campaign to name: no second read.
    expect(calls).toHaveLength(1)
  })

  it("groups by campaign in waiting order, leaves out transfers the bank returned and names each campaign", async () => {
    const { db: client, calls } = db(
      [
        { campaign_id: B, amount: "100000", booked_at: "2026-10-01T00:00:00+00:00", returned: [] },
        { campaign_id: A, amount: 200_000, booked_at: "2026-10-02T00:00:00+00:00", returned: null },
        { campaign_id: A, amount: 50_000, booked_at: "2026-10-03T00:00:00+00:00", returned: [{ id: "r" }] },
        { campaign_id: B, amount: 300_000, booked_at: "2026-10-04T00:00:00+00:00", returned: [] },
        { campaign_id: A, amount: 1_000, booked_at: "2026-10-05T00:00:00+00:00" },
      ],
      [
        { id: A, title: "Quỹ A", status: "live" },
        { id: B, title: "Quỹ B", status: "ended" },
      ]
    )
    const { campaigns, truncated } = await listCampaignsWithUnexplainedOutgoing(client, 10)
    expect(truncated).toBe(false)
    expect(campaigns).toEqual([
      {
        campaign_id: B,
        title: "Quỹ B",
        status: "ended",
        count: 2,
        amount: 400_000,
        oldest_booked_at: "2026-10-01T00:00:00+00:00",
      },
      {
        campaign_id: A,
        title: "Quỹ A",
        status: "live",
        count: 2,
        amount: 201_000,
        oldest_booked_at: "2026-10-02T00:00:00+00:00",
      },
    ])
    expect(op(calls[1], "in")).toEqual(["id", [B, A]])
  })

  it("says when the read hit its limit", async () => {
    const { db: client } = db([{ campaign_id: A, amount: 1, booked_at: "2026-10-01T00:00:00+00:00" }])
    expect((await listCampaignsWithUnexplainedOutgoing(client, 1)).truncated).toBe(true)
  })

  it("throws a read error", async () => {
    const client = fakeDb(() => ({ error: { code: "PGRST301", message: "JWT expired" } })) as unknown as Db
    await expect(listCampaignsWithUnexplainedOutgoing(client)).rejects.toMatchObject({ code: "PGRST301" })
  })
})
