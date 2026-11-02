import "server-only"

import type { Db } from "@/lib/campaigns"

/**
 * Processing of give.inbound_events (design section 2.4 and 5.3).
 *
 * A channel (webhook or statement import) records what arrived with
 * give.record_inbound_event and then processes it: its processor turns the
 * payload into money facts through the money RPCs (record_bank_transaction,
 * match_transaction), and give.complete_inbound_event records the outcome.
 * Each attempt is counted first (give.begin_inbound_attempt). An error leaves
 * the event pending and the reprocess-inbound cron retries it; once its
 * attempts are used up (give.inbound_event_max_attempts, 10) the event is
 * parked and waits for finance/admin staff (give.parked_inbound_events,
 * give.retry_inbound_event). A channel's inline path should call
 * processInboundEvent too, so both paths count and record attempts the same
 * way.
 *
 * A processor must be safe to run again on the same event, including at the
 * same time as another run (a provider redelivery, a duplicate cron call):
 * the money RPCs are idempotent per (account, provider transaction id), and
 * complete_inbound_event is final once an event is processed. That is what
 * makes a duplicate cron run harmless. Side effects outside the database
 * (notices, emails) are not covered by that and must be deduplicated by the
 * processor itself.
 */

export type InboundChannel = "bank_api" | "payos" | "statement_import" | "crypto"

export interface InboundEvent {
  id: string
  channel: InboundChannel
  dedupe_key: string
  received_at: string
  payload: unknown
}

/**
 * Does the money work for one event; throws when it could not. It should stop
 * when `signal` aborts: the attempt is then recorded as timed out.
 */
export type InboundProcessor = (db: Db, event: InboundEvent, signal: AbortSignal) => Promise<void>

export type InboundProcessors = Partial<Record<InboundChannel, InboundProcessor>>

/**
 * A failure a processor reports with a stable code. Only codes are stored on
 * the event and logged: messages from SDKs or built from a payload can carry
 * tokens or unmasked account numbers. A final failure is one that retrying
 * the same event cannot fix (the database refuses its content): the event
 * ends at once, with the code kept, and is neither retried nor parked.
 */
export class InboundError extends Error {
  constructor(
    readonly code: string,
    readonly final = false
  ) {
    super(code)
    this.name = "InboundError"
  }
}

/**
 * Events younger than this are left to the request that recorded them, which
 * processes them inline. An inline route's maxDuration must stay below it so
 * the cron does not start on an event that request is still processing.
 */
export const REPROCESS_GRACE_MS = 10 * 60 * 1000
/** Events per run; the rest wait for the next run. */
export const REPROCESS_BATCH = 50
/** Longest a processor may take on one event. */
export const PROCESSOR_TIMEOUT_MS = 15 * 1000
/**
 * A run starts no new event after this long, so the last one, with its
 * timeout and outcome write, still ends inside the route's 60 s maxDuration.
 */
export const REPROCESS_BUDGET_MS = 40 * 1000

const CODE = /^[A-Z][A-Z0-9_]{2,63}$/
const GIVE_CODE = /^GIVE_[A-Z_]{1,59}/

/**
 * What is stored in inbound_events.error for a failure: the code of an
 * InboundError, the GIVE_* code a money RPC raised, or a generic code.
 */
export function failureCode(err: unknown): string {
  if (err instanceof InboundError && CODE.test(err.code)) return err.code
  const message =
    typeof err === "object" && err !== null && "message" in err && typeof err.message === "string" ? err.message : ""
  return GIVE_CODE.exec(message.trim())?.[0] ?? "processing_failed"
}

class Timeout extends Error {}

/** What became of an event: processed (final), still pending, or parked for staff. */
export type InboundOutcome = "processed" | "pending" | "parked"

type AttemptStart = "started" | "processed" | "parked" | "busy"

/**
 * Counts an attempt before anything that can hang or crash, so attempts that
 * never finish still use up the event's limit. Busy: an attempt started less
 * than two minutes ago may still run (an overlapping cron run, an upload
 * during a cron attempt); nothing is counted. Null when it could not.
 */
async function beginAttempt(db: Db, id: string): Promise<AttemptStart | null> {
  const { data, error } = await db.rpc("begin_inbound_attempt", { p_inbound_event_id: id })
  if (error) {
    console.error("begin_inbound_attempt failed", id, error.code)
    return null
  }
  if (data === "started" || data === "processed" || data === "parked" || data === "busy") return data
  console.error("begin_inbound_attempt answered unexpectedly", id)
  return null
}

async function runWithTimeout(db: Db, event: InboundEvent, processor: InboundProcessor): Promise<void> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Timeout())
    }, PROCESSOR_TIMEOUT_MS)
  })
  try {
    await Promise.race([processor(db, event, controller.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Runs a started attempt and records its outcome. */
async function runAttempt(db: Db, event: InboundEvent, processor: InboundProcessor): Promise<InboundOutcome> {
  let failure: string | null = null
  let final = false
  try {
    await runWithTimeout(db, event, processor)
  } catch (err) {
    failure = err instanceof Timeout ? "processing_timeout" : failureCode(err)
    final = err instanceof InboundError && err.final && failure === err.code
  }
  const { data, error } = await db.rpc("complete_inbound_event", {
    p_inbound_event_id: event.id,
    p_error: failure,
    p_final: final,
  })
  if (error) {
    console.error("complete_inbound_event failed", event.id, error.code)
    return "pending"
  }
  // A replay of an event another run already processed returns its
  // processed_at even when this attempt failed.
  if (data !== null) return "processed"
  console.warn("inbound event attempt failed", event.id, event.channel, failure, final ? "final" : "")
  if (final) return "pending" // ended with its error; never retried
  // The failure that uses up the last attempt parks the event.
  const state = await db.from("inbound_events").select("parked_at").eq("id", event.id).maybeSingle()
  return (state.data as { parked_at: string | null } | null)?.parked_at ? "parked" : "pending"
}

/**
 * Counts an attempt, runs the event's processor and records the outcome.
 * Never throws: a failure is stored on the event. A processed or parked event
 * is not run again.
 */
export async function processInboundEvent(
  db: Db,
  event: InboundEvent,
  processor: InboundProcessor
): Promise<InboundOutcome> {
  const started = await beginAttempt(db, event.id)
  if (started === null || started === "busy") return "pending"
  if (started !== "started") return started
  return runAttempt(db, event, processor)
}

export interface ReprocessResult {
  processed: number
  failed: number
  /** Pending events of channels without a processor yet. */
  waiting: number
  /**
   * Parked events waiting for staff: all of them, not only this run's. An
   * event this run's failure parked is counted in `failed` too.
   */
  parked: number
}

export interface ReprocessOptions {
  /** The channels' processors: inboundProcessors from ./processors. */
  processors: InboundProcessors
  now?: () => number
  random?: () => number
}

type EventHead = Pick<InboundEvent, "id" | "channel" | "received_at">

/**
 * The reprocess-inbound cron: retries pending authentic events. Never-tried
 * events (and events staff sent back) go first, oldest first. Events that
 * already failed fill the rest of the batch from a random window, so a set of
 * events that keep failing cannot keep other failures from being retried.
 * Parked events are never picked, and forged events are stored as processed.
 * Payloads (up to 1 MiB each) are loaded one event at a time.
 */
export async function reprocessPendingInboundEvents(
  db: Db,
  { processors, now = Date.now, random = Math.random }: ReprocessOptions
): Promise<ReprocessResult> {
  const started = now()
  const cutoff = new Date(started - REPROCESS_GRACE_MS).toISOString()
  const handled = (Object.keys(processors) as InboundChannel[]).filter((channel) => processors[channel])
  const result: ReprocessResult = { processed: 0, failed: 0, waiting: 0, parked: 0 }

  const pending = (columns: string, options?: { count: "exact"; head: true }) =>
    db
      .from("inbound_events")
      .select(columns, options)
      .is("processed_at", null)
      .is("parked_at", null)
      .eq("signature_valid", true)
      .lt("received_at", cutoff)

  let waitingQuery = pending("id", { count: "exact", head: true })
  if (handled.length > 0) waitingQuery = waitingQuery.not("channel", "in", `(${handled.join(",")})`)
  const waiting = await waitingQuery
  if (waiting.error) throw new Error(`inbound_events count failed: ${waiting.error.message}`)
  result.waiting = waiting.count ?? 0

  if (handled.length === 0) {
    result.parked = await countParked(db)
    return result
  }

  const fresh = await pending("id, channel, received_at")
    .in("channel", handled)
    .eq("attempts", 0)
    .order("received_at", { ascending: true })
    .limit(REPROCESS_BATCH)
  if (fresh.error) throw new Error(`inbound_events read failed: ${fresh.error.message}`)
  const events = (fresh.data ?? []) as unknown as EventHead[]

  const slots = REPROCESS_BATCH - events.length
  if (slots > 0) {
    const failedCount = await pending("id", { count: "exact", head: true }).in("channel", handled).gt("attempts", 0)
    if (failedCount.error) throw new Error(`inbound_events count failed: ${failedCount.error.message}`)
    const total = failedCount.count ?? 0
    const failedPage = async (from: number, to: number) => {
      const page = await pending("id, channel, received_at")
        .in("channel", handled)
        .gt("attempts", 0)
        .order("received_at", { ascending: true })
        .range(from, to)
      if (page.error) throw new Error(`inbound_events read failed: ${page.error.message}`)
      events.push(...((page.data ?? []) as unknown as EventHead[]))
    }
    if (total > 0 && total <= slots) await failedPage(0, total - 1)
    if (total > slots) {
      // A window that wraps around the end of the list, so every failed
      // event, the newest included, has the same chance (slots / total).
      const offset = Math.min(total - 1, Math.floor(random() * total))
      await failedPage(offset, Math.min(total, offset + slots) - 1)
      const overflow = offset + slots - total
      if (overflow > 0) await failedPage(0, overflow - 1)
    }
  }

  for (const head of events) {
    if (now() - started > REPROCESS_BUDGET_MS) break
    const processor = processors[head.channel]
    if (!processor) continue
    // Counted before the payload is loaded, so an event whose attempt never
    // finished joins the failed pool instead of staying first in the
    // never-tried queue, and is parked once its attempts are used up.
    const attempt = await beginAttempt(db, head.id)
    if (attempt === null) {
      result.failed += 1
      continue
    }
    if (attempt === "processed") {
      result.processed += 1 // another run processed it meanwhile
      continue
    }
    if (attempt === "parked") continue // counted below
    if (attempt === "busy") continue // another run's attempt; not this run's to count
    const body = await db.from("inbound_events").select("dedupe_key, payload").eq("id", head.id).maybeSingle()
    if (body.error || !body.data) {
      console.error("inbound event could not be loaded", head.id, body.error?.code)
      result.failed += 1
      continue
    }
    const event = { ...head, ...(body.data as Pick<InboundEvent, "dedupe_key" | "payload">) }
    if ((await runAttempt(db, event, processor)) === "processed") result.processed += 1
    else result.failed += 1
  }

  result.parked = await countParked(db)
  return result
}

async function countParked(db: Db): Promise<number> {
  const parked = await db
    .from("inbound_events")
    .select("id", { count: "exact", head: true })
    .is("processed_at", null)
    .not("parked_at", "is", null)
  if (parked.error) throw new Error(`inbound_events count failed: ${parked.error.message}`)
  return parked.count ?? 0
}
