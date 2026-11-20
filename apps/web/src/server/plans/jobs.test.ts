import { afterEach, describe, expect, it, vi } from "vitest"

import type { Db } from "@/lib/campaigns"
import { fakeDb, op, type Call } from "@/test/fake-db"

import { expirePlanDonations, PlanJobError, sweepPlans } from "./jobs"

const ids = [
  "10000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003",
]

afterEach(() => {
  vi.restoreAllMocks()
})

/** A database whose job hands out the plans after p_after, one per call, like give.issue_plan_donations. */
function plans(outcomes: Record<string, string>, calls: Call[] = []) {
  return fakeDb((call) => {
    const after = (op(call, "args")?.[0] as { p_after: string | null }).p_after
    const next = ids.find((id) => after === null || id > after)
    return { data: next ? [{ plan_id: next, outcome: outcomes[next] }] : [] }
  }, calls) as unknown as Db
}

describe("sweepPlans", () => {
  it("passes each plan id back as p_after, so the run sweeps once and stops", async () => {
    const calls: Call[] = []
    const sweep = await sweepPlans(
      plans({ [ids[0]]: "issued", [ids[1]]: "skipped", [ids[2]]: "issued" }, calls),
      "issue_plan_donations"
    )
    expect(sweep).toEqual({ outcomes: { issued: 2, skipped: 1 }, calls: 4, done: true })
    expect(calls.map((c) => (op(c, "args")?.[0] as { p_after: string | null }).p_after)).toEqual([null, ...ids])
    expect(calls.every((c) => c.target === "rpc:issue_plan_donations")).toBe(true)
  })

  it("stops when the budget is spent and says it is not done", async () => {
    let clock = 0
    const db = plans({ [ids[0]]: "noticed", [ids[1]]: "noticed", [ids[2]]: "noticed" })
    const sweep = await sweepPlans(db, "plan_end_notices", () => (clock += 20), 50)
    expect(sweep.done).toBe(false)
    expect(sweep.calls).toBe(2)
  })

  it("steps past a plan whose call fails, logs it, and handles the plans after it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const calls: Call[] = []
    // ids[1] always fails; the job hands out the first plan after p_after.
    const db = fakeDb((call) => {
      if (call.target === "donation_plans") {
        const after = op(call, "gt")?.[1] as string | undefined
        return {
          data: ids
            .filter((id) => after === undefined || id > after)
            .slice(0, 1)
            .map((id) => ({ id })),
        }
      }
      const after = (op(call, "args")?.[0] as { p_after: string | null }).p_after
      const next = ids.find((id) => after === null || id > after)
      if (next === ids[1]) return { error: { code: "XX000", message: "boom" } }
      return { data: next ? [{ plan_id: next, outcome: "issued" }] : [] }
    }, calls) as unknown as Db
    const sweep = await sweepPlans(db, "issue_plan_donations")
    expect(sweep).toEqual({ outcomes: { issued: 2, failed: 1 }, calls: 4, done: true })
    expect(error.mock.calls.some((args) => args.some((a) => String(a).includes(`skipping plan ${ids[1]}`)))).toBe(true)
  })

  it("gives up after repeated failures in a row (the database, not a plan)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const failing = fakeDb((call) =>
      call.target === "donation_plans" ? { data: [{ id: ids[0] }] } : { error: { code: "57014", message: "timeout" } }
    ) as unknown as Db
    await expect(sweepPlans(failing, "plan_followups")).rejects.toBeInstanceOf(PlanJobError)
  })

  it("throws on an unexpected answer, or when it cannot find the plan to skip", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const lost = fakeDb((call) =>
      call.target === "donation_plans" ? { error: { code: "57014", message: "timeout" } } : { error: { code: "XX000" } }
    ) as unknown as Db
    await expect(sweepPlans(lost, "plan_followups")).rejects.toBeInstanceOf(PlanJobError)
    for (const data of [null, [{ plan_id: "x", outcome: "issued" }], [{ plan_id: ids[0], outcome: 3 }], "1"]) {
      const odd = fakeDb(() => ({ data })) as unknown as Db
      await expect(sweepPlans(odd, "plan_followups")).rejects.toBeInstanceOf(PlanJobError)
    }
  })

  it("refuses to revisit a plan (an answer that does not move past p_after)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const stuck = fakeDb(() => ({ data: [{ plan_id: ids[0], outcome: "skipped" }] })) as unknown as Db
    await expect(sweepPlans(stuck, "issue_plan_donations")).rejects.toBeInstanceOf(PlanJobError)
  })
})

describe("expirePlanDonations", () => {
  it("returns the count and throws on failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await expirePlanDonations(fakeDb(() => ({ data: 3 })) as unknown as Db)).toBe(3)
    await expect(expirePlanDonations(fakeDb(() => ({ data: "3" })) as unknown as Db)).rejects.toBeInstanceOf(
      PlanJobError
    )
    await expect(
      expirePlanDonations(fakeDb(() => ({ error: { code: "XX000", message: "x" } })) as unknown as Db)
    ).rejects.toBeInstanceOf(PlanJobError)
  })
})

describe("remainingBudget", () => {
  it("is what is left of the run's 45 s, never negative", async () => {
    const { remainingBudget, PLAN_JOB_BUDGET_MS } = await import("./jobs")
    expect(remainingBudget(1_000, () => 1_000)).toBe(PLAN_JOB_BUDGET_MS)
    expect(remainingBudget(1_000, () => 41_000)).toBe(5_000)
    expect(remainingBudget(1_000, () => 99_000)).toBe(0)
  })

  it("gives a sweep with no budget left no call at all", async () => {
    const calls: Call[] = []
    const sweep = await sweepPlans(plans({}, calls), "plan_followups", Date.now, 0)
    expect(sweep).toEqual({ outcomes: {}, calls: 0, done: false })
    expect(calls).toHaveLength(0)
  })
})
