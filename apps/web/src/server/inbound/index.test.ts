import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Db } from "@/lib/campaigns"
import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  InboundError,
  PROCESSOR_TIMEOUT_MS,
  REPROCESS_BATCH,
  REPROCESS_BUDGET_MS,
  REPROCESS_GRACE_MS,
  failureCode,
  reprocessPendingInboundEvents,
  type InboundEvent,
  type InboundProcessor,
  type InboundProcessors,
} from "."

const NOW = Date.parse("2026-11-01T10:00:00Z")

interface Row {
  id: string
  channel: InboundEvent["channel"]
  dedupe_key: string
  received_at: string
  signature_valid: boolean
  payload: unknown
  processed_at: string | null
  error: string | null
}

let rows: Row[]
let calls: Call[]

function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    channel: "statement_import",
    dedupe_key: `key-${id}`,
    received_at: new Date(NOW - REPROCESS_GRACE_MS - 60_000).toISOString(),
    signature_valid: true,
    payload: { n: id },
    processed_at: null,
    error: null,
    ...overrides,
  }
}

/** Applies the PostgREST filters the reprocess job uses to the in-memory table. */
function select(call: Call) {
  let result = rows.slice()
  let from = 0
  let to = Infinity
  for (const [name, ...args] of call.ops) {
    const [column, a, b] = args as [keyof Row, unknown, unknown]
    if (name === "is") result = result.filter((r) => r[column] === a)
    if (name === "eq") result = result.filter((r) => r[column] === a)
    if (name === "lt") result = result.filter((r) => String(r[column]) < String(a))
    if (name === "in") result = result.filter((r) => (a as unknown[]).includes(r[column]))
    if (name === "not" && a === "is") result = result.filter((r) => r[column] !== b)
    if (name === "not" && a === "in") {
      const list = String(b).slice(1, -1).split(",")
      result = result.filter((r) => !list.includes(String(r[column])))
    }
    if (name === "order") result.sort((x, y) => String(x[column]).localeCompare(String(y[column])))
    if (name === "limit") to = (args[0] as number) - 1
    if (name === "range") [from, to] = args as [number, number]
  }
  result = result.slice(from, to + 1)
  const [columns, options] = op(call, "select") as [string, { head?: boolean } | undefined]
  if (options?.head) return { count: result.length }
  const keys = columns.split(", ") as (keyof Row)[]
  const data = result.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])))
  return { data: op(call, "maybeSingle") ? (data[0] ?? null) : data }
}

/** give.complete_inbound_event as the migration defines it. */
function complete(args: { p_inbound_event_id: string; p_error: string | null }) {
  const r = rows.find((x) => x.id === args.p_inbound_event_id)!
  if (r.processed_at) return { data: r.processed_at }
  if (!args.p_error?.trim()) {
    r.processed_at = new Date(NOW).toISOString()
    r.error = null
    return { data: r.processed_at }
  }
  r.error = args.p_error.trim().slice(0, 2000)
  return { data: null }
}

function db(): Db {
  return fakeDb((call) => {
    if (call.target === "inbound_events") return select(call)
    if (call.target === "rpc:complete_inbound_event") {
      return complete(op(call, "args")![0] as { p_inbound_event_id: string; p_error: string | null })
    }
    throw new Error(`unexpected ${call.target}`)
  }, calls) as unknown as Db
}

function run(processors: InboundProcessors, options: { now?: () => number; random?: () => number } = {}) {
  return reprocessPendingInboundEvents(db(), { processors, now: () => NOW, random: () => 0, ...options })
}

beforeEach(() => {
  rows = []
  calls = []
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe("reprocessPendingInboundEvents", () => {
  it("processes pending events once; a second run changes nothing", async () => {
    rows = [row("1"), row("2")]
    const seen: InboundEvent[] = []
    const processors: InboundProcessors = {
      statement_import: async (_db, event) => {
        seen.push(event)
      },
    }

    expect(await run(processors)).toEqual({ processed: 2, failed: 0, waiting: 0 })
    expect(seen.map((e) => e.id)).toEqual(["1", "2"])
    expect(seen[0]).toEqual({
      id: "1",
      channel: "statement_import",
      dedupe_key: "key-1",
      received_at: rows[0].received_at,
      payload: { n: "1" },
    })
    expect(rows.every((r) => r.processed_at !== null)).toBe(true)
    const after = structuredClone(rows)

    calls.length = 0
    expect(await run(processors)).toEqual({ processed: 0, failed: 0, waiting: 0 })
    expect(seen).toHaveLength(2)
    expect(rows).toEqual(after)
    expect(calls.some((c) => c.target.startsWith("rpc:"))).toBe(false)
  })

  it("loads payloads one event at a time, never in the batch read", async () => {
    rows = [row("1"), row("2")]
    await run({ statement_import: async () => {} })
    const reads = calls.filter((c) => c.target === "inbound_events" && !op(c, "select")?.[1])
    const batch = reads.filter((c) => !op(c, "maybeSingle"))
    expect(batch.every((c) => !String(op(c, "select")![0]).includes("payload"))).toBe(true)
    expect(reads.filter((c) => op(c, "maybeSingle")).map((c) => op(c, "eq"))).toEqual([
      ["id", "1"],
      ["id", "2"],
    ])
  })

  it("stores a failure code on the event and leaves it pending for the next run", async () => {
    rows = [row("1")]
    let attempts = 0
    const processors: InboundProcessors = {
      statement_import: async () => {
        attempts += 1
        if (attempts === 1) throw new Error("GIVE_ACCOUNT_NOT_FOUND")
      },
    }

    expect(await run(processors)).toMatchObject({ processed: 0, failed: 1 })
    expect(rows[0]).toMatchObject({ processed_at: null, error: "GIVE_ACCOUNT_NOT_FOUND" })

    expect(await run(processors)).toMatchObject({ processed: 1, failed: 0 })
    expect(rows[0]).toMatchObject({ error: null })
    expect(rows[0].processed_at).not.toBeNull()
  })

  it("records a processor that hangs as timed out and moves on", async () => {
    vi.useFakeTimers()
    rows = [row("1"), row("2")]
    let signal: AbortSignal | undefined
    const processor: InboundProcessor = async (_db, event, s) => {
      if (event.id === "1") {
        signal = s
        await new Promise(() => {})
      }
    }
    const result = run({ statement_import: processor })
    await vi.advanceTimersByTimeAsync(PROCESSOR_TIMEOUT_MS)
    expect(await result).toEqual({ processed: 1, failed: 1, waiting: 0 })
    expect(signal?.aborted).toBe(true)
    expect(rows[0]).toMatchObject({ processed_at: null, error: "processing_timeout" })
    expect(rows[1].processed_at).not.toBeNull()
  })

  it("never picks forged, processed or just-received events", async () => {
    rows = [
      row("forged", { signature_valid: false, processed_at: "2026-11-01T09:00:00Z", error: "signature_invalid" }),
      row("done", { processed_at: "2026-11-01T09:00:00Z" }),
      row("new", { received_at: new Date(NOW - REPROCESS_GRACE_MS + 1000).toISOString() }),
    ]
    const processor = vi.fn(async () => {})
    expect(await run({ statement_import: processor })).toEqual({ processed: 0, failed: 0, waiting: 0 })
    expect(processor).not.toHaveBeenCalled()
  })

  it("leaves events of channels without a processor pending and counts them", async () => {
    rows = [row("1", { channel: "payos" }), row("2", { channel: "bank_api" }), row("3")]
    const processor = vi.fn(async () => {})

    expect(await run({})).toEqual({ processed: 0, failed: 0, waiting: 3 })
    expect(calls).toHaveLength(1)

    expect(await run({ statement_import: processor })).toEqual({ processed: 1, failed: 0, waiting: 2 })
    expect(processor).toHaveBeenCalledTimes(1)
    expect(rows.filter((r) => r.processed_at).map((r) => r.id)).toEqual(["3"])
  })

  it("tries never-tried events before ones that already failed", async () => {
    const old = new Date(NOW - 60 * 60 * 1000).toISOString()
    rows = [
      ...Array.from({ length: REPROCESS_BATCH }, (_, i) => row(`failed-${i}`, { received_at: old, error: "boom" })),
      row("fresh"),
    ]
    const seen: string[] = []
    await run({
      statement_import: async (_db, event) => {
        seen.push(event.id)
        throw new InboundError("BOOM")
      },
    })
    expect(seen[0]).toBe("fresh")
    expect(seen).toHaveLength(REPROCESS_BATCH)
  })

  it("rotates through failed events so the oldest ones cannot hold every retry slot", async () => {
    const at = (minutes: number) => new Date(NOW - minutes * 60 * 1000).toISOString()
    rows = [
      ...Array.from({ length: REPROCESS_BATCH }, (_, i) =>
        row(`poison-${String(i).padStart(2, "0")}`, { received_at: at(120 - i), error: "GIVE_ACCOUNT_NOT_FOUND" })
      ),
      row("transient", { received_at: at(30), error: "GIVE_BINDING_CHANGED" }),
    ]
    const seen: string[] = []
    const processors: InboundProcessors = {
      statement_import: async (_db, event) => {
        seen.push(event.id)
        if (event.id !== "transient") throw new Error("GIVE_ACCOUNT_NOT_FOUND")
      },
    }

    await run(processors, { random: () => 0 })
    expect(seen).not.toContain("transient")

    seen.length = 0
    await run(processors, { random: () => 0.999 })
    expect(seen).toContain("transient")
    expect(seen).toHaveLength(REPROCESS_BATCH)
    expect(rows.find((r) => r.id === "transient")!.processed_at).not.toBeNull()
  })

  it("stops taking new events once the time budget is spent", async () => {
    rows = [row("1"), row("2"), row("3")]
    let t = NOW
    const processor = vi.fn(async () => {
      t += REPROCESS_BUDGET_MS
    })
    expect(await run({ statement_import: processor }, { now: () => t })).toMatchObject({ processed: 2 })
    expect(processor).toHaveBeenCalledTimes(2)
    expect(rows[2].processed_at).toBeNull()
  })

  it("counts an event another run already processed as processed", async () => {
    rows = [row("1")]
    const processors: InboundProcessors = {
      statement_import: async () => {
        // The other run completes the event while this one is failing.
        rows[0].processed_at = new Date(NOW).toISOString()
        throw new Error("GIVE_TRANSACTION_CONFLICT")
      },
    }
    expect(await run(processors)).toMatchObject({ processed: 1, failed: 0 })
    expect(rows[0].error).toBeNull()
  })

  it("throws when the pending events cannot be read", async () => {
    const broken = fakeDb(() => ({ error: { message: "permission denied" } })) as unknown as Db
    await expect(reprocessPendingInboundEvents(broken, { processors: {} })).rejects.toThrow("permission denied")
  })
})

describe("failureCode", () => {
  it("keeps only codes, never free text", () => {
    expect(failureCode(new InboundError("STATEMENT_ROW_INVALID"))).toBe("STATEMENT_ROW_INVALID")
    expect(failureCode(new Error("GIVE_TRANSITION_NOT_ALLOWED: live -> closed"))).toBe("GIVE_TRANSITION_NOT_ALLOWED")
    expect(failureCode({ code: "P0001", message: "GIVE_ACCOUNT_NOT_FOUND" })).toBe("GIVE_ACCOUNT_NOT_FOUND")
    expect(failureCode(new Error("fetch https://api.example/x?token=secret failed"))).toBe("processing_failed")
    expect(failureCode(new Error("account 0123456789 not found"))).toBe("processing_failed")
    expect(failureCode(new InboundError("lower case with spaces"))).toBe("processing_failed")
    expect(failureCode("GIVE_X")).toBe("processing_failed")
    expect(failureCode(null)).toBe("processing_failed")
  })
})
