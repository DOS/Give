import { z } from "zod"

import type { CampaignStatus, Db } from "./campaigns"

/**
 * Trust moat data helpers (DOS/Give#314):
 * - 3-second transparency summary & per-milestone disbursement/evidence rollups
 *   (`give.campaign_transparency_summary`, fail-closed for non-public campaigns,
 *   zero PII, zero raw account numbers).
 * - Closing impact reports (`give.campaign_impact_reports`, written only via
 *   `give.upsert_campaign_impact_report` by owner or accepted co-organizer
 *   editor when campaign status is `closed`, `succeeded`, or `settling`).
 */

export const IMPACT_REPORT_STATUSES = ["closed", "succeeded", "settling"] as const
export type ImpactReportStatus = (typeof IMPACT_REPORT_STATUSES)[number]

export const IMPACT_SUMMARY_MAX = 20_000
export const IMPACT_HIGHLIGHTS_MAX = 10
export const IMPACT_HIGHLIGHT_FIELD_MAX = 120

export function canEditImpactReport(status: CampaignStatus): status is ImpactReportStatus {
  return status === "closed" || status === "succeeded" || status === "settling"
}

export interface ImpactHighlight {
  label: string
  value: string
}

export interface CampaignImpactReport {
  campaign_id: string
  summary: string
  highlights: ImpactHighlight[]
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface MilestoneRollup {
  milestone_id: string
  title: string
  target_amount: number
  sort_order: number
  disbursed_total: number
  disbursement_count: number
  evidence_count: number
}

export interface CampaignTransparencySummary {
  campaign_id: string
  last_statement_at: string | null
  matched_incoming_total: number
  disbursable_total: number
  disbursed_total: number
  refunded_total: number
  evidence_count: number
  unexplained_inbound_count: number
  unexplained_out_count: number
  has_impact_report: boolean
  impact_report_published_at: string | null
  milestone_rollups: MilestoneRollup[]
}

const IMPACT_REPORT_COLUMNS = "campaign_id, summary, highlights, published_at, created_at, updated_at"

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(n) ? n : 0
}

/**
 * Share of disbursable money that has been disbursed (0..100, rounded down
 * like `progressPercent`), or `null` when no disbursable funds have arrived yet.
 */
export function disbursedPercent(
  summary: Pick<CampaignTransparencySummary, "disbursable_total" | "disbursed_total">
): number | null {
  if (!(summary.disbursable_total > 0)) return null
  if (!(summary.disbursed_total > 0)) return 0
  return Math.min(100, Math.floor((summary.disbursed_total * 100) / summary.disbursable_total))
}

/** Total bank transactions (incoming + outgoing) that still lack an explanation. */
export function unexplainedTotal(
  summary: Pick<CampaignTransparencySummary, "unexplained_inbound_count" | "unexplained_out_count">
): number {
  return Math.max(0, summary.unexplained_inbound_count) + Math.max(0, summary.unexplained_out_count)
}

/** Defensively parses `highlights` jsonb from the database into clean `{ label, value }` rows. */
export function parseHighlights(raw: unknown): ImpactHighlight[] {
  if (!Array.isArray(raw)) return []
  const items: ImpactHighlight[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const rec = entry as Record<string, unknown>
    const label = typeof rec.label === "string" ? rec.label.trim() : ""
    const value = typeof rec.value === "string" ? rec.value.trim() : ""
    if (label && value) {
      items.push({ label, value })
      if (items.length >= IMPACT_HIGHLIGHTS_MAX) break
    }
  }
  return items
}

function parseMilestoneRollups(raw: unknown): MilestoneRollup[] {
  if (!Array.isArray(raw)) return []
  const rollups: MilestoneRollup[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const rec = entry as Record<string, unknown>
    if (typeof rec.milestone_id !== "string" || typeof rec.title !== "string") continue
    rollups.push({
      milestone_id: rec.milestone_id,
      title: rec.title,
      target_amount: num(rec.target_amount),
      sort_order: num(rec.sort_order),
      disbursed_total: num(rec.disbursed_total),
      disbursement_count: num(rec.disbursement_count),
      evidence_count: num(rec.evidence_count),
    })
  }
  return rollups
}

/**
 * Reads `give.campaign_transparency_summary(p_campaign_id)` for a public
 * campaign. Returns `null` when the campaign is non-public or unknown.
 */
export async function getCampaignTransparencySummary(
  db: Db,
  campaignId: string
): Promise<CampaignTransparencySummary | null> {
  const { data, error } = await db.rpc("campaign_transparency_summary", { p_campaign_id: campaignId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined
  if (!row || typeof row.campaign_id !== "string") return null
  return {
    campaign_id: row.campaign_id,
    last_statement_at: typeof row.last_statement_at === "string" ? row.last_statement_at : null,
    matched_incoming_total: num(row.matched_incoming_total),
    disbursable_total: num(row.disbursable_total),
    disbursed_total: num(row.disbursed_total),
    refunded_total: num(row.refunded_total),
    evidence_count: num(row.evidence_count),
    unexplained_inbound_count: num(row.unexplained_inbound_count),
    unexplained_out_count: num(row.unexplained_out_count),
    has_impact_report: row.has_impact_report === true,
    impact_report_published_at:
      typeof row.impact_report_published_at === "string" ? row.impact_report_published_at : null,
    milestone_rollups: parseMilestoneRollups(row.milestone_rollups),
  }
}

/**
 * Reads `give.campaign_impact_reports` under RLS (never requests `updated_by`).
 * Anonymous visitors see published reports on public campaigns only; owners,
 * accepted co-organizer editors, and staff see drafts too.
 */
export async function getCampaignImpactReport(db: Db, campaignId: string): Promise<CampaignImpactReport | null> {
  const { data, error } = await db
    .from("campaign_impact_reports")
    .select(IMPACT_REPORT_COLUMNS)
    .eq("campaign_id", campaignId)
    .maybeSingle()
  if (error) throw error
  const row = data as Record<string, unknown> | null
  if (!row || typeof row.campaign_id !== "string" || typeof row.summary !== "string") return null
  return {
    campaign_id: row.campaign_id,
    summary: row.summary,
    highlights: parseHighlights(row.highlights),
    published_at: typeof row.published_at === "string" ? row.published_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
  }
}

/**
 * Batch lookup of public campaigns that have a published closing impact report
 * (for the summary badge on `/u/[handle]`).
 */
export async function listPublishedImpactReportCampaignIds(
  db: Db,
  campaignIds: readonly string[]
): Promise<Set<string>> {
  const unique = [...new Set(campaignIds)]
  if (unique.length === 0) return new Set()
  const CHUNK_SIZE = 100
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + CHUNK_SIZE))
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await db
        .from("campaign_impact_reports")
        .select("campaign_id")
        .in("campaign_id", chunk)
        .not("published_at", "is", null)
      if (error) throw error
      return (data ?? []) as { campaign_id?: unknown }[]
    })
  )
  const result = new Set<string>()
  for (const rows of results) {
    for (const row of rows) {
      if (typeof row.campaign_id === "string") result.add(row.campaign_id)
    }
  }
  return result
}

const highlightItemSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Mỗi chỉ số nổi bật cần có tiêu đề.")
    .max(IMPACT_HIGHLIGHT_FIELD_MAX, `Tiêu đề chỉ số tối đa ${IMPACT_HIGHLIGHT_FIELD_MAX} ký tự.`),
  value: z
    .string()
    .trim()
    .min(1, "Mỗi chỉ số nổi bật cần có giá trị.")
    .max(IMPACT_HIGHLIGHT_FIELD_MAX, `Giá trị chỉ số tối đa ${IMPACT_HIGHLIGHT_FIELD_MAX} ký tự.`),
})

export const impactReportSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1, "Hãy viết nội dung báo cáo tổng kết.")
    .max(IMPACT_SUMMARY_MAX, `Nội dung báo cáo tổng kết tối đa ${IMPACT_SUMMARY_MAX.toLocaleString("vi-VN")} ký tự.`),
  highlights: z
    .array(highlightItemSchema)
    .max(IMPACT_HIGHLIGHTS_MAX, `Tối đa ${IMPACT_HIGHLIGHTS_MAX} chỉ số nổi bật.`),
  intent: z.enum(["draft", "publish"], { message: "Thao tác không hợp lệ." }),
})

export type ImpactReportInput = z.infer<typeof impactReportSchema>

/**
 * Extracts paired `highlight_label` / `highlight_value` entries from FormData.
 * Completely blank rows are skipped; half-filled rows are preserved so Zod
 * reports a clear validation error instead of silently dropping user input.
 */
export function readImpactHighlightsFromForm(form: FormData): ImpactHighlight[] {
  const labels = form.getAll("highlight_label").map((v) => (typeof v === "string" ? v.trim() : ""))
  const values = form.getAll("highlight_value").map((v) => (typeof v === "string" ? v.trim() : ""))
  const count = Math.max(labels.length, values.length)
  const items: ImpactHighlight[] = []
  for (let i = 0; i < count; i += 1) {
    const label = labels[i] ?? ""
    const value = values[i] ?? ""
    if (label === "" && value === "") continue
    items.push({ label, value })
  }
  return items
}
