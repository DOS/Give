import "server-only"

import type { Db } from "@/lib/campaigns"
import { isUuid } from "@/lib/ids"

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

/** What is left of a run's budget that started at `started`. */
export function remainingBudget(started: number, now: () => number = Date.now): number {
  return Math.max(0, PLAN_JOB_BUDGET_MS - (now() - started))
}

export type PlanJob = "issue_plan_donations" | "plan_end_notices" | "plan_followups"

export interface PlanSweep {
  /** Plans handled, by outcome ('issued', 'ended', 'noticed', 'reminded', 'skipped'). */
  outcomes: Record<string, number>
  calls: number
  /** False when the budget ran out first: the rest waits for the next run. */
  done: boolean
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
    const { data, error } = await db.rpc(job, { p_after: after }).abortSignal(AbortSignal.timeout(PLAN_CALL_TIMEOUT_MS))
    sweep.calls += 1
    if (error) {
      console.error(`${job} failed`, error.code, error.message)
      throw new PlanJobError(job, error.code)
    }
    const row = parseRow(data)
    if (row === "bad") {
      console.error(`${job} answered unexpectedly`)
      throw new PlanJobError(job, undefined)
    }
    if (row === null) {
      sweep.done = true
      break
    }
    // Ids only grow, so a run never visits a plan twice.
    if (after !== null && row.plan_id <= after) {
      console.error(`${job} did not move past the last plan`)
      throw new PlanJobError(job, undefined)
    }
    after = row.plan_id
    sweep.outcomes[row.outcome] = (sweep.outcomes[row.outcome] ?? 0) + 1
  }
  return sweep
}

/** issue-plan-donations, second step: past months' unpaid plan donations become 'expired' (listing only). */
export async function expirePlanDonations(db: Db): Promise<number> {
  const { data, error } = await db.rpc("expire_plan_donations").abortSignal(AbortSignal.timeout(PLAN_CALL_TIMEOUT_MS))
  if (error) {
    console.error("expire_plan_donations failed", error.code, error.message)
    throw new PlanJobError("issue_plan_donations", error.code)
  }
  if (typeof data !== "number") {
    console.error("expire_plan_donations answered unexpectedly")
    throw new PlanJobError("issue_plan_donations", undefined)
  }
  return data
}
