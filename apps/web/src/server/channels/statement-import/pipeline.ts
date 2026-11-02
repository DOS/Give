import "server-only"

import { createHash } from "node:crypto"

import { z } from "zod"

import type { Db } from "@/lib/campaigns"
import {
  failureCode,
  InboundError,
  processInboundEvent,
  PROCESSOR_TIMEOUT_MS,
  type InboundEvent,
  type InboundProcessor,
} from "@/server/inbound"
import { statementParsers, type ParserRegistry } from "@/server/statement-parsers"
import { PARSER_NAME } from "@/server/statement-parsers/registry"

import { StatementImportError } from "./errors"
import { jsonbTextBytes, MAX_ROWS, normalizeStatement, type StagedStatement } from "./normalize"
import {
  importStatementBatch,
  recordStatementEvent,
  stageStatementImport,
  type ImportResult,
  type RecordedEvent,
} from "./rpc"
import { splitStatement, type StatementPart } from "./split"

/**
 * The statement_import channel's pipeline (design sections 5.1 and 5.2):
 *
 *   file -> parser -> normalizeStatement -> give.record_inbound_event
 *        -> give.stage_statement_import -> give.import_statement_batch
 *
 * The inbound event's payload holds the normalized statement, so the
 * reprocess-inbound cron can finish an upload whose request died, without the
 * file or the parser. Everything after the event is idempotent per event.
 * Ambiguous rows wait in the staging queue for finance/admin staff
 * (give.resolve_statement_import_row).
 */

/** Largest file accepted; real exports of one account are far smaller. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024
/**
 * Largest payload, measured as jsonb text (give.inbound_events.payload holds
 * at most 1 MiB of it). A larger statement is split into parts by day.
 */
export const MAX_PAYLOAD_BYTES = 1_000_000
/**
 * An upload starts no part after this long; the rest wait for the
 * reprocess-inbound cron. With up to two processor attempts per part (the
 * attempt and a replay), the last part ends within the upload route's 60 s.
 */
export const INLINE_BUDGET_MS = 20 * 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const BALANCE = /^-?\d{1,15}$/

const rowSchema = z.object({
  booked_at: z.string().min(10).max(40),
  booked_date_only: z.boolean(),
  direction: z.enum(["in", "out"]),
  amount: z.string().regex(/^\d{1,13}$/),
  description: z.string().nullable(),
  counterparty_name: z.string().nullable(),
  counterparty_account: z.string().nullable(),
  balance_after: z.string().regex(BALANCE).nullable(),
  provider_tx_id: z.string().nullable(),
  raw: z.record(z.string(), z.unknown()).nullable(),
})

const payloadSchema = z.object({
  version: z.literal(1),
  account_id: z.string().regex(UUID),
  actor_id: z.string().regex(UUID),
  parser: z.string().regex(PARSER_NAME),
  has_stable_row_id: z.boolean(),
  has_running_balance: z.boolean(),
  period_from: z.string().regex(DAY).nullable(),
  period_to: z.string().regex(DAY).nullable(),
  opening_balance: z.string().regex(BALANCE).nullable(),
  closing_balance: z.string().regex(BALANCE).nullable(),
  // Null in payloads recorded before the upload time was filled in.
  exported_at: z.string().nullable(),
  rows: z.array(rowSchema).min(1).max(MAX_ROWS),
})

/** What a statement upload's inbound event holds. */
export type StatementPayload = z.infer<typeof payloadSchema>

export function statementPayload(accountId: string, actorId: string, staged: StagedStatement): StatementPayload {
  return { version: 1, account_id: accountId, actor_id: actorId, ...staged }
}

/** One event per file and account: the same file uploaded again replays it. */
export function statementDedupeKey(accountId: string, file: Uint8Array): string {
  return `v1:${accountId.toLowerCase()}:${createHash("sha256").update(file).digest("hex")}`
}

export interface StatementBatchOutcome extends ImportResult {
  importBatchId: string
  /** False when the batch was staged by an earlier attempt or upload. */
  created: boolean
}

/** Stages the event's statement and imports its ready rows. */
export async function runStatementEvent(
  db: Db,
  event: Pick<InboundEvent, "id" | "payload">,
  signal?: AbortSignal
): Promise<StatementBatchOutcome> {
  const parsed = payloadSchema.safeParse(event.payload)
  if (!parsed.success) throw new StatementImportError("STATEMENT_PAYLOAD_INVALID")
  const { version: _version, account_id, actor_id, ...staged } = parsed.data
  const batch = await stageStatementImport(
    db,
    { ...staged, accountId: account_id, actorId: actor_id, inboundEventId: event.id },
    signal
  )
  signal?.throwIfAborted()
  const counts = await importStatementBatch(db, batch.importBatchId, signal)
  return { importBatchId: batch.importBatchId, created: batch.created, ...counts }
}

/**
 * A refusal of the statement itself, which no retry of the same event can
 * pass, becomes a final InboundError, so the event ends with its code instead
 * of being retried until it is parked.
 */
function asInboundFailure(err: unknown): unknown {
  const code = failureCode(err)
  return isContentRefusal(code) ? new InboundError(code, true) : err
}

/** The statement_import channel's processor for the reprocess-inbound cron. */
export const statementImportProcessor: InboundProcessor = async (db, event, signal) => {
  try {
    await runStatementEvent(db, event, signal)
  } catch (err) {
    throw asInboundFailure(err)
  }
}

export interface StatementUpload {
  receivingAccountId: string
  /** The signed-in user whose token `user` carries. */
  actorId: string
  /** Name of the parser the uploader picked. */
  parser: string
  file: Uint8Array
}

export interface StatementImportDeps {
  /** dbAs(the actor's token): proves the actor may read the account (its owner, or finance/admin staff). */
  user: Db
  /** dbService(): the RPCs are granted to service_role only. */
  service: Db
  parsers?: ParserRegistry
  now?: Date
  /** Milliseconds since some fixed point; the inline budget is measured with it. */
  clock?: () => number
}

interface ResultBase {
  inboundEventId: string
  /**
   * The same file was uploaded to this account before: the statement that
   * upload recorded (its parser and uploader) is what was processed.
   */
  replayed: boolean
  /** The parser whose rows were processed. */
  parser: string
}

/** What became of one part of an upload (one inbound event). */
export type StatementPartResult =
  | ({ status: "imported" } & ResultBase & StatementBatchOutcome)
  /**
   * The part is recorded but could not be staged or imported yet; the
   * reprocess-inbound cron retries it. `code` says why (processing_deferred:
   * the upload's time ran out before this part's turn).
   */
  | ({ status: "pending"; code: string; row?: number } & ResultBase)
  /**
   * The database refused the recorded statement and will refuse it again
   * (`code` is a GIVE_* code): the uploader fixes the file. A refusal of the
   * statement's content ends the event; an access refusal (the account or
   * the stored uploader) is retried by the cron and parked for staff.
   */
  | ({ status: "refused"; code: string; row?: number } & ResultBase)
  /**
   * This upload's attempt failed and was the event's last: the event is
   * parked, for a reason that is not a refusal of the file (a timeout, an
   * outage), and waits for finance/admin staff. Uploading the same file again
   * gives it one more attempt.
   */
  | ({ status: "parked" } & ResultBase)

interface UploadParts {
  /** Parts the file was split into (1 for most files). */
  parts: number
}

/**
 * An upload's outcome. Imported: every part was imported; the counts are the
 * file's, importBatchId is the first part's batch and importBatchIds lists
 * every part's. Otherwise the outcome of the first part that is refused, else
 * parked, else pending, with `part` its 1-based number, `row` a row number of
 * the file, and importedParts the parts that were imported.
 */
export type StatementImportResult =
  | (Extract<StatementPartResult, { status: "imported" }> & UploadParts & { importBatchIds: string[] })
  | (Exclude<StatementPartResult, { status: "imported" }> & UploadParts & { part: number; importedParts: number })

/** Refusals first, then parked parts (staff), then pending ones (the cron). */
const SEVERITY: Record<StatementPartResult["status"], number> = { refused: 3, parked: 2, pending: 1, imported: 0 }

/**
 * Refusals of the statement's content by the database: retrying the same
 * statement cannot succeed, so the event ends. GIVE_IMPORT_PERIOD_INVALID
 * compares with the database's clock, which may lag the app's near midnight,
 * so it stays pending. STATEMENT_PAYLOAD_INVALID is not here: it means this
 * app version cannot read a stored payload, which says nothing about the
 * statement; such an event is retried, parked for staff, and finished by an
 * upload of the file.
 */
function isContentRefusal(code: string): boolean {
  return (
    (code.startsWith("GIVE_IMPORT_") && code !== "GIVE_IMPORT_PERIOD_INVALID") || code === "GIVE_INBOUND_EVENT_INVALID"
  )
}

/**
 * Refusals the uploader is told about: the content ones, and access ones.
 * Access refusals are not final for the event: the cron stages as the stored
 * uploader, who may have lost access while the statement is fine, so such an
 * event is retried and parked where staff see it.
 */
function isFinalRefusal(code: string): boolean {
  return isContentRefusal(code) || isAccessRefusal(code)
}

/** The account or the uploader was refused, not the statement. */
export function isAccessRefusal(code: string): boolean {
  return code === "GIVE_ACCOUNT_NOT_FOUND" || code === "GIVE_NOT_ALLOWED"
}

/**
 * The dedupe key of one part. A file of one part keeps the plain key of
 * statementDedupeKey, as uploads before the split did.
 */
export function statementPartDedupeKey(fileKey: string, part: Pick<StatementPart, "index" | "count">): string {
  return part.count === 1 ? fileKey : `${fileKey}:part${part.index + 1}of${part.count}`
}

/**
 * Imports one uploaded statement file for a statement_import account. A
 * file is checked and parsed before anything is recorded; problems found then
 * throw StatementImportError (with the row number when one row is at fault).
 * A file too large for one inbound event, or too long for one attempt, is
 * split by day into parts (splitStatement); every part is recorded before any
 * is processed, so the cron can finish the upload if this request dies. The
 * parts are then processed inline, in file order, while INLINE_BUDGET_MS
 * lasts; a part that fails or does not get its turn stays pending for the
 * cron. Uploading the same file again is safe.
 *
 * The caller's route must keep its maxDuration above INLINE_BUDGET_MS plus
 * two processor attempts and below REPROCESS_GRACE_MS.
 */
export async function importStatementFile(
  upload: StatementUpload,
  { user, service, parsers = statementParsers, now = new Date(), clock = Date.now }: StatementImportDeps
): Promise<StatementImportResult> {
  const started = clock()
  if (!(upload.file instanceof Uint8Array) || upload.file.byteLength === 0 || upload.file.byteLength > MAX_FILE_BYTES) {
    throw new StatementImportError("STATEMENT_FILE_INVALID")
  }
  if (!UUID.test(upload.receivingAccountId) || !UUID.test(upload.actorId)) {
    throw new StatementImportError("STATEMENT_ACCOUNT_NOT_FOUND")
  }

  // Under the actor's own RLS: only the owner and finance/admin staff see the
  // account. give.stage_statement_import checks the actor again.
  const { data, error } = await user
    .from("receiving_accounts")
    .select("id, channel, bank_bin")
    .eq("id", upload.receivingAccountId)
    .maybeSingle()
  if (error) throw new Error(`receiving_accounts read failed: ${error.code ?? "unknown"}`)
  const account = data as { id: string; channel: string; bank_bin: string | null } | null
  if (!account) throw new StatementImportError("STATEMENT_ACCOUNT_NOT_FOUND")
  if (account.channel !== "statement_import") throw new StatementImportError("STATEMENT_CHANNEL_NOT_SUPPORTED")

  const parser = parsers.get(upload.parser)
  if (!parser) throw new StatementImportError("STATEMENT_PARSER_UNKNOWN")
  if (!account.bank_bin || !parser.bankBins.includes(account.bank_bin)) {
    throw new StatementImportError("STATEMENT_PARSER_WRONG_BANK")
  }

  let statement
  try {
    statement = await parser.parse(upload.file)
  } catch (err) {
    if (err instanceof StatementImportError) throw err
    throw new StatementImportError("STATEMENT_PARSE_FAILED")
  }
  const staged = normalizeStatement(parser, statement, now)
  const parts = splitStatement(
    staged,
    (part) => jsonbTextBytes(statementPayload(account.id, upload.actorId, part)),
    MAX_PAYLOAD_BYTES
  )

  // give.stage_statement_import refuses a parser name used before with other
  // format flags; check it before the event is recorded.
  const earlier = await service
    .from("statement_import_batches")
    .select("has_stable_row_id, has_running_balance")
    .eq("receiving_account_id", account.id)
    .eq("parser", parser.name)
    .limit(1)
  if (earlier.error) throw new Error(`statement_import_batches read failed: ${earlier.error.code ?? "unknown"}`)
  const flags = (earlier.data ?? []) as { has_stable_row_id: boolean; has_running_balance: boolean }[]
  if (
    flags.some(
      (b) => b.has_stable_row_id !== parser.hasStableRowId || b.has_running_balance !== parser.hasRunningBalance
    )
  ) {
    throw new StatementImportError("STATEMENT_PARSER_FLAGS_CHANGED")
  }

  const fileKey = statementDedupeKey(account.id, upload.file)
  const recorded: { key: string; payload: StatementPayload; event: RecordedEvent }[] = []
  for (const part of parts) {
    const key = statementPartDedupeKey(fileKey, part)
    const payload = statementPayload(account.id, upload.actorId, part.statement)
    recorded.push({ key, payload, event: await recordStatementEvent(service, key, payload) })
  }

  const results: StatementPartResult[] = []
  for (const { key, payload, event } of recorded) {
    if (clock() - started > INLINE_BUDGET_MS) {
      results.push({
        status: "pending",
        code: "processing_deferred",
        inboundEventId: event.inboundEventId,
        replayed: !event.created,
        parser: payload.parser,
      })
      continue
    }
    results.push(await processStatementPart(service, account.id, upload.actorId, key, payload, event, now))
  }

  const replayed = results.every((r) => r.replayed)
  if (results.every((r) => r.status === "imported")) {
    const imported = results as Extract<StatementPartResult, { status: "imported" }>[]
    const sum = (field: "imported" | "duplicate" | "ambiguous" | "ready") =>
      imported.reduce((total, r) => total + r[field], 0)
    return {
      ...imported[0],
      replayed,
      created: imported.some((r) => r.created),
      imported: sum("imported"),
      duplicate: sum("duplicate"),
      ambiguous: sum("ambiguous"),
      ready: sum("ready"),
      parts: parts.length,
      importBatchIds: imported.map((r) => r.importBatchId),
    }
  }
  let worst = 0
  results.forEach((r, i) => {
    if (SEVERITY[r.status] > SEVERITY[results[worst].status]) worst = i
  })
  const result = results[worst] as Exclude<StatementPartResult, { status: "imported" }>
  const extra = {
    replayed,
    parts: parts.length,
    part: worst + 1,
    importedParts: results.filter((r) => r.status === "imported").length,
  }
  if (result.status !== "parked" && result.row !== undefined) {
    return { ...result, ...extra, row: parts[worst].firstRow + result.row - 1 }
  }
  return { ...result, ...extra }
}

/** Processes one recorded part inline, as the uploader. */
async function processStatementPart(
  service: Db,
  accountId: string,
  actorId: string,
  dedupeKey: string,
  payload: StatementPayload,
  recorded: RecordedEvent,
  now: Date
): Promise<StatementPartResult> {
  // A file uploaded before is processed from the statement that upload
  // recorded, so the inline run and the cron always stage the same rows. It is
  // staged as the current uploader, whose access was just checked: the
  // uploader is not part of the statement, and the first one may have lost
  // access since.
  let stored: StatementPayload = payload
  if (!recorded.created) {
    const body = await service.from("inbound_events").select("payload").eq("id", recorded.inboundEventId).maybeSingle()
    if (body.error || !body.data) throw new Error(`inbound_events read failed: ${body.error?.code ?? "missing"}`)
    const earlierPayload = payloadSchema.safeParse((body.data as { payload: unknown }).payload)
    // A recorded payload this schema no longer reads (an older version) is
    // replaced by this upload's statement inline; the cron cannot read it
    // either, so only an upload can finish such an event.
    if (earlierPayload.success && earlierPayload.data.account_id === accountId) {
      stored = { ...earlierPayload.data, actor_id: actorId }
    }
  }
  const event: InboundEvent = {
    id: recorded.inboundEventId,
    channel: "statement_import",
    dedupe_key: dedupeKey,
    received_at: now.toISOString(),
    payload: stored,
  }
  const base: ResultBase = { inboundEventId: event.id, replayed: !recorded.created, parser: stored.parser }

  // processInboundEvent records the outcome on the event and never throws.
  // The wrapper keeps the counts or the failure for the uploader, unless the
  // attempt timed out: then the event says processing_timeout, and so do we.
  let outcome: StatementBatchOutcome | undefined
  let failure: unknown
  let attempt: AbortSignal | undefined
  // The uploader's access was just checked and the statement is staged as
  // them, so an upload of a parked event's file gets one more attempt
  // (resume): it finishes events the cron cannot, e.g. when the first
  // uploader has lost access since.
  const state = await processInboundEvent(
    service,
    event,
    async (db, ev, signal) => {
      attempt = signal
      try {
        const result = await runStatementEvent(db, ev, signal)
        if (!signal.aborted) outcome = result
      } catch (err) {
        if (!signal.aborted) failure = err
        throw asInboundFailure(err)
      }
    },
    { resume: true }
  )
  if (!outcome && state === "processed") {
    // Another run (the cron, a parallel upload) processed the event, or an
    // earlier upload of this file ended it with a final refusal: replaying it
    // is idempotent and returns its counts, or the refusal again (as this
    // uploader, with the statement as stored or as uploaded now).
    try {
      outcome = await runStatementEvent(service, event, AbortSignal.timeout(PROCESSOR_TIMEOUT_MS))
    } catch (err) {
      failure = err
    }
  }
  if (outcome) return { status: "imported", ...base, ...outcome }
  // No attempt ran when it could not be counted (or another is running), or
  // when the event was already processed: then the replay's failure says why.
  const code =
    attempt === undefined
      ? failure !== undefined
        ? failureCode(failure)
        : "processing_failed"
      : attempt.aborted || failure === undefined
        ? "processing_timeout"
        : failureCode(failure)
  const row = failure instanceof StatementImportError ? failure.row : undefined
  // A statement the database refuses is the uploader's to fix, parked or not.
  if (isFinalRefusal(code)) return { status: "refused", ...base, code, ...(row !== undefined ? { row } : {}) }
  if (state === "parked") return { status: "parked", ...base }
  return { status: "pending", ...base, code, ...(row !== undefined ? { row } : {}) }
}
