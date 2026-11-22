import { afterEach, describe, expect, it, vi } from "vitest"

import type { Db } from "@/lib/campaigns"
import { fakeDb, op, type Call } from "@/test/fake-db"

import { EXPIRE_BATCH_SIZE, expirePlanDonations, logPlanCronFailures, PlanJobError, sweepPlans } from "./jobs"

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

  it("counts a plan the database answers as failed, logs a structured zero-PII error, and goes on to the plans after it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const calls: Call[] = []
    const sweep = await sweepPlans(
      plans({ [ids[0]]: "issued", [ids[1]]: "failed", [ids[2]]: "issued" }, calls),
      "issue_plan_donations"
    )
    expect(sweep).toEqual({ outcomes: { issued: 2, failed: 1 }, calls: 4, done: true })
    expect(calls.some((c) => c.target === "donation_plans")).toBe(false)
    expect(error).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(error.mock.calls[0][0]))).toEqual({
      event: "plan_job.plan_failed",
      job: "issue_plan_donations",
      plan_id: ids[1],
    })
  })

  it("throws when the call itself fails (connection, timeout, thrown) or answers unexpectedly without logging error.message PII", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const failing = fakeDb(() => ({
      error: { code: "57014", message: "donor@example.com timeout" },
    })) as unknown as Db
    await expect(sweepPlans(failing, "plan_followups")).rejects.toBeInstanceOf(PlanJobError)
    const logged = JSON.parse(String(error.mock.calls[0][0])) as Record<string, unknown>
    expect(logged).toEqual({
      event: "plan_job.rpc_error",
      job: "plan_followups",
      after: null,
      code: "57014",
    })
    expect(JSON.stringify(logged)).not.toContain("donor@example.com")

    const throwing = {
      rpc: () => ({
        abortSignal: () =>
          Promise.reject(Object.assign(new Error("aborted donor@example.com"), { name: "TimeoutError" })),
      }),
    } as unknown as Db
    await expect(sweepPlans(throwing, "plan_followups")).rejects.toBeInstanceOf(PlanJobError)

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

describe("logPlanCronFailures", () => {
  it("logs a structured zero-PII error only when failed outcomes are present", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    logPlanCronFailures("issue-plan-donations", "issue_plan_donations", {
      outcomes: { issued: 3, skipped: 1 },
      calls: 5,
      done: true,
    })
    expect(error).not.toHaveBeenCalled()

    logPlanCronFailures("issue-plan-donations", "issue_plan_donations", {
      outcomes: { issued: 2, failed: 3 },
      calls: 6,
      done: true,
    })
    expect(error).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(error.mock.calls[0][0]))).toEqual({
      event: "plan_cron.failed_outcomes",
      route: "issue-plan-donations",
      job: "issue_plan_donations",
      failed: 3,
      calls: 6,
      done: true,
    })
  })
})

describe("expirePlanDonations", () => {
  it("expires a partial batch in one call and marks done", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: 3 }), calls) as unknown as Db
    expect(await expirePlanDonations(db)).toEqual({
      expired: 3,
      batches: 1,
      done: true,
      stalled: false,
      failed: false,
    })
    expect(calls.map((c) => c.target)).toEqual(["rpc:expire_plan_donations"])
  })

  it("drains multiple full batches within the budget", async () => {
    const counts = [EXPIRE_BATCH_SIZE, EXPIRE_BATCH_SIZE, 12]
    let i = 0
    const db = fakeDb(() => ({ data: counts[i++] ?? 0 })) as unknown as Db
    expect(await expirePlanDonations(db)).toEqual({
      expired: EXPIRE_BATCH_SIZE * 2 + 12,
      batches: 3,
      done: true,
      stalled: false,
      failed: false,
    })
  })

  it("stops cleanly when the budget is spent between batches or starts at zero", async () => {
    let clock = 0
    const db = fakeDb(() => ({ data: EXPIRE_BATCH_SIZE })) as unknown as Db
    expect(await expirePlanDonations(db, () => (clock += 20), 50)).toEqual({
      expired: EXPIRE_BATCH_SIZE * 2,
      batches: 2,
      done: false,
      stalled: false,
      failed: false,
    })

    const calls: Call[] = []
    expect(await expirePlanDonations(fakeDb(() => ({ data: 1 }), calls) as unknown as Db, Date.now, 0)).toEqual({
      expired: 0,
      batches: 0,
      done: false,
      stalled: false,
      failed: false,
    })
    expect(calls).toHaveLength(0)
  })

  it("isolates a failing or malformed batch without losing earlier batches and logs zero-PII JSON", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    let step = 0
    const db = fakeDb(() => {
      step += 1
      if (step === 1) return { data: EXPIRE_BATCH_SIZE }
      return { error: { code: "XX000", message: "donor@example.com boom" } }
    }) as unknown as Db
    expect(await expirePlanDonations(db)).toEqual({
      expired: EXPIRE_BATCH_SIZE,
      batches: 1,
      done: false,
      stalled: false,
      failed: true,
    })
    const logged = JSON.parse(String(error.mock.calls[0][0])) as Record<string, unknown>
    expect(logged).toEqual({
      event: "plan_job.expire_batch_failed",
      job: "expire_plan_donations",
      batch: 2,
      expired_so_far: EXPIRE_BATCH_SIZE,
      code: "XX000",
    })
    expect(JSON.stringify(logged)).not.toContain("donor@example.com")

    for (const bad of ["3", null, -1, 1.5]) {
      expect(await expirePlanDonations(fakeDb(() => ({ data: bad })) as unknown as Db)).toEqual({
        expired: 0,
        batches: 0,
        done: false,
        stalled: false,
        failed: true,
      })
    }

    const throwing = {
      rpc: () => ({
        abortSignal: () =>
          Promise.reject(Object.assign(new Error("aborted donor@example.com"), { name: "TimeoutError" })),
      }),
    } as unknown as Db
    expect(await expirePlanDonations(throwing)).toEqual({
      expired: 0,
      batches: 0,
      done: false,
      stalled: false,
      failed: true,
    })
    const thrownLogged = JSON.parse(String(error.mock.calls.at(-1)?.[0])) as Record<string, unknown>
    expect(thrownLogged).toEqual({
      event: "plan_job.expire_batch_failed",
      job: "expire_plan_donations",
      batch: 1,
      expired_so_far: 0,
      error_name: "TimeoutError",
    })
    expect(JSON.stringify(thrownLogged)).not.toContain("donor@example.com")
  })

  it("skips the overdue probe when the budget expired during expire_plan_donations so maxDuration is never breached", async () => {
    let clock = 0
    const calls: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "rpc:expire_plan_donations") {
        clock = 50
        return { data: 0 }
      }
      return { data: [{ id: "99999999-9999-4999-8999-999999999999" }] }
    }, calls) as unknown as Db

    expect(await expirePlanDonations(db, () => clock, 45)).toEqual({
      expired: 0,
      batches: 1,
      done: false,
      stalled: false,
      failed: false,
    })
    expect(calls.map((c) => c.target)).toEqual(["rpc:expire_plan_donations"])
  })

  it("detects a stalled bad batch when expire_plan_donations returns 0 while overdue plan donations remain", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const calls: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "rpc:expire_plan_donations") return { data: 0 }
      if (call.target === "contributions") return { data: [{ id: "99999999-9999-4999-8999-999999999999" }] }
      return undefined
    }, calls) as unknown as Db

    expect(await expirePlanDonations(db, () => Date.UTC(2026, 10, 20, 3, 0, 0))).toEqual({
      expired: 0,
      batches: 1,
      done: false,
      stalled: true,
      failed: false,
    })
    expect(calls.map((c) => c.target)).toEqual(["rpc:expire_plan_donations", "contributions"])
    expect(op(calls[1], "lt")).toEqual(["plan_period", "2026-11-01"])
    expect(error).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(error.mock.calls[0][0]))).toEqual({
      event: "plan_job.expire_batch_stalled",
      job: "expire_plan_donations",
      batches: 1,
      expired: 0,
    })
  })

  it("finishes cleanly when expire_plan_donations returns 0 and no overdue plan donations remain (or probe fails)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const cleanDb = fakeDb((call) => {
      if (call.target === "rpc:expire_plan_donations") return { data: 0 }
      if (call.target === "contributions") return { data: [] }
      return undefined
    }) as unknown as Db
    expect(await expirePlanDonations(cleanDb)).toEqual({
      expired: 0,
      batches: 1,
      done: true,
      stalled: false,
      failed: false,
    })
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()

    const probeErrorDb = fakeDb((call) => {
      if (call.target === "rpc:expire_plan_donations") return { data: 0 }
      return { error: { code: "57014", message: "timeout" } }
    }) as unknown as Db
    expect(await expirePlanDonations(probeErrorDb)).toEqual({
      expired: 0,
      batches: 1,
      done: true,
      stalled: false,
      failed: false,
    })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toEqual({
      event: "plan_job.expire_probe_failed",
      job: "expire_plan_donations",
      code: "57014",
    })

    const probeThrowDb = {
      rpc: () => ({ abortSignal: async () => ({ data: 0, error: null }) }),
      from: () => ({
        select: () => ({
          not: () => ({
            eq: () => ({
              lt: () => ({
                limit: () => ({
                  abortSignal: () =>
                    Promise.reject(Object.assign(new Error("aborted donor@example.com"), { name: "TimeoutError" })),
                }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as Db
    expect(await expirePlanDonations(probeThrowDb)).toEqual({
      expired: 0,
      batches: 1,
      done: true,
      stalled: false,
      failed: false,
    })
    expect(JSON.parse(String(warn.mock.calls[1][0]))).toEqual({
      event: "plan_job.expire_probe_failed",
      job: "expire_plan_donations",
      error_name: "TimeoutError",
    })
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
