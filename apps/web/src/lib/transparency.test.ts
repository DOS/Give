import { describe, expect, it } from "vitest"

import type { Db } from "@/lib/campaigns"
import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  canEditImpactReport,
  disbursedPercent,
  getCampaignImpactReport,
  getCampaignTransparencySummary,
  IMPACT_HIGHLIGHTS_MAX,
  IMPACT_SUMMARY_MAX,
  impactReportSchema,
  listPublishedImpactReportCampaignIds,
  parseHighlights,
  readImpactHighlightsFromForm,
  unexplainedTotal,
} from "./transparency"

const CAMPAIGN = "33333333-3333-4333-8333-333333333333"
const MILESTONE = "44444444-4444-4444-8444-444444444444"

describe("transparency helpers (DOS/Give#314)", () => {
  it("allows closing impact reports only on closed, succeeded, and settling campaigns", () => {
    expect(canEditImpactReport("closed")).toBe(true)
    expect(canEditImpactReport("succeeded")).toBe(true)
    expect(canEditImpactReport("settling")).toBe(true)
    expect(canEditImpactReport("draft")).toBe(false)
    expect(canEditImpactReport("in_review")).toBe(false)
    expect(canEditImpactReport("changes_requested")).toBe(false)
    expect(canEditImpactReport("approved")).toBe(false)
    expect(canEditImpactReport("live")).toBe(false)
    expect(canEditImpactReport("failed")).toBe(false)
    expect(canEditImpactReport("suspended")).toBe(false)
    expect(canEditImpactReport("cancelled")).toBe(false)
  })

  it("computes disbursedPercent and unexplainedTotal cleanly (without IEEE-754 truncation)", () => {
    expect(disbursedPercent({ disbursable_total: 0, disbursed_total: 0 })).toBeNull()
    expect(disbursedPercent({ disbursable_total: 1_000_000, disbursed_total: 0 })).toBe(0)
    expect(disbursedPercent({ disbursable_total: 1_000_000, disbursed_total: 459_000 })).toBe(45)
    expect(disbursedPercent({ disbursable_total: 100_000_000, disbursed_total: 29_000_000 })).toBe(29)
    expect(disbursedPercent({ disbursable_total: 1_000_000, disbursed_total: 1_200_000 })).toBe(100)
    expect(unexplainedTotal({ unexplained_inbound_count: 2, unexplained_out_count: 3 })).toBe(5)
    expect(unexplainedTotal({ unexplained_inbound_count: 0, unexplained_out_count: 0 })).toBe(0)
  })

  it("defensively parses highlights and enforces max count", () => {
    expect(parseHighlights(null)).toEqual([])
    expect(
      parseHighlights([
        { label: " Học sinh ", value: " 120 em " },
        { label: "", value: "ignored" },
        "not-an-object",
        { label: "Phòng học", value: "3 phòng" },
      ])
    ).toEqual([
      { label: "Học sinh", value: "120 em" },
      { label: "Phòng học", value: "3 phòng" },
    ])

    const tooMany = Array.from({ length: 15 }, (_, i) => ({ label: `L${i}`, value: `V${i}` }))
    expect(parseHighlights(tooMany)).toHaveLength(IMPACT_HIGHLIGHTS_MAX)
  })

  it("reads paired highlights from FormData, skipping blank rows but keeping half-filled rows for validation", () => {
    const f = new FormData()
    f.append("highlight_label", "  Học sinh  ")
    f.append("highlight_value", " 120 em ")
    f.append("highlight_label", "   ")
    f.append("highlight_value", "")
    f.append("highlight_label", "Thiếu giá trị")
    f.append("highlight_value", "  ")

    const rows = readImpactHighlightsFromForm(f)
    expect(rows).toEqual([
      { label: "Học sinh", value: "120 em" },
      { label: "Thiếu giá trị", value: "" },
    ])
    expect(impactReportSchema.safeParse({ summary: "OK", highlights: rows, intent: "draft" }).success).toBe(false)
  })

  it("validates summary bounds and highlight count in impactReportSchema", () => {
    expect(impactReportSchema.safeParse({ summary: "   ", highlights: [], intent: "draft" }).success).toBe(false)
    expect(
      impactReportSchema.safeParse({ summary: "a".repeat(IMPACT_SUMMARY_MAX + 1), highlights: [], intent: "publish" })
        .success
    ).toBe(false)
    expect(
      impactReportSchema.safeParse({
        summary: "## Tổng kết",
        highlights: Array.from({ length: IMPACT_HIGHLIGHTS_MAX + 1 }, (_, i) => ({ label: `L${i}`, value: `V${i}` })),
        intent: "publish",
      }).success
    ).toBe(false)
    expect(
      impactReportSchema.safeParse({
        summary: "## Tổng kết",
        highlights: [{ label: "Học sinh", value: "120 em" }],
        intent: "publish",
      }).success
    ).toBe(true)
  })

  it("reads campaign_transparency_summary RPC and converts numeric/string bigints", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "rpc:campaign_transparency_summary") {
        return {
          data: [
            {
              campaign_id: CAMPAIGN,
              last_statement_at: "2026-11-20T08:00:00Z",
              matched_incoming_total: "500000",
              disbursable_total: "620000",
              disbursed_total: "220000",
              refunded_total: "50000",
              evidence_count: 3,
              unexplained_inbound_count: 1,
              unexplained_out_count: 0,
              has_impact_report: true,
              impact_report_published_at: "2026-11-21T00:00:00Z",
              milestone_rollups: [
                {
                  milestone_id: MILESTONE,
                  title: "Mốc 1",
                  target_amount: "300000",
                  sort_order: 1,
                  disbursed_total: "125000",
                  disbursement_count: 2,
                  evidence_count: 3,
                },
              ],
            },
          ],
        }
      }
      return undefined
    }, calls)

    const summary = await getCampaignTransparencySummary(db as unknown as Db, CAMPAIGN)
    expect(op(calls[0], "args")?.[0]).toEqual({ p_campaign_id: CAMPAIGN })
    expect(summary).toEqual({
      campaign_id: CAMPAIGN,
      last_statement_at: "2026-11-20T08:00:00Z",
      matched_incoming_total: 500_000,
      disbursable_total: 620_000,
      disbursed_total: 220_000,
      refunded_total: 50_000,
      evidence_count: 3,
      unexplained_inbound_count: 1,
      unexplained_out_count: 0,
      has_impact_report: true,
      impact_report_published_at: "2026-11-21T00:00:00Z",
      milestone_rollups: [
        {
          milestone_id: MILESTONE,
          title: "Mốc 1",
          target_amount: 300_000,
          sort_order: 1,
          disbursed_total: 125_000,
          disbursement_count: 2,
          evidence_count: 3,
        },
      ],
    })
  })

  it("returns null from getCampaignTransparencySummary when campaign is non-public (empty RPC result)", async () => {
    const db = fakeDb(() => ({ data: [] }))
    expect(await getCampaignTransparencySummary(db as unknown as Db, CAMPAIGN)).toBeNull()
  })

  it("reads campaign_impact_reports without requesting updated_by", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: {
          campaign_id: CAMPAIGN,
          summary: "## Hoàn thành",
          highlights: [{ label: "Điểm trường", value: "3 điểm" }],
          published_at: "2026-11-21T00:00:00Z",
          created_at: "2026-11-20T00:00:00Z",
          updated_at: "2026-11-21T00:00:00Z",
        },
      }),
      calls
    )

    const report = await getCampaignImpactReport(db as unknown as Db, CAMPAIGN)
    expect(String(op(calls[0], "select")?.[0])).not.toContain("updated_by")
    expect(report?.highlights).toEqual([{ label: "Điểm trường", value: "3 điểm" }])
  })

  it("batch-lists published impact report campaign ids for /u/[handle] and chunks large lists", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [{ campaign_id: CAMPAIGN }] }), calls)
    const ids = await listPublishedImpactReportCampaignIds(db as unknown as Db, [CAMPAIGN, CAMPAIGN])
    expect(ids).toEqual(new Set([CAMPAIGN]))
    expect(op(calls[0], "in")?.[1]).toEqual([CAMPAIGN])
    expect(op(calls[0], "not")).toEqual(["published_at", "is", null])

    expect(await listPublishedImpactReportCampaignIds(db as unknown as Db, [])).toEqual(new Set())

    const chunkCalls: Call[] = []
    const many = Array.from({ length: 105 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)
    const chunkDb = fakeDb((call) => {
      const chunk = (op(call, "in")?.[1] ?? []) as string[]
      return { data: chunk.length > 0 ? [{ campaign_id: chunk[0] }] : [] }
    }, chunkCalls)
    const chunkIds = await listPublishedImpactReportCampaignIds(chunkDb as unknown as Db, many)
    expect(chunkCalls).toHaveLength(2)
    expect(chunkIds).toEqual(new Set([many[0], many[100]]))
  })
})
