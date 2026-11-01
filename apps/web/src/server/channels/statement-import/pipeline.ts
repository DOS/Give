import "server-only"

import { createHash } from "node:crypto"

import { z } from "zod"

import type { Db } from "@/lib/campaigns"
import {
  failureCode,
  processInboundEvent,
  PROCESSOR_TIMEOUT_MS,
  type InboundEvent,
  type InboundProcessor,
} from "@/server/inbound"
import { statementParsers, type ParserRegistry } from "@/server/statement-parsers"
import { PARSER_NAME } from "@/server/statement-parsers/registry"

import { StatementImportError } from "./errors"
import { jsonbTextBytes, MAX_ROWS, normalizeStatement, type StagedStatement } from "./normalize"
import { importStatementBatch, recordStatementEvent, stageStatementImport, type ImportResult } from "./rpc"

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
 * at most 1 MiB of it). A larger statement is split by period.
 */
export const MAX_PAYLOAD_BYTES = 1_000_000

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

/** The statement_import channel's processor for the reprocess-inbound cron. */
export const statementImportProcessor: InboundProcessor = async (db, event, signal) => {
  await runStatementEvent(db, event, signal)
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

export type StatementImportResult =
  | ({ status: "imported" } & ResultBase & StatementBatchOutcome)
  /**
   * The file is recorded but could not be staged or imported yet; the
   * reprocess-inbound cron retries it. `code` says why.
   */
  | ({ status: "pending"; code: string; row?: number } & ResultBase)
  /**
   * The database refused the recorded statement and will refuse it again
   * (`code` is a GIVE_* code): the uploader fixes the file. The event still
   * counts as pending until inbound events get a parked state.
   */
  | ({ status: "refused"; code: string; row?: number } & ResultBase)

/**
 * Refusals that do not depend on timing: retrying the same statement cannot
 * succeed. GIVE_IMPORT_PERIOD_INVALID compares with the database's clock,
 * which may lag the app's near midnight, so it stays pending.
 */
function isFinalRefusal(code: string): boolean {
  return (
    (code.startsWith("GIVE_IMPORT_") && code !== "GIVE_IMPORT_PERIOD_INVALID") ||
    ["GIVE_ACCOUNT_NOT_FOUND", "GIVE_NOT_ALLOWED", "GIVE_INBOUND_EVENT_INVALID", "STATEMENT_PAYLOAD_INVALID"].includes(
      code
    )
  )
}

/**
 * Imports one uploaded statement file for a statement_import account. A
 * file is checked and parsed before anything is recorded; problems found then
 * throw StatementImportError (with the row number when one row is at fault).
 * Once recorded, the upload is processed inline, and a failure leaves it
 * pending for the cron. Uploading the same file again is safe.
 *
 * The caller's route must keep its maxDuration below REPROCESS_GRACE_MS.
 */
export async function importStatementFile(
  upload: StatementUpload,
  { user, service, parsers = statementParsers, now = new Date() }: StatementImportDeps
): Promise<StatementImportResult> {
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
  const payload = statementPayload(account.id, upload.actorId, staged)
  if (jsonbTextBytes(payload) > MAX_PAYLOAD_BYTES) throw new StatementImportError("STATEMENT_TOO_LARGE")

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

  const dedupeKey = statementDedupeKey(account.id, upload.file)
  const recorded = await recordStatementEvent(service, dedupeKey, payload)
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
    if (earlierPayload.success && earlierPayload.data.account_id === account.id) {
      stored = { ...earlierPayload.data, actor_id: upload.actorId }
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
  const processed = await processInboundEvent(service, event, async (db, ev, signal) => {
    attempt = signal
    try {
      const result = await runStatementEvent(db, ev, signal)
      if (!signal.aborted) outcome = result
    } catch (err) {
      if (!signal.aborted) failure = err
      throw err
    }
  })
  if (!outcome && processed) {
    // Another run (the cron, a parallel upload) processed the event: replaying
    // it is idempotent and returns its counts.
    try {
      outcome = await runStatementEvent(service, event, AbortSignal.timeout(PROCESSOR_TIMEOUT_MS))
    } catch {
      // Reported as pending below; the event itself is processed.
    }
  }
  if (outcome) return { status: "imported", ...base, ...outcome }
  const code = attempt?.aborted || failure === undefined ? "processing_timeout" : failureCode(failure)
  const row = failure instanceof StatementImportError ? failure.row : undefined
  return { status: isFinalRefusal(code) ? "refused" : "pending", ...base, code, ...(row !== undefined ? { row } : {}) }
}
