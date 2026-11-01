import "server-only"

import type { Db } from "@/lib/campaigns"

/**
 * Processing of give.inbound_events (design section 2.4 and 5.3).
 *
 * A channel (webhook or statement import) records what arrived with
 * give.record_inbound_event and then processes it: its processor turns the
 * payload into money facts through the money RPCs (record_bank_transaction,
 * match_transaction), and give.complete_inbound_event records the outcome.
 * An error leaves the event pending; the reprocess-inbound cron retries it.
 *
 * A processor must be safe to run again on the same event, including at the
 * same time as another run: the money RPCs are idempotent per (account,
 * provider transaction id), and complete_inbound_event is final once an event
 * is processed. That is what makes a duplicate cron run harmless.
 */

export type InboundChannel = "bank_api" | "payos" | "statement_import" | "crypto"

export interface InboundEvent {
  id: string
  channel: InboundChannel
  dedupe_key: string
  received_at: string
  payload: unknown
}

/** Does the money work for one event; throws when it could not. */
export type InboundProcessor = (db: Db, event: InboundEvent) => Promise<void>

export type InboundProcessors = Partial<Record<InboundChannel, InboundProcessor>>

/**
 * The processor of each channel. Empty until the first channel lands (the
 * statement-import pipeline, then PayOS in M2); events of a channel without
 * one stay pending and are counted as waiting.
 */
export const inboundProcessors: InboundProcessors = {}

/**
 * Events younger than this are left to the request that recorded them, which
 * processes them inline, so the cron does not race it.
 */
export const REPROCESS_GRACE_MS = 2 * 60 * 1000
/** Events per run; the rest wait for the next run. */
export const REPROCESS_BATCH = 50
/** A run stops taking new events after this long, well inside the function limit. */
export const REPROCESS_BUDGET_MS = 40 * 1000

const EVENT_COLUMNS = "id, channel, dedupe_key, received_at, payload"

/**
 * Runs the event's processor and records the outcome. Returns true when the
 * event is now processed. Never throws: a failure is stored on the event.
 */
export async function processInboundEvent(db: Db, event: InboundEvent, processor: InboundProcessor): Promise<boolean> {
  let failure: string | null = null
  try {
    await processor(db, event)
  } catch (err) {
    failure = (err instanceof Error ? err.message : String(err)).trim() || "processing_failed"
  }
  const { data, error } = await db.rpc("complete_inbound_event", {
    p_inbound_event_id: event.id,
    p_error: failure,
  })
  if (error) {
    console.error("complete_inbound_event failed", event.id, error.code, error.message)
    return false
  }
  if (failure) console.warn("inbound event still pending", event.id, event.channel, failure)
  // A replay of an event another run already processed returns its
  // processed_at even when this attempt failed.
  return data !== null
}

export interface ReprocessResult {
  processed: number
  failed: number
  /** Pending events of channels without a processor yet. */
  waiting: number
}

/**
 * The reprocess-inbound cron: retries pending authentic events, oldest first,
 * with never-tried events ahead of ones that already failed, so events that
 * keep failing cannot starve new ones. Forged events are stored as
 * processed, so they are never picked.
 */
export async function reprocessPendingInboundEvents(
  db: Db,
  processors: InboundProcessors = inboundProcessors,
  now: () => number = Date.now
): Promise<ReprocessResult> {
  const started = now()
  const cutoff = new Date(started - REPROCESS_GRACE_MS).toISOString()
  const handled = (Object.keys(processors) as InboundChannel[]).filter((channel) => processors[channel])
  const result: ReprocessResult = { processed: 0, failed: 0, waiting: 0 }

  let waitingQuery = db
    .from("inbound_events")
    .select("id", { count: "exact", head: true })
    .is("processed_at", null)
    .eq("signature_valid", true)
    .lt("received_at", cutoff)
  if (handled.length > 0) waitingQuery = waitingQuery.not("channel", "in", `(${handled.join(",")})`)
  const waiting = await waitingQuery
  if (waiting.error) throw new Error(`inbound_events count failed: ${waiting.error.message}`)
  result.waiting = waiting.count ?? 0

  if (handled.length === 0) return result

  const pending = (failedBefore: boolean, limit: number) => {
    const query = db
      .from("inbound_events")
      .select(EVENT_COLUMNS)
      .is("processed_at", null)
      .eq("signature_valid", true)
      .lt("received_at", cutoff)
      .in("channel", handled)
    return (failedBefore ? query.not("error", "is", null) : query.is("error", null))
      .order("received_at", { ascending: true })
      .limit(limit)
  }
  const fresh = await pending(false, REPROCESS_BATCH)
  if (fresh.error) throw new Error(`inbound_events read failed: ${fresh.error.message}`)
  const events = (fresh.data ?? []) as InboundEvent[]
  if (events.length < REPROCESS_BATCH) {
    const retry = await pending(true, REPROCESS_BATCH - events.length)
    if (retry.error) throw new Error(`inbound_events read failed: ${retry.error.message}`)
    events.push(...((retry.data ?? []) as InboundEvent[]))
  }

  for (const event of events) {
    if (now() - started > REPROCESS_BUDGET_MS) break
    const processor = processors[event.channel]
    if (!processor) continue
    if (await processInboundEvent(db, event, processor)) result.processed += 1
    else result.failed += 1
  }
  return result
}
