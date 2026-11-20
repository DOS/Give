import "server-only"

import type { Db } from "@/lib/campaigns"
import { signStopToken } from "@/server/plans/stop-link"

import { carriesStopLink, EmailRenderError, isEmailKind, renderEmail, type OutboxEmail } from "./templates"
import type { EmailTransport, OutgoingEmail } from "./transport"

/**
 * The send-outbox job (DOS/Give#254, design 5.3): leases due rows with
 * give.claim_outbox, renders and sends each, and records the result with
 * give.complete_outbox, which retries with backoff and marks a row dead
 * after its last attempt. A row is leased for 5 minutes, so a run that dies
 * mid-send leaves it to the next run, never to two runs at once.
 *
 * Delivery is at least once, not exactly once. Enqueueing is exactly once
 * (one row per event), but a row is sent again when the provider took the
 * message and its answer never reached us: a send that timed out, or lost
 * its connection after MAIL FROM before the provider answered (recorded as outcome unknown
 * and retried only after an hour or more), or a result
 * that could not be recorded (complete_outbox is retried a few times, then
 * the lease runs out and the next run sends the row again). The recipient
 * may then get the same email twice.
 */

/** Rows leased per claim; small, so a slow provider leaves few rows waiting on their lease. */
export const CLAIM_BATCH = 10
/** Stop claiming after this long. */
export const RUN_BUDGET_MS = 30_000
/**
 * One send may take this long. Then its connection is cut off and the
 * attempt is recorded as outcome unknown: the provider may have accepted the
 * message just before.
 */
export const SEND_TIMEOUT_MS = 15_000
/** Tries at recording one result before leaving the row to its lease. */
export const COMPLETE_TRIES = 3
const COMPLETE_RETRY_MS = [250, 1_000]
/** complete_outbox without p_hold: PostgREST finds no such function (PGRST202), Postgres neither (42883). */
const NO_HOLD_FUNCTION = new Set(["PGRST202", "42883"])
/** Each RPC after a send (complete, release) is abandoned after this long. */
export const RPC_TIMEOUT_MS = 5_000
/** A claim is abandoned after this long (it may wait on locks while it settles rows). */
export const CLAIM_TIMEOUT_MS = 10_000
/**
 * No retry or release starts unless it can finish by this point, under the
 * 60 s function limit: a run killed mid-batch loses its results and leaves
 * the rest of its rows to their 5-minute lease. A send ends by
 * SEND_DEADLINE_MS, its first complete_outbox by 50 s.
 */
export const RUN_LIMIT_MS = 55_000
/**
 * No send starts unless it can time out by this point, well inside the 60 s
 * function limit (route maxDuration). Rows the run cannot reach in time are
 * given back uncounted (give.release_outbox) instead of waiting out their
 * 5-minute lease and spending an attempt.
 */
export const SEND_DEADLINE_MS = 45_000

export interface OutboxRunResult {
  claimed: number
  sent: number
  retrying: number
  /** Throttled by the provider for the whole account: back in an hour, the attempt not counted. */
  held: number
  dead: number
  stale: number
  /** Leased rows given back for the next run. */
  released: number
}

export interface OutboxRunOptions {
  origin: string
  from: string
  replyTo?: string
  now?: () => number
  budgetMs?: number
}

function parseRow(value: unknown): OutboxEmail | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== "string" || typeof row.kind !== "string" || typeof row.to_email !== "string") return null
  if (typeof row.attempt !== "number" || !Number.isInteger(row.attempt) || row.attempt < 1) return null
  if (row.category !== "transactional" && row.category !== "notification") return null
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    to_email: row.to_email,
    payload: row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : null,
    attempt: row.attempt,
    idempotency_key: typeof row.idempotency_key === "string" ? row.idempotency_key : row.id,
    unsubscribe_token: typeof row.unsubscribe_token === "string" ? row.unsubscribe_token : null,
    reference_code: typeof row.reference_code === "string" ? row.reference_code : null,
    tracking_token: typeof row.tracking_token === "string" ? row.tracking_token : null,
    stop_token: typeof row.stop_token === "string" ? row.stop_token : null,
  }
}

/** The domain of the From address, for a stable Message-ID. */
function senderDomain(from: string): string {
  const match = /@([A-Za-z0-9.-]+)>?\s*$/.exec(from)
  return match?.[1]?.toLowerCase() ?? "give.vn"
}

export function outgoingEmail(row: OutboxEmail, options: OutboxRunOptions): OutgoingEmail {
  // A plan reminder's stop link is signed here, where the secret is; without
  // a token or a secret renderEmail refuses the row (stop_token_missing).
  const signedStopToken = carriesStopLink(row.kind) ? signStopToken(row.stop_token) : null
  const rendered = renderEmail(row, options.origin, { signedStopToken })
  const headers: Record<string, string> = {
    // Our Message-ID for the row. SES replaces it with its own on the way
    // out, so it does not let mail clients drop a resend; X-Give-Outbox-Id
    // is the header that survives and ties a delivered email to its row.
    "Message-ID": `<outbox-${row.id}@${senderDomain(options.from)}>`,
    "X-Give-Outbox-Id": row.id,
    "Auto-Submitted": "auto-generated",
  }
  if (rendered.oneClickUnsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${rendered.oneClickUnsubscribeUrl}>`
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
  }
  return {
    from: options.from,
    replyTo: options.replyTo,
    to: row.to_email,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    headers,
    idempotencyKey: row.idempotency_key,
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("send_timeout")), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Error text kept on the row: short, and never the recipient's address. */
function errorText(error: string, row: OutboxEmail): string {
  return error.replaceAll(row.to_email, "[recipient]").slice(0, 300)
}

type Result =
  | { ok: true; messageId: string | null }
  | { ok: false; permanent: boolean; error: string; outcomeUnknown?: boolean; hold?: boolean; stop?: boolean }

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The run's clock: whether another RPC (after `wait` ms) still fits before RUN_LIMIT_MS. */
interface Clock {
  now: () => number
  started: number
}
const fits = (clock: Clock, wait = 0) => clock.now() - clock.started + wait + RPC_TIMEOUT_MS <= RUN_LIMIT_MS

/**
 * Errors a second try cannot fix: bad data, constraints, permissions, an
 * exception the function raised (GIVE_OUTBOX_NOT_FOUND), a request
 * PostgREST refused. Everything else (network, timeout, abort, connection,
 * serialization, server overload) is worth another try.
 */
function isTransient(error: { code?: string }): boolean {
  return !/^(22|23|42|P0|PGRST1|PGRST2)/.test(error.code ?? "")
}

async function complete(db: Db, row: OutboxEmail, result: Result, clock: Clock): Promise<string | null> {
  const args: Record<string, unknown> = {
    p_id: row.id,
    p_attempt: row.attempt,
    p_ok: result.ok,
    p_error: result.ok ? null : errorText(result.error, row),
    p_provider_message_id: result.ok ? result.messageId : null,
    p_permanent: result.ok ? false : result.permanent,
    p_outcome_unknown: result.ok ? false : result.outcomeUnknown === true,
    // Sent only for a hold, so an ordinary result also works against a
    // database from before p_hold (DOS.Me 20261124090000).
    ...(!result.ok && result.hold === true ? { p_hold: true } : {}),
  }
  for (let tryNo = 1; ; tryNo++) {
    const { data, error } = await db.rpc("complete_outbox", args).abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
    if (error && args.p_hold === true && NO_HOLD_FUNCTION.has(error.code ?? "")) {
      // A database from before p_hold: record an ordinary, counted failure
      // rather than leave the row to its lease (which would end it dead
      // after 7 leases, about 35 minutes).
      console.error("complete_outbox has no p_hold; recording an ordinary failure", row.id)
      delete args.p_hold
      // Not held after all, so the row must not look held on /admin/emails.
      if (typeof args.p_error === "string") args.p_error = args.p_error.replace(/^THROTTLE:\s*/, "")
      tryNo -= 1
      continue
    }
    if (!error) {
      // 'stale' on a later try: an earlier try may have committed and only
      // its answer was lost. The row says what that try recorded.
      if (data === "stale" && tryNo > 1)
        return (fits(clock) ? await recorded(db, row, args.p_hold === true) : null) ?? "stale"
      return typeof data === "string" ? data : null
    }
    console.error("complete_outbox failed", row.id, tryNo, error.code, error.message)
    const wait = COMPLETE_RETRY_MS[tryNo - 1] ?? 1_000
    if (tryNo >= COMPLETE_TRIES || !isTransient(error) || !fits(clock, wait)) break
    await pause(wait)
  }
  // The lease runs out and the next run takes the row again: a sent email
  // goes out a second time.
  return null
}

/**
 * The status this attempt left on the row, if it is settled. A hold puts
 * the attempt count back, so a held row shows the count before the claim.
 */
async function recorded(db: Db, row: OutboxEmail, held: boolean): Promise<string | null> {
  const { data } = await db
    .from("outbox")
    .select("status, attempts")
    .eq("id", row.id)
    .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
    .maybeSingle()
  const settled = data as { status?: unknown; attempts?: unknown } | null
  if (held) return settled?.status === "pending" && settled.attempts === row.attempt - 1 ? "held" : null
  if (settled?.attempts !== row.attempt) return null
  return settled.status === "sent" || settled.status === "pending" || settled.status === "dead" ? settled.status : null
}

/** stop: the run should send nothing more (the send timed out, or the provider throttles the whole account). */
type SendOutcome = { status: string | null; stop: boolean }

async function sendOne(
  db: Db,
  transport: EmailTransport,
  row: OutboxEmail,
  options: OutboxRunOptions,
  clock: Clock
): Promise<SendOutcome> {
  let email: OutgoingEmail
  try {
    if (!isEmailKind(row.kind)) throw new EmailRenderError(`unknown_kind:${row.kind.slice(0, 40)}`)
    email = outgoingEmail(row, options)
  } catch (error) {
    const reason = error instanceof EmailRenderError ? error.message : "render_failed"
    console.error("outbox email could not be rendered", row.id, row.kind, reason)
    return {
      status: await complete(db, row, { ok: false, permanent: true, error: `render: ${reason}` }, clock),
      stop: false,
    }
  }
  let result: Result
  let timedOut = false
  try {
    result = await withTimeout(transport.send(email), SEND_TIMEOUT_MS)
  } catch (error) {
    timedOut = error instanceof Error && error.message === "send_timeout"
    if (timedOut) {
      // Cut the connection now, before recording anything, so a message
      // still in flight cannot land after the failure is on the row.
      transport.abort?.()
      result =
        (transport.reachedEnvelope?.() ?? true)
          ? {
              ok: false,
              permanent: false,
              outcomeUnknown: true,
              error: "send_timeout: outcome unknown, the provider may have accepted it",
            }
          : { ok: false, permanent: false, error: "send_timeout: before the message was sent" }
    } else {
      result = { ok: false, permanent: false, error: error instanceof Error ? error.message : "send_failed" }
    }
  }
  if (!result.ok) {
    const how = result.hold ? "hold" : result.permanent ? "permanent" : "retry"
    console.warn("outbox send failed", row.id, row.kind, how)
  }
  const stop = !result.ok && (result.hold === true || result.stop === true)
  return { status: await complete(db, row, result, clock), stop: timedOut || stop }
}

/** Gives rows back while time allows; the rest wait out their lease. */
async function release(db: Db, rows: OutboxEmail[], clock: Clock): Promise<number> {
  let released = 0
  for (const row of rows) {
    if (!fits(clock)) break
    const { data, error } = await db
      .rpc("release_outbox", { p_id: row.id, p_attempt: row.attempt })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS))
    if (error) console.error("release_outbox failed", row.id, error.code, error.message)
    else if (data === true) released += 1
  }
  return released
}

/**
 * One send-outbox run. Throws only when the first claim fails. After a send
 * times out its connection is cut off (transport.abort), the attempt is
 * recorded as outcome unknown, and the run stops and gives back the rest of
 * its batch: the provider may be stuck. The run also stops when the provider
 * throttles the whole account (SES: per-second rate or 24-hour quota
 * exceeded; smtp.ts says which replies mean that), since every other row
 * would fail the same way, and gives back the rest uncounted. A rate
 * failure counts as usual (retried after a minute). A quota failure is held
 * (complete_outbox p_hold: back in an hour, the attempt not counted, so it
 * never ends dead, though it still expires at its kind's maximum age).
 */
export async function sendDueEmails(
  db: Db,
  transport: EmailTransport,
  options: OutboxRunOptions
): Promise<OutboxRunResult> {
  const now = options.now ?? Date.now
  const started = now()
  const clock: Clock = { now, started }
  const budget = options.budgetMs ?? RUN_BUDGET_MS
  const result: OutboxRunResult = { claimed: 0, sent: 0, retrying: 0, held: 0, dead: 0, stale: 0, released: 0 }

  try {
    run: while (now() - started < budget) {
      const { data, error } = await db
        .rpc("claim_outbox", { p_limit: CLAIM_BATCH })
        .abortSignal(AbortSignal.timeout(CLAIM_TIMEOUT_MS))
      if (error) {
        if (result.claimed === 0) throw error
        console.error("claim_outbox failed", error.code, error.message)
        break
      }
      const raws = Array.isArray(data) ? data : []
      if (raws.length === 0) break
      result.claimed += raws.length
      const rows: OutboxEmail[] = []
      for (const raw of raws) {
        const row = parseRow(raw)
        if (row) rows.push(row)
        else console.error("claim_outbox returned an unexpected row")
      }
      for (let i = 0; i < rows.length; i++) {
        if (now() - started + SEND_TIMEOUT_MS > SEND_DEADLINE_MS) {
          result.released += await release(db, rows.slice(i), clock)
          break run
        }
        const { status, stop } = await sendOne(db, transport, rows[i], options, clock)
        if (status === "sent") result.sent += 1
        else if (status === "pending") result.retrying += 1
        else if (status === "held") result.held += 1
        else if (status === "dead") result.dead += 1
        else if (status === "stale") result.stale += 1
        if (stop) {
          result.released += await release(db, rows.slice(i + 1), clock)
          break run
        }
      }
      if (raws.length < CLAIM_BATCH) break
    }
  } finally {
    transport.close?.()
  }
  return result
}
