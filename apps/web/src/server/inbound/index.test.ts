import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Db } from "@/lib/campaigns"
import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  REPROCESS_BATCH,
  REPROCESS_BUDGET_MS,
  REPROCESS_GRACE_MS,
  reprocessPendingInboundEvents,
  type InboundEvent,
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
  let limit = Infinity
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
    if (name === "limit") limit = args[0] as number
  }
  result = result.slice(0, limit)
  const [columns, options] = op(call, "select") as [string, { head?: boolean } | undefined]
  if (options?.head) return { count: result.length }
  const keys = columns.split(", ") as (keyof Row)[]
  return { data: result.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]]))) }
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

const clock = () => NOW

beforeEach(() => {
  rows = []
  calls = []
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("reprocessPendingInboundEvents", () => {
  it("processes pending events once; a second run changes nothing", async () => {
    rows = [row("1"), row("2")]
    const seen: string[] = []
    const processors: InboundProcessors = {
      statement_import: async (_db, event) => {
        seen.push(event.id)
      },
    }

    expect(await reprocessPendingInboundEvents(db(), processors, clock)).toEqual({
      processed: 2,
      failed: 0,
      waiting: 0,
    })
    expect(seen).toEqual(["1", "2"])
    expect(rows.every((r) => r.processed_at !== null)).toBe(true)
    const after = structuredClone(rows)

    calls.length = 0
    expect(await reprocessPendingInboundEvents(db(), processors, clock)).toEqual({
      processed: 0,
      failed: 0,
      waiting: 0,
    })
    expect(seen).toEqual(["1", "2"])
    expect(rows).toEqual(after)
    expect(calls.some((c) => c.target.startsWith("rpc:"))).toBe(false)
  })

  it("stores a failure on the event and leaves it pending for the next run", async () => {
    rows = [row("1")]
    let attempts = 0
    const processors: InboundProcessors = {
      statement_import: async () => {
        attempts += 1
        if (attempts === 1) throw new Error("GIVE_ACCOUNT_NOT_FOUND")
      },
    }

    expect(await reprocessPendingInboundEvents(db(), processors, clock)).toMatchObject({ processed: 0, failed: 1 })
    expect(rows[0]).toMatchObject({ processed_at: null, error: "GIVE_ACCOUNT_NOT_FOUND" })

    expect(await reprocessPendingInboundEvents(db(), processors, clock)).toMatchObject({ processed: 1, failed: 0 })
    expect(rows[0]).toMatchObject({ error: null })
    expect(rows[0].processed_at).not.toBeNull()
  })

  it("never picks forged, processed or just-received events", async () => {
    rows = [
      row("forged", { signature_valid: false, processed_at: "2026-11-01T09:00:00Z", error: "signature_invalid" }),
      row("done", { processed_at: "2026-11-01T09:00:00Z" }),
      row("new", { received_at: new Date(NOW - REPROCESS_GRACE_MS + 1000).toISOString() }),
    ]
    const processor = vi.fn(async () => {})
    expect(await reprocessPendingInboundEvents(db(), { statement_import: processor }, clock)).toEqual({
      processed: 0,
      failed: 0,
      waiting: 0,
    })
    expect(processor).not.toHaveBeenCalled()
  })

  it("leaves events of channels without a processor pending and counts them", async () => {
    rows = [row("1", { channel: "payos" }), row("2", { channel: "bank_api" }), row("3")]
    const processor = vi.fn(async () => {})

    expect(await reprocessPendingInboundEvents(db(), {}, clock)).toEqual({ processed: 0, failed: 0, waiting: 3 })
    expect(calls).toHaveLength(1)

    expect(await reprocessPendingInboundEvents(db(), { statement_import: processor }, clock)).toEqual({
      processed: 1,
      failed: 0,
      waiting: 2,
    })
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
    await reprocessPendingInboundEvents(
      db(),
      {
        statement_import: async (_db, event) => {
          seen.push(event.id)
          throw new Error("boom")
        },
      },
      clock
    )
    expect(seen[0]).toBe("fresh")
    expect(seen).toHaveLength(REPROCESS_BATCH)
  })

  it("stops taking new events once the time budget is spent", async () => {
    rows = [row("1"), row("2"), row("3")]
    let t = NOW
    const processor = vi.fn(async () => {
      t += REPROCESS_BUDGET_MS
    })
    expect(await reprocessPendingInboundEvents(db(), { statement_import: processor }, () => t)).toMatchObject({
      processed: 2,
    })
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
    expect(await reprocessPendingInboundEvents(db(), processors, clock)).toMatchObject({ processed: 1, failed: 0 })
    expect(rows[0].error).toBeNull()
  })

  it("throws when the pending events cannot be read", async () => {
    const broken = fakeDb(() => ({ error: { message: "permission denied" } })) as unknown as Db
    await expect(reprocessPendingInboundEvents(broken, {}, clock)).rejects.toThrow("permission denied")
  })
})
