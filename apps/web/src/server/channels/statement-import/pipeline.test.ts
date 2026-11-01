import { createHash } from "node:crypto"

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Db } from "@/lib/campaigns"
import { PROCESSOR_TIMEOUT_MS, reprocessPendingInboundEvents, REPROCESS_GRACE_MS } from "@/server/inbound"
import { inboundProcessors } from "@/server/inbound/processors"
import { ParserRegistry } from "@/server/statement-parsers/registry"
import { CSV_COLUMNS, csvFile, csvStatementParser } from "@/test/csv-statement-parser"
import { fakeDb, op, type Call, type Handler, type Result } from "@/test/fake-db"

import { StatementImportError } from "./errors"
import {
  importStatementFile,
  MAX_PAYLOAD_BYTES,
  runStatementEvent,
  statementDedupeKey,
  statementImportProcessor,
  type StatementPayload,
} from "./pipeline"
import { importStatementBatch, recordStatementEvent, stageStatementImport } from "./rpc"

const NOW = new Date("2026-10-05T03:00:00Z")
const ACCOUNT = "11111111-1111-4111-8111-111111111111"
const ACTOR = "22222222-2222-4222-8222-222222222222"
const EVENT = "33333333-3333-4333-8333-333333333333"
const BATCH = "44444444-4444-4444-8444-444444444444"

const parsers = new ParserRegistry([
  csvStatementParser(),
  csvStatementParser({ name: "test-csv-noid", hasStableRowId: false }),
  csvStatementParser({ name: "other-bank", bankBins: ["970415"] }),
  csvStatementParser({
    name: "broken",
    parse: () => {
      throw new Error("unexpected cell 0123456789")
    },
  }),
])

const FILE = csvFile(
  "period_from,2026-10-01",
  "period_to,2026-10-02",
  CSV_COLUMNS,
  "2026-10-01T09:15:00+07:00,in,50000,150000,FT001,MBVCB.123.GVABCDEF.CT,NGUYEN VAN A,0123456789",
  "2026-10-01T10:00:00+07:00,in,20000,170000,FT002,UNG HO,TRAN B,9876543210",
  "2026-10-02,out,1100,168900,FT003,PHI SMS,,"
)

const payload = (): StatementPayload => ({
  version: 1,
  account_id: ACCOUNT,
  actor_id: ACTOR,
  parser: "test-csv",
  has_stable_row_id: true,
  has_running_balance: true,
  period_from: "2026-10-01",
  period_to: "2026-10-02",
  opening_balance: "100000",
  closing_balance: null,
  exported_at: "2026-10-03T01:00:00.000Z",
  rows: [
    {
      booked_at: "2026-10-01T02:15:00.000Z",
      booked_date_only: false,
      direction: "in",
      amount: "50000",
      description: "GVABCDEF",
      counterparty_name: null,
      counterparty_account: "****6789",
      balance_after: "150000",
      provider_tx_id: "FT001",
      raw: null,
    },
  ],
})

let userCalls: Call[]
let serviceCalls: Call[]
let account: Result
let responses: Record<string, Result>

function handler(call: Call): Result | undefined {
  return responses[call.target]
}

function dbs() {
  return {
    user: fakeDb(() => account, userCalls) as unknown as Db,
    service: fakeDb(handler, serviceCalls) as unknown as Db,
  }
}

function upload(overrides: Partial<Parameters<typeof importStatementFile>[0]> = {}) {
  return importStatementFile(
    { receivingAccountId: ACCOUNT, actorId: ACTOR, parser: "test-csv", file: FILE, ...overrides },
    { ...dbs(), parsers, now: NOW }
  )
}

function rpc(name: string): Call | undefined {
  return serviceCalls.find((c) => c.target === `rpc:${name}`)
}

function args(name: string): Record<string, unknown> {
  return op(rpc(name), "args")?.[0] as Record<string, unknown>
}

beforeEach(() => {
  userCalls = []
  serviceCalls = []
  account = { data: { id: ACCOUNT, channel: "statement_import", bank_bin: "970436" } }
  responses = {
    "rpc:record_inbound_event": { data: { inbound_event_id: EVENT, created: true, processed_at: null } },
    "rpc:stage_statement_import": {
      data: { import_batch_id: BATCH, created: true, ready: 2, duplicate: 0, ambiguous: 1 },
    },
    "rpc:import_statement_batch": { data: { imported: 2, duplicate: 0, ambiguous: 1, ready: 0 } },
    "rpc:complete_inbound_event": { data: "2026-10-05T03:00:01Z" },
  }
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("importStatementFile", () => {
  it("records the file, stages it, imports its ready rows and completes the event", async () => {
    const result = await upload()
    expect(result).toEqual({
      status: "imported",
      inboundEventId: EVENT,
      replayed: false,
      parser: "test-csv",
      importBatchId: BATCH,
      created: true,
      imported: 2,
      duplicate: 0,
      ambiguous: 1,
      ready: 0,
    })
    expect(serviceCalls.map((c) => c.target)).toEqual([
      "statement_import_batches",
      "rpc:record_inbound_event",
      "rpc:stage_statement_import",
      "rpc:import_statement_batch",
      "rpc:complete_inbound_event",
    ])
    expect(args("complete_inbound_event")).toEqual({ p_inbound_event_id: EVENT, p_error: null })
  })

  it("reads the account as the uploader, so RLS decides who may import", async () => {
    await upload()
    expect(userCalls).toHaveLength(1)
    expect(userCalls[0].target).toBe("receiving_accounts")
    expect(op(userCalls[0], "eq")).toEqual(["id", ACCOUNT])
  })

  it("records one authentic statement_import event per account and file, with the normalized statement", async () => {
    await upload()
    const sha = createHash("sha256").update(FILE).digest("hex")
    const recorded = args("record_inbound_event")
    expect(recorded).toMatchObject({
      p_channel: "statement_import",
      p_dedupe_key: `v1:${ACCOUNT}:${sha}`,
      p_signature_valid: true,
    })
    const payload = recorded.p_payload as StatementPayload
    expect(payload).toMatchObject({
      version: 1,
      account_id: ACCOUNT,
      actor_id: ACTOR,
      parser: "test-csv",
      has_stable_row_id: true,
      has_running_balance: true,
      period_from: "2026-10-01",
      period_to: "2026-10-02",
    })
    expect(payload.rows.map((r) => [r.provider_tx_id, r.amount, r.counterparty_account])).toEqual([
      ["FT001", "50000", "****6789"],
      ["FT002", "20000", "****3210"],
      ["FT003", "1100", null],
    ])
    // Outside the parser's raw cells, the full counterparty account is not stored.
    expect(JSON.stringify(payload.rows.map(({ raw: _raw, ...rest }) => rest))).not.toContain("0123456789")
    expect(statementDedupeKey(ACCOUNT.toUpperCase(), FILE)).toBe(recorded.p_dedupe_key)
  })

  it("passes the event and the staged statement to give.stage_statement_import", async () => {
    await upload()
    const payload = args("record_inbound_event").p_payload as StatementPayload
    expect(args("stage_statement_import")).toEqual({
      p_receiving_account_id: ACCOUNT,
      p_actor_id: ACTOR,
      p_inbound_event_id: EVENT,
      p_parser: "test-csv",
      p_has_stable_row_id: true,
      p_has_running_balance: true,
      p_rows: payload.rows,
      p_period_from: "2026-10-01",
      p_period_to: "2026-10-02",
      p_opening_balance: null,
      p_closing_balance: null,
      p_exported_at: NOW.toISOString(),
    })
    expect(args("import_statement_batch")).toEqual({ p_import_batch_id: BATCH })
    expect(op(rpc("stage_statement_import"), "abortSignal")?.[0]).toBeInstanceOf(AbortSignal)
    expect(op(rpc("stage_statement_import"), "single")).toEqual([])
  })

  it("replays the same file from what its first upload recorded, as the current uploader", async () => {
    const OTHER = "55555555-5555-4555-8555-555555555555"
    const first = { ...payload(), actor_id: OTHER, parser: "test-csv-v0" }
    responses["rpc:record_inbound_event"] = {
      data: { inbound_event_id: EVENT, created: false, processed_at: "2026-10-05T02:00:00Z" },
    }
    responses["inbound_events"] = { data: { payload: first } }
    responses["rpc:stage_statement_import"] = {
      data: { import_batch_id: BATCH, created: false, ready: 0, duplicate: 0, ambiguous: 1 },
    }
    responses["rpc:import_statement_batch"] = { data: { imported: 2, duplicate: 0, ambiguous: 1, ready: 0 } }
    expect(await upload()).toMatchObject({
      status: "imported",
      replayed: true,
      parser: "test-csv-v0",
      created: false,
      imported: 2,
      ambiguous: 1,
    })
    // The stored statement is staged, not this upload's parse, by whoever
    // uploads now (the first uploader may have lost access since).
    expect(args("stage_statement_import")).toMatchObject({
      p_actor_id: ACTOR,
      p_parser: "test-csv-v0",
      p_rows: first.rows,
    })
    expect(
      op(
        serviceCalls.find((c) => c.target === "inbound_events"),
        "eq"
      )
    ).toEqual(["id", EVENT])
  })

  it("replays with this upload's statement when the recorded one is no longer readable", async () => {
    responses["rpc:record_inbound_event"] = { data: { inbound_event_id: EVENT, created: false, processed_at: null } }
    responses["inbound_events"] = { data: { payload: { ...payload(), version: 0 } } }
    expect(await upload()).toMatchObject({ status: "imported", replayed: true, parser: "test-csv" })
    expect(args("stage_statement_import")).toMatchObject({ p_parser: "test-csv", p_actor_id: ACTOR })
  })

  it("still reads payloads recorded without an export time", async () => {
    responses["rpc:record_inbound_event"] = { data: { inbound_event_id: EVENT, created: false, processed_at: null } }
    responses["inbound_events"] = { data: { payload: { ...payload(), exported_at: null } } }
    await upload()
    expect(args("stage_statement_import")).toMatchObject({ p_exported_at: null, p_rows: payload().rows })
  })

  it("keeps a period refusal pending: it depends on the database's clock", async () => {
    responses["rpc:stage_statement_import"] = { error: { code: "23514", message: "GIVE_IMPORT_PERIOD_INVALID" } }
    expect(await upload()).toMatchObject({ status: "pending", code: "GIVE_IMPORT_PERIOD_INVALID" })
  })

  it("refuses before recording when the parser was used with other format flags", async () => {
    responses["statement_import_batches"] = { data: [{ has_stable_row_id: false, has_running_balance: true }] }
    await expect(upload()).rejects.toMatchObject({ code: "STATEMENT_PARSER_FLAGS_CHANGED" })
    expect(rpc("record_inbound_event")).toBeUndefined()
    const lookup = serviceCalls.find((c) => c.target === "statement_import_batches")
    expect(lookup?.ops.filter(([name]) => name === "eq")).toEqual([
      ["eq", "receiving_account_id", ACCOUNT],
      ["eq", "parser", "test-csv"],
    ])
  })

  it("reports a refusal the database will repeat, with its code and row", async () => {
    responses["rpc:stage_statement_import"] = {
      error: { code: "23514", message: "GIVE_IMPORT_ROW_INVALID: row 3 booked_at" },
    }
    expect(await upload()).toEqual({
      status: "refused",
      inboundEventId: EVENT,
      replayed: false,
      parser: "test-csv",
      code: "GIVE_IMPORT_ROW_INVALID",
      row: 3,
    })
    expect(rpc("import_statement_batch")).toBeUndefined()
    expect(args("complete_inbound_event")).toEqual({ p_inbound_event_id: EVENT, p_error: "GIVE_IMPORT_ROW_INVALID" })
  })

  it("stores only a generic code for a failure that is not a GIVE_* error", async () => {
    responses["rpc:import_statement_batch"] = { error: { code: "57014", message: "canceling statement 0123456789" } }
    expect(await upload()).toEqual({
      status: "pending",
      inboundEventId: EVENT,
      replayed: false,
      parser: "test-csv",
      code: "processing_failed",
    })
    expect(args("complete_inbound_event").p_error).toBe("processing_failed")
  })

  it("reports a timed-out attempt as processing_timeout, as the event records it", async () => {
    vi.useFakeTimers()
    try {
      responses["rpc:complete_inbound_event"] = { data: null }
      const base = fakeDb(handler, serviceCalls)
      const hanging = { abortSignal: () => hanging, single: () => new Promise(() => {}) }
      const service = {
        ...base,
        rpc: (fn: string, a: unknown) => (fn === "stage_statement_import" ? hanging : base.rpc(fn, a)),
      } as unknown as Db
      const result = importStatementFile(
        { receivingAccountId: ACCOUNT, actorId: ACTOR, parser: "test-csv", file: FILE },
        { user: dbs().user, service, parsers, now: NOW }
      )
      await vi.advanceTimersByTimeAsync(PROCESSOR_TIMEOUT_MS + 1)
      expect(await result).toMatchObject({ status: "pending", code: "processing_timeout" })
      expect(args("complete_inbound_event")).toEqual({ p_inbound_event_id: EVENT, p_error: "processing_timeout" })
    } finally {
      vi.useRealTimers()
    }
  })

  it("returns the counts when another run processed the event meanwhile", async () => {
    let stages = 0
    const service = fakeDb((call) => {
      if (call.target === "rpc:stage_statement_import" && (stages += 1) === 1) {
        return { error: { code: "55P03", message: "canceling statement due to lock timeout" } }
      }
      return handler(call)
    }, serviceCalls) as unknown as Db
    const result = await importStatementFile(
      { receivingAccountId: ACCOUNT, actorId: ACTOR, parser: "test-csv", file: FILE },
      { user: dbs().user, service, parsers, now: NOW }
    )
    expect(result).toMatchObject({ status: "imported", imported: 2 })
    expect(stages).toBe(2)
  })

  it("reports the import even when its outcome could not be written (the cron finishes it)", async () => {
    responses["rpc:complete_inbound_event"] = { error: { code: "08006", message: "connection lost" } }
    expect(await upload()).toMatchObject({ status: "imported", imported: 2 })
  })

  describe("refuses before recording anything", () => {
    async function refused(promise: Promise<unknown>) {
      const err = await promise.then(
        () => null,
        (e: unknown) => e
      )
      expect(err).toBeInstanceOf(StatementImportError)
      expect(serviceCalls).toEqual([])
      return err as StatementImportError
    }

    it("an account the uploader cannot see", async () => {
      account = { data: null }
      expect((await refused(upload())).code).toBe("STATEMENT_ACCOUNT_NOT_FOUND")
    })

    it("ids that are not uuids, without a query", async () => {
      expect((await refused(upload({ receivingAccountId: "1 or 1=1" }))).code).toBe("STATEMENT_ACCOUNT_NOT_FOUND")
      expect(userCalls).toEqual([])
    })

    it.each(["bank_api", "payos", "crypto"])("an account of the %s channel", async (channel) => {
      account = { data: { id: ACCOUNT, channel, bank_bin: "970436" } }
      expect((await refused(upload())).code).toBe("STATEMENT_CHANNEL_NOT_SUPPORTED")
    })

    it("a parser that is not registered", async () => {
      expect((await refused(upload({ parser: "vcb-xlsx" }))).code).toBe("STATEMENT_PARSER_UNKNOWN")
    })

    it("a parser of another bank", async () => {
      expect((await refused(upload({ parser: "other-bank" }))).code).toBe("STATEMENT_PARSER_WRONG_BANK")
    })

    it("a file the parser cannot read, without the parser's message", async () => {
      const err = await refused(upload({ parser: "broken" }))
      expect(err.code).toBe("STATEMENT_PARSE_FAILED")
      expect(err.message).not.toContain("0123456789")
    })

    it("an empty or oversized file", async () => {
      expect((await refused(upload({ file: new Uint8Array() }))).code).toBe("STATEMENT_FILE_INVALID")
      expect((await refused(upload({ file: new Uint8Array(10 * 1024 * 1024 + 1) }))).code).toBe(
        "STATEMENT_FILE_INVALID"
      )
    })

    it("a statement the staging RPC would refuse", async () => {
      const file = csvFile(
        "period_from,2026-10-01",
        "period_to,2026-10-02",
        CSV_COLUMNS,
        "2026-10-02T09:00:00+07:00,in,50000,150000,FT001,A,,",
        "2026-10-01T09:00:00+07:00,in,50000,200000,FT002,B,,"
      )
      const err = await refused(upload({ file }))
      expect([err.code, err.row]).toEqual(["STATEMENT_ROWS_NOT_CHRONOLOGICAL", 2])
    })

    it("a format without ids whose file states no period", async () => {
      const file = csvFile(CSV_COLUMNS, "2026-10-01T09:00:00+07:00,in,50000,150000,,A,,")
      expect((await refused(upload({ parser: "test-csv-noid", file }))).code).toBe("STATEMENT_PERIOD_REQUIRED")
    })

    it("a statement too large for one inbound event", async () => {
      const description = "X".repeat(900)
      const lines = Array.from(
        { length: 1100 },
        (_, i) => `2026-10-01T09:00:00+07:00,in,1000,${1000 * (i + 1)},FT${i},${description},,`
      )
      const file = csvFile("period_from,2026-10-01", "period_to,2026-10-02", CSV_COLUMNS, ...lines)
      expect(file.byteLength).toBeGreaterThan(MAX_PAYLOAD_BYTES)
      expect((await refused(upload({ file }))).code).toBe("STATEMENT_TOO_LARGE")
    })
  })
})

describe("statement_import processor", () => {
  it("is registered for the reprocess-inbound cron", () => {
    expect(inboundProcessors.statement_import).toBe(statementImportProcessor)
  })

  it("stages and imports a stored upload from its payload alone", async () => {
    const db = fakeDb(handler, serviceCalls) as unknown as Db
    expect(await runStatementEvent(db, { id: EVENT, payload: payload() })).toEqual({
      importBatchId: BATCH,
      created: true,
      imported: 2,
      duplicate: 0,
      ambiguous: 1,
      ready: 0,
    })
    expect(args("stage_statement_import")).toMatchObject({
      p_receiving_account_id: ACCOUNT,
      p_actor_id: ACTOR,
      p_inbound_event_id: EVENT,
      p_opening_balance: "100000",
      p_rows: payload().rows,
    })
  })

  it.each<[string, unknown]>([
    ["no payload", null],
    ["another version", { ...payload(), version: 2 }],
    ["no rows", { ...payload(), rows: [] }],
    ["a number amount", { ...payload(), rows: [{ ...payload().rows[0], amount: 50000 }] }],
    ["a bad account id", { ...payload(), account_id: "x" }],
  ])("refuses %s without calling the database", async (_name, body) => {
    const db = fakeDb(handler, serviceCalls) as unknown as Db
    await expect(runStatementEvent(db, { id: EVENT, payload: body })).rejects.toThrow("STATEMENT_PAYLOAD_INVALID")
    expect(serviceCalls).toEqual([])
  })

  it("stops between staging and import when the attempt is aborted", async () => {
    const controller = new AbortController()
    const db = fakeDb((call) => {
      if (call.target === "rpc:stage_statement_import") controller.abort()
      return handler(call)
    }, serviceCalls) as unknown as Db
    await expect(runStatementEvent(db, { id: EVENT, payload: payload() }, controller.signal)).rejects.toThrow()
    expect(rpc("import_statement_batch")).toBeUndefined()
  })

  it("is run by the cron on a pending event and completes it", async () => {
    const event = {
      id: EVENT,
      channel: "statement_import",
      dedupe_key: "v1:x",
      received_at: new Date(NOW.getTime() - REPROCESS_GRACE_MS - 1000).toISOString(),
    }
    const handle: Handler = (call) => {
      if (call.target === "inbound_events") {
        if (op(call, "select")?.[1]) return { count: 0 }
        if (op(call, "maybeSingle")) return { data: { dedupe_key: event.dedupe_key, payload: payload() } }
        // Never-tried events (error IS NULL) hold this one; no failed ones.
        return { data: call.ops.some(([name, column]) => name === "is" && column === "error") ? [event] : [] }
      }
      if (call.target === "rpc:complete_inbound_event") {
        const p = (op(call, "args")?.[0] as { p_error: string | null }).p_error
        return { data: p === null ? NOW.toISOString() : null }
      }
      return handler(call)
    }
    const db = fakeDb(handle, serviceCalls) as unknown as Db
    const result = await reprocessPendingInboundEvents(db, { processors: inboundProcessors, now: () => NOW.getTime() })
    expect(result).toEqual({ processed: 1, failed: 0, waiting: 0 })
    expect(serviceCalls.filter((c) => c.target.startsWith("rpc:")).map((c) => c.target)).toEqual([
      "rpc:complete_inbound_event",
      "rpc:stage_statement_import",
      "rpc:import_statement_batch",
      "rpc:complete_inbound_event",
    ])
  })
})

describe("RPC wrappers", () => {
  it("map a GIVE_* error to its code and row, and keep other messages out", async () => {
    const db = fakeDb(
      () => ({ error: { code: "P0001", message: "GIVE_IMPORT_ROW_OUTSIDE_PERIOD: row 12" } }),
      []
    ) as unknown as Db
    const err = await stageStatementImport(db, {
      ...{ parser: "p", has_stable_row_id: true, has_running_balance: false, rows: [] },
      ...{ period_from: null, period_to: null, opening_balance: null, closing_balance: null },
      exported_at: NOW.toISOString(),
      accountId: ACCOUNT,
      actorId: ACTOR,
      inboundEventId: EVENT,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StatementImportError)
    expect(err).toMatchObject({ code: "GIVE_IMPORT_ROW_OUTSIDE_PERIOD", row: 12 })

    const other = fakeDb(() => ({ error: { code: "42501", message: "permission denied for 0123456789" } }), [])
    const plain = await importStatementBatch(other as unknown as Db, BATCH).catch((e: unknown) => e)
    expect(plain).not.toBeInstanceOf(StatementImportError)
    expect((plain as Error).message).toBe("import_statement_batch failed: 42501")
  })

  it("refuse a response without the expected rows", async () => {
    const empty = fakeDb(() => ({ data: null }), []) as unknown as Db
    await expect(recordStatementEvent(empty, "k", {})).rejects.toThrow("no event")
    await expect(importStatementBatch(empty, BATCH)).rejects.toThrow("no counts")
  })
})
