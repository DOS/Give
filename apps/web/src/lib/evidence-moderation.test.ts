import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import { listHiddenEvidence, listModerationQueue, moderateSchema } from "./evidence-moderation"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TX = "33333333-3333-4333-8333-333333333333"
const path = (n: number) => `disbursements/${CAMPAIGN}/${TX}/4444444${n}-4444-4444-8444-444444444444.webp`

describe("listModerationQueue", () => {
  it("groups open reports by image and lists hidden images apart, never asking who reported", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "evidence_reports") {
        return {
          data: [
            { id: "r1", evidence_id: "e1", reason: "CCCD", created_at: "2026-11-01" },
            { id: "r2", evidence_id: "e1", reason: null, created_at: "2026-11-02" },
            { id: "r3", evidence_id: "e2", reason: "SĐT", created_at: "2026-11-03" },
          ],
        }
      }
      if (call.target === "evidence_moderation" && op(call, "eq")) {
        return { data: [{ evidence_id: "e3", hidden: true, reason: "Lộ CCCD", moderated_at: "2026-11-02" }] }
      }
      if (call.target === "evidence_moderation") return { data: [] }
      if (call.target === "disbursement_evidence") {
        return {
          data: [1, 2, 3].map((n) => ({ id: `e${n}`, storage_path: path(n), kind: "photo", created_at: "2026-10-30" })),
        }
      }
      return undefined
    }, calls)

    const { reported, hidden } = await listModerationQueue(db as never)
    const reports = calls.find((c) => c.target === "evidence_reports")
    expect(op(reports, "select")?.[0]).not.toMatch(/reporter|resolved_by/)
    expect(op(reports, "is")).toEqual(["resolution", null])
    expect(reported.map((r) => [r.evidence_id, r.reports.map((x) => x.id)])).toEqual([
      ["e1", ["r1", "r2"]],
      ["e2", ["r3"]],
    ])
    expect(reported[0].campaign_id).toBe(CAMPAIGN)
    expect(hidden.map((h) => [h.evidence_id, h.state?.hidden, h.state?.reason])).toEqual([["e3", true, "Lộ CCCD"]])
    for (const call of calls.filter((c) => c.target === "evidence_moderation")) {
      expect(op(call, "select")?.[0]).not.toContain("moderated_by")
    }
  })
})

describe("listHiddenEvidence", () => {
  it("filters on hidden instead of an id list", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [{ evidence_id: "e1", hidden: true, reason: "x", moderated_at: "t" }] }), calls)
    const hidden = await listHiddenEvidence(db as never)
    expect(op(calls[0], "eq")).toEqual(["hidden", true])
    expect(op(calls[0], "in")).toBeUndefined()
    expect(hidden.get("e1")?.reason).toBe("x")
  })
})

describe("moderateSchema", () => {
  it("needs a reason to hide but not to keep", () => {
    expect(moderateSchema.parse({ decision: "hide", reason: " Lộ CCCD " })).toEqual({ hidden: true, reason: "Lộ CCCD" })
    expect(moderateSchema.parse({ decision: "show", reason: "" })).toEqual({ hidden: false, reason: null })
    expect(moderateSchema.safeParse({ decision: "hide", reason: " " }).success).toBe(false)
    expect(moderateSchema.safeParse({ decision: "drop", reason: "x" }).success).toBe(false)
    expect(moderateSchema.safeParse({ decision: "hide", reason: "x".repeat(501) }).success).toBe(false)
  })
})
