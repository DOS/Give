import "server-only"

import type { Db } from "@/lib/campaigns"

import { EmailRenderError, isEmailKind, renderEmail, type OutboxEmail } from "./templates"
import type { EmailTransport, OutgoingEmail } from "./transport"

/**
 * The send-outbox job (DOS/Give#254, design 5.3): leases due rows with
 * give.claim_outbox, renders and sends each, and records the result with
 * give.complete_outbox, which retries with backoff and marks a row dead
 * after its last attempt. A row is leased for 5 minutes, so a run that dies
 * mid-send leaves it to the next run, never to two runs at once.
 */

/** Rows leased per claim; small, so a slow provider leaves few rows waiting on their lease. */
export const CLAIM_BATCH = 10
/** Stop claiming after this long. */
export const RUN_BUDGET_MS = 30_000
/** One send may take this long before it counts as a failed attempt. */
export const SEND_TIMEOUT_MS = 15_000
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
  }
}

/** The domain of the From address, for a stable Message-ID. */
function senderDomain(from: string): string {
  const match = /@([A-Za-z0-9.-]+)>?\s*$/.exec(from)
  return match?.[1]?.toLowerCase() ?? "give.vn"
}

export function outgoingEmail(row: OutboxEmail, options: OutboxRunOptions): OutgoingEmail {
  const rendered = renderEmail(row, options.origin)
  const headers: Record<string, string> = {
    // One Message-ID per outbox row: a resend after a lost result is the
    // same message to mail clients that drop duplicates.
    "Message-ID": `<outbox-${row.id}@${senderDomain(options.from)}>`,
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

async function complete(
  db: Db,
  row: OutboxEmail,
  result: { ok: true; messageId: string | null } | { ok: false; permanent: boolean; error: string }
): Promise<string | null> {
  const { data, error } = await db.rpc("complete_outbox", {
    p_id: row.id,
    p_attempt: row.attempt,
    p_ok: result.ok,
    p_error: result.ok ? null : errorText(result.error, row),
    p_provider_message_id: result.ok ? result.messageId : null,
    p_permanent: result.ok ? false : result.permanent,
  })
  if (error) {
    // The lease runs out and the next run takes the row again.
    console.error("complete_outbox failed", row.id, error.code, error.message)
    return null
  }
  return typeof data === "string" ? data : null
}

type SendOutcome = { status: string | null; timedOut: boolean }

async function sendOne(
  db: Db,
  transport: EmailTransport,
  row: OutboxEmail,
  options: OutboxRunOptions
): Promise<SendOutcome> {
  let email: OutgoingEmail
  try {
    if (!isEmailKind(row.kind)) throw new EmailRenderError(`unknown_kind:${row.kind.slice(0, 40)}`)
    email = outgoingEmail(row, options)
  } catch (error) {
    const reason = error instanceof EmailRenderError ? error.message : "render_failed"
    console.error("outbox email could not be rendered", row.id, row.kind, reason)
    return {
      status: await complete(db, row, { ok: false, permanent: true, error: `render: ${reason}` }),
      timedOut: false,
    }
  }
  let result: Awaited<ReturnType<EmailTransport["send"]>>
  let timedOut = false
  try {
    result = await withTimeout(transport.send(email), SEND_TIMEOUT_MS)
  } catch (error) {
    timedOut = error instanceof Error && error.message === "send_timeout"
    result = { ok: false, permanent: false, error: error instanceof Error ? error.message : "send_failed" }
  }
  if (!result.ok) console.warn("outbox send failed", row.id, row.kind, result.permanent ? "permanent" : "retry")
  return { status: await complete(db, row, result), timedOut }
}

async function release(db: Db, rows: OutboxEmail[]): Promise<number> {
  let released = 0
  for (const row of rows) {
    const { data, error } = await db.rpc("release_outbox", { p_id: row.id, p_attempt: row.attempt })
    if (error) console.error("release_outbox failed", row.id, error.code, error.message)
    else if (data === true) released += 1
  }
  return released
}

/**
 * One send-outbox run. Throws only when the first claim fails. After a send
 * times out the run stops and gives back the rest of its batch: the
 * provider may be stuck, and the transport is closed so the timed-out
 * connection is dropped rather than left to finish later.
 */
export async function sendDueEmails(
  db: Db,
  transport: EmailTransport,
  options: OutboxRunOptions
): Promise<OutboxRunResult> {
  const now = options.now ?? Date.now
  const started = now()
  const budget = options.budgetMs ?? RUN_BUDGET_MS
  const result: OutboxRunResult = { claimed: 0, sent: 0, retrying: 0, dead: 0, stale: 0, released: 0 }

  try {
    run: while (now() - started < budget) {
      const { data, error } = await db.rpc("claim_outbox", { p_limit: CLAIM_BATCH })
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
          result.released += await release(db, rows.slice(i))
          break run
        }
        const { status, timedOut } = await sendOne(db, transport, rows[i], options)
        if (status === "sent") result.sent += 1
        else if (status === "pending") result.retrying += 1
        else if (status === "dead") result.dead += 1
        else if (status === "stale") result.stale += 1
        if (timedOut) {
          result.released += await release(db, rows.slice(i + 1))
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
