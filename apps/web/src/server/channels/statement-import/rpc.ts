import "server-only"

import type { Db } from "@/lib/campaigns"

import { StatementImportError } from "./errors"
import type { StagedStatement } from "./normalize"

/**
 * Wrappers of the statement-import RPCs (DOS-Me migrations
 * 20261101110000_give_money_core_ledger and 20261101170000_give_statement_import).
 * Every one is granted to service_role only: pass dbService(), after the
 * caller's access has been checked.
 */

interface RpcError {
  code?: string
  message?: string
}

const GIVE_CODE = /^GIVE_[A-Z_]{1,59}/
const ROW = /\brow (\d{1,4})\b/

/** A GIVE_* error keeps its code (and row number); anything else is reported by its SQLSTATE only. */
function rpcFailure(fn: string, error: RpcError): Error {
  const message = (error.message ?? "").trim()
  const code = GIVE_CODE.exec(message)?.[0]
  if (code) {
    const row = ROW.exec(message)?.[1]
    return new StatementImportError(code as `GIVE_${string}`, row === undefined ? undefined : Number(row))
  }
  return new Error(`${fn} failed: ${error.code ?? "unknown"}`)
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export interface RecordedEvent {
  inboundEventId: string
  created: boolean
  processedAt: string | null
}

/**
 * give.record_inbound_event for an uploaded statement. An upload is
 * authenticated by the uploader's session, so it is always authentic. The
 * same key again returns the event already recorded.
 */
export async function recordStatementEvent(db: Db, dedupeKey: string, payload: unknown): Promise<RecordedEvent> {
  const { data, error } = await db
    .rpc("record_inbound_event", {
      p_channel: "statement_import",
      p_dedupe_key: dedupeKey,
      p_signature_valid: true,
      p_payload: payload,
    })
    .single()
  if (error) throw rpcFailure("record_inbound_event", error)
  const row = data as { inbound_event_id?: unknown; created?: unknown; processed_at?: unknown } | null
  if (typeof row?.inbound_event_id !== "string") throw new Error("record_inbound_event failed: no event")
  return {
    inboundEventId: row.inbound_event_id,
    created: row.created === true,
    processedAt: typeof row.processed_at === "string" ? row.processed_at : null,
  }
}

export interface StageInput extends Omit<StagedStatement, "exported_at"> {
  /** Null only in payloads recorded before the upload time was filled in. */
  exported_at: string | null
  accountId: string
  /** The uploader: the account's owner, or finance/admin staff. */
  actorId: string
  inboundEventId: string
}

export interface StageResult {
  importBatchId: string
  /** False when the event's batch already existed (a replay). */
  created: boolean
  ready: number
  duplicate: number
  ambiguous: number
}

/** give.stage_statement_import: one batch per inbound event; a replay returns the batch's counts. */
export async function stageStatementImport(db: Db, input: StageInput, signal?: AbortSignal): Promise<StageResult> {
  let query = db.rpc("stage_statement_import", {
    p_receiving_account_id: input.accountId,
    p_actor_id: input.actorId,
    p_inbound_event_id: input.inboundEventId,
    p_parser: input.parser,
    p_has_stable_row_id: input.has_stable_row_id,
    p_has_running_balance: input.has_running_balance,
    p_rows: input.rows,
    p_period_from: input.period_from,
    p_period_to: input.period_to,
    p_opening_balance: input.opening_balance,
    p_closing_balance: input.closing_balance,
    p_exported_at: input.exported_at,
  })
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.single()
  if (error) throw rpcFailure("stage_statement_import", error)
  const row = data as Record<string, unknown> | null
  if (typeof row?.import_batch_id !== "string") throw new Error("stage_statement_import failed: no batch")
  return {
    importBatchId: row.import_batch_id,
    created: row.created === true,
    ready: count(row.ready),
    duplicate: count(row.duplicate),
    ambiguous: count(row.ambiguous),
  }
}

export interface ImportResult {
  imported: number
  duplicate: number
  /** Rows waiting for finance/admin staff. */
  ambiguous: number
  /** Rows still ready; 0 after a completed import. */
  ready: number
}

/**
 * give.import_statement_batch: records the batch's ready rows as bank
 * transactions (and matches them). Safe to call again; it also marks a batch
 * without ready rows as imported.
 */
export async function importStatementBatch(db: Db, importBatchId: string, signal?: AbortSignal): Promise<ImportResult> {
  let query = db.rpc("import_statement_batch", { p_import_batch_id: importBatchId })
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.single()
  if (error) throw rpcFailure("import_statement_batch", error)
  const row = data as Record<string, unknown> | null
  if (!row) throw new Error("import_statement_batch failed: no counts")
  return {
    imported: count(row.imported),
    duplicate: count(row.duplicate),
    ambiguous: count(row.ambiguous),
    ready: count(row.ready),
  }
}
