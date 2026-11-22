import "server-only"

import type { Db } from "@/lib/campaigns"
import { isUuid } from "@/lib/ids"
import { vnMonthStart } from "@/lib/plans"

/**
 * The monthly plan jobs (DOS/Give#276, design 4.3.4 and 5.3). Each database
 * function handles ONE plan per call, in its own transaction (the campaign
 * FOR SHARE, the plan FOR UPDATE SKIP LOCKED), and returns that plan's id
 * and outcome, or no row when nothing is left. A run calls it again with the
 * last plan id as p_after, so it sweeps the plans once in id order and
 * cannot loop on a plan it skipped; a plan another run holds is left to the
 * next run. Every call is idempotent: a retried or overlapping run issues no
 * second donation and writes no second reminder or end notice.
 */

/**
 * No call starts after this long into a route's run, whichever job it is,
 * so the last call (PLAN_CALL_TIMEOUT_MS) still ends inside the routes'
 * maxDuration (60 s). A route with two steps shares this one deadline.
 */
export const PLAN_JOB_BUDGET_MS = 45_000
/** Each call is abandoned after this long; the next run picks the plan up again. */
export const PLAN_CALL_TIMEOUT_MS = 8_000
/** Maximum rows give.expire_plan_donations() expires in a single RPC call. */
export const EXPIRE_BATCH_SIZE = 500

/** What is left of a run's budget that started at `started`. */
export function remainingBudget(started: number, now: () => number = Date.now): number {
  return Math.max(0, PLAN_JOB_BUDGET_MS - (now() - started))
}

export type PlanJob = "issue_plan_donations" | "plan_end_notices" | "plan_followups"

export interface PlanSweep {
  /** Plans handled, by outcome ('issued', 'ended', 'noticed', 'reminded', 'skipped', 'failed'). */
  outcomes: Record<string, number>
  calls: number
  /** False when the budget ran out first: the rest waits for the next run. */
  done: boolean
}

export interface ExpirePlansResult {
  expired: number
  batches: number
  /** False when the budget ran out, a batch failed, or overdue rows stayed un-expired. */
  done: boolean
  /** True when expire_plan_donations returned 0 while past-month unpaid plan donations still remain. */
  stalled: boolean
  /** True when an expiry batch returned an RPC error, threw, or answered unexpectedly. */
  failed: boolean
}

export class PlanJobError extends Error {
  constructor(
    readonly job: PlanJob,
    readonly code: string | undefined
  ) {
    super(`${job} failed`)
    this.name = "PlanJobError"
  }
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === "string" && code.length > 0 ? code : undefined
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "Error"
}

/** Emits a structured zero-PII error log for Vercel log drains / alerts. */
function logPlanError(fields: Record<string, string | number | boolean | null | undefined>) {
  console.error(JSON.stringify(fields))
}

/** Emits a structured zero-PII warning log for Vercel log drains / alerts. */
function logPlanWarn(fields: Record<string, string | number | boolean | null | undefined>) {
  console.warn(JSON.stringify(fields))
}

/**
 * Emits a structured zero-PII alert log whenever a monthly plan cron sweep
 * recorded one or more `'failed'` outcomes, so Vercel logs/alerts surface
 * isolated per-plan failures clearly.
 */
export function logPlanCronFailures(route: string, job: PlanJob, sweep: PlanSweep): void {
  const failed = sweep.outcomes.failed ?? 0
  if (failed <= 0) return
  logPlanError({
    event: "plan_cron.failed_outcomes",
    route,
    job,
    failed,
    calls: sweep.calls,
    done: sweep.done,
  })
}

/** Emits a structured zero-PII error log for unexpected non-PlanJobError throws in a cron route step. */
export function logPlanStepFailure(route: string, job: PlanJob, error: unknown): void {
  if (error instanceof PlanJobError) return
  logPlanError({
    event: "plan_cron.step_failed",
    route,
    job,
    error_name: errorName(error),
  })
}

function parseRow(data: unknown): { plan_id: string; outcome: string } | null | "bad" {
  if (!Array.isArray(data)) return "bad"
  if (data.length === 0) return null
  const row = data[0] as Record<string, unknown> | null
  if (data.length > 1 || !row || typeof row.plan_id !== "string" || !isUuid(row.plan_id)) return "bad"
  if (typeof row.outcome !== "string" || !/^[a-z_]{1,20}$/.test(row.outcome)) return "bad"
  return { plan_id: row.plan_id, outcome: row.outcome }
}

/** Runs one plan job to the end of the plan list, or until the budget is spent. */
export async function sweepPlans(
  db: Db,
  job: PlanJob,
  now: () => number = Date.now,
  budgetMs = PLAN_JOB_BUDGET_MS
): Promise<PlanSweep> {
  const started = now()
  const sweep: PlanSweep = { outcomes: {}, calls: 0, done: false }
  let after: string | null = null
  while (now() - started < budgetMs) {
    let result: { data: unknown; error: { code?: string; message?: string } | null }
    try {
      result = await db.rpc(job, { p_after: after }).abortSignal(AbortSignal.timeout(PLAN_CALL_TIMEOUT_MS))
    } catch (thrown: unknown) {
      sweep.calls += 1
      const code = errorCode(thrown)
      logPlanError({
        event: "plan_job.rpc_threw",
        job,
        after,
        error_name: errorName(thrown),
        ...(code ? { code } : {}),
      })
      throw new PlanJobError(job, code)
    }
    sweep.calls += 1
    const { data, error } = result
    if (error) {
      // A plan's own failure comes back as outcome 'failed' (the database
      // isolates each plan); an error here is the call itself (connection,
      // timeout), so the run stops and the next one starts over.
      const code = errorCode(error)
      logPlanError({ event: "plan_job.rpc_error", job, after, ...(code ? { code } : {}) })
      throw new PlanJobError(job, code)
    }
    const row = parseRow(data)
    if (row === "bad") {
      logPlanError({ event: "plan_job.unexpected_response", job, after })
      throw new PlanJobError(job, undefined)
    }
    if (row === null) {
      sweep.done = true
      break
    }
    // Ids only grow, so a run never visits a plan twice.
    if (after !== null && row.plan_id <= after) {
      logPlanError({ event: "plan_job.cursor_stalled", job, after, plan_id: row.plan_id })
      throw new PlanJobError(job, undefined)
    }
    after = row.plan_id
    if (row.outcome === "failed") {
      logPlanError({ event: "plan_job.plan_failed", job, plan_id: row.plan_id })
    }
    sweep.outcomes[row.outcome] = (sweep.outcomes[row.outcome] ?? 0) + 1
  }
  return sweep
}

/**
 * Checks whether past-month unpaid plan donations still exist after
 * give.expire_plan_donations() returned 0 (which happens if a bad row rolled
 * back the 500-row SQL batch, or if remaining rows were locked). Never logs
 * PII or throws.
 */
async function hasOverduePlanDonations(db: Db, nowMs: number): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("contributions")
      .select("id")
      .not("plan_id", "is", null)
      .eq("status", "awaiting_transfer")
      .lt("plan_period", vnMonthStart(new Date(nowMs)))
      .limit(1)
      .abortSignal(AbortSignal.timeout(PLAN_CALL_TIMEOUT_MS))
    if (error) {
      const code = errorCode(error)
      logPlanWarn({ event: "plan_job.expire_probe_failed", job: "expire_plan_donations", ...(code ? { code } : {}) })
      return false
    }
    return Array.isArray(data) && data.length > 0
  } catch (thrown: unknown) {
    const code = errorCode(thrown)
    logPlanWarn({
      event: "plan_job.expire_probe_failed",
      job: "expire_plan_donations",
      error_name: errorName(thrown),
      ...(code ? { code } : {}),
    })
    return false
  }
}

/**
 * issue-plan-donations, second step: past months' unpaid plan donations become
 * 'expired' (listing only). Drains batches of EXPIRE_BATCH_SIZE within the
 * remaining budget, isolates a failing/malformed batch without losing counts
 * from earlier batches, and detects a stalled bad batch when the RPC returns 0
 * while overdue plan donations still remain.
 */
export async function expirePlanDonations(
  db: Db,
  now: () => number = Date.now,
  budgetMs = PLAN_JOB_BUDGET_MS
): Promise<ExpirePlansResult> {
  const started = now()
  let expired = 0
  let batches = 0
  while (now() - started < budgetMs) {
    let result: { data: unknown; error: { code?: string; message?: string } | null }
    try {
      result = await db.rpc("expire_plan_donations").abortSignal(AbortSignal.timeout(PLAN_CALL_TIMEOUT_MS))
    } catch (thrown: unknown) {
      const code = errorCode(thrown)
      logPlanError({
        event: "plan_job.expire_batch_failed",
        job: "expire_plan_donations",
        batch: batches + 1,
        expired_so_far: expired,
        error_name: errorName(thrown),
        ...(code ? { code } : {}),
      })
      return { expired, batches, done: false, stalled: false, failed: true }
    }
    const { data, error } = result
    if (error) {
      const code = errorCode(error)
      logPlanError({
        event: "plan_job.expire_batch_failed",
        job: "expire_plan_donations",
        batch: batches + 1,
        expired_so_far: expired,
        ...(code ? { code } : {}),
      })
      return { expired, batches, done: false, stalled: false, failed: true }
    }
    if (typeof data !== "number" || !Number.isInteger(data) || data < 0) {
      logPlanError({
        event: "plan_job.expire_batch_failed",
        job: "expire_plan_donations",
        batch: batches + 1,
        expired_so_far: expired,
        reason: "unexpected_response",
      })
      return { expired, batches, done: false, stalled: false, failed: true }
    }
    batches += 1
    expired += data
    if (data === 0) {
      // Never start a second DB call after budgetMs so the run stays inside maxDuration.
      if (now() - started >= budgetMs) {
        return { expired, batches, done: false, stalled: false, failed: false }
      }
      if (await hasOverduePlanDonations(db, now())) {
        logPlanError({
          event: "plan_job.expire_batch_stalled",
          job: "expire_plan_donations",
          batches,
          expired,
        })
        return { expired, batches, done: false, stalled: true, failed: false }
      }
      return { expired, batches, done: true, stalled: false, failed: false }
    }
    if (data < EXPIRE_BATCH_SIZE) {
      return { expired, batches, done: true, stalled: false, failed: false }
    }
  }
  return { expired, batches, done: false, stalled: false, failed: false }
}
