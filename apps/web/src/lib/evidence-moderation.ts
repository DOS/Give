import { z } from "zod"

import type { Db } from "./campaigns"
import { evidenceCampaignId, type EvidenceKind } from "./statement"

/**
 * Reports and staff moderation of public disbursement evidence (owner
 * decision on DOS/Give#58). DDL in DOS-Me
 * `supabase/migrations/20261102210000_give_public_evidence_and_donor_names.sql`:
 * give.evidence_reports, give.evidence_moderation, give.report_evidence and
 * give.moderate_evidence. Under RLS moderator/admin staff read the reports
 * and the evidence rows that were reported or moderated; the organizer and
 * finance read whether their evidence is hidden. Nobody reads who reported.
 */

/** Staff roles that may hide and show again an evidence image. */
export const MODERATION_ROLES = ["moderator", "admin"] as const

export interface EvidenceState {
  hidden: boolean
  reason: string | null
  moderated_at: string
}

/**
 * The hidden images the reader may see, by evidence id (for the organizer:
 * their own campaigns' images). Filtered on `hidden` rather than by id list,
 * so a long page of evidence never builds an overlong URL.
 */
export async function listHiddenEvidence(db: Db, limit = 1000): Promise<Map<string, EvidenceState>> {
  const { data, error } = await db
    .from("evidence_moderation")
    .select("evidence_id, hidden, reason, moderated_at")
    .eq("hidden", true)
    .order("moderated_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return new Map(
    ((data ?? []) as (EvidenceState & { evidence_id: string })[]).map(({ evidence_id, ...state }) => [
      evidence_id,
      state,
    ])
  )
}

/** Moderation state of the given evidence images, by evidence id (images never moderated are absent). */
export async function listEvidenceStates(db: Db, evidenceIds: readonly string[]): Promise<Map<string, EvidenceState>> {
  const ids = [...new Set(evidenceIds)]
  if (ids.length === 0) return new Map()
  const { data, error } = await db
    .from("evidence_moderation")
    .select("evidence_id, hidden, reason, moderated_at")
    .in("evidence_id", ids)
  if (error) throw error
  return new Map(
    ((data ?? []) as (EvidenceState & { evidence_id: string })[]).map(({ evidence_id, ...state }) => [
      evidence_id,
      state,
    ])
  )
}

export interface EvidenceReport {
  id: string
  reason: string | null
  created_at: string
}

export interface ModerationItem {
  evidence_id: string
  storage_path: string
  kind: EvidenceKind
  uploaded_at: string
  campaign_id: string | null
  /** Open reports, oldest first; empty for a hidden image without open reports. */
  reports: EvidenceReport[]
  state: EvidenceState | null
}

// Both limits keep the follow-up `in (...)` id lists short enough for a URL.
/** Open reports shown at once; the oldest come first. */
export const OPEN_REPORTS_LIMIT = 200
/** Hidden images shown at once; the most recently hidden come first. */
export const HIDDEN_LIMIT = 50

async function evidenceRows(db: Db, ids: string[]) {
  if (ids.length === 0) return new Map<string, { storage_path: string; kind: EvidenceKind; created_at: string }>()
  const { data, error } = await db
    .from("disbursement_evidence")
    .select("id, storage_path, kind, created_at")
    .in("id", ids)
  if (error) throw error
  return new Map(
    ((data ?? []) as { id: string; storage_path: string; kind: EvidenceKind; created_at: string }[]).map((e) => [
      e.id,
      e,
    ])
  )
}

/**
 * The staff queue: images with open reports (oldest report first), and the
 * images that are currently hidden (most recent first). Moderator/admin only
 * under RLS; anyone else reads empty lists.
 */
export async function listModerationQueue(db: Db): Promise<{ reported: ModerationItem[]; hidden: ModerationItem[] }> {
  const [reports, hiddenRows] = await Promise.all([
    db
      .from("evidence_reports")
      .select("id, evidence_id, reason, created_at")
      .is("resolution", null)
      .order("created_at", { ascending: true })
      .limit(OPEN_REPORTS_LIMIT),
    db
      .from("evidence_moderation")
      .select("evidence_id, hidden, reason, moderated_at")
      .eq("hidden", true)
      .order("moderated_at", { ascending: false })
      .limit(HIDDEN_LIMIT),
  ])
  if (reports.error) throw reports.error
  if (hiddenRows.error) throw hiddenRows.error

  const byEvidence = new Map<string, EvidenceReport[]>()
  for (const r of (reports.data ?? []) as (EvidenceReport & { evidence_id: string })[]) {
    byEvidence.set(r.evidence_id, [
      ...(byEvidence.get(r.evidence_id) ?? []),
      { id: r.id, reason: r.reason, created_at: r.created_at },
    ])
  }
  const hiddenIds = ((hiddenRows.data ?? []) as { evidence_id: string }[]).map((h) => h.evidence_id)
  const reportedIds = [...byEvidence.keys()]
  const [rows, states] = await Promise.all([
    evidenceRows(db, [...new Set([...reportedIds, ...hiddenIds])]),
    listEvidenceStates(db, reportedIds),
  ])
  for (const h of (hiddenRows.data ?? []) as (EvidenceState & { evidence_id: string })[]) {
    const { evidence_id, ...state } = h
    states.set(evidence_id, state)
  }

  const item = (id: string): ModerationItem | null => {
    const row = rows.get(id)
    if (!row) return null
    return {
      evidence_id: id,
      storage_path: row.storage_path,
      kind: row.kind,
      uploaded_at: row.created_at,
      campaign_id: evidenceCampaignId(row.storage_path),
      reports: byEvidence.get(id) ?? [],
      state: states.get(id) ?? null,
    }
  }
  return {
    reported: reportedIds.map(item).filter((x): x is ModerationItem => x !== null),
    hidden: hiddenIds
      .filter((id) => !byEvidence.has(id))
      .map(item)
      .filter((x): x is ModerationItem => x !== null),
  }
}

/** A staff decision on one image: hide it (reason required) or keep / show it again. */
export const moderateSchema = z
  .object({
    decision: z.enum(["hide", "show"], { message: "Chọn ẩn hoặc giữ ảnh" }),
    reason: z
      .string()
      .trim()
      .max(500, "Lý do tối đa 500 ký tự")
      .transform((v) => (v === "" ? null : v)),
  })
  .refine((v) => v.decision === "show" || v.reason !== null, {
    message: "Ghi lý do ẩn ảnh (ví dụ: lộ số CCCD của người nhận).",
    path: ["reason"],
  })
  .transform((v) => ({ hidden: v.decision === "hide", reason: v.reason }))
