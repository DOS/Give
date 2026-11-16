import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  CAMPAIGNS_PER_REQUEST,
  canStopReportedPaymentRequests,
  canSuspendReportedCampaign,
  listCampaignReportQueue,
  moderateCampaignReportsSchema,
  parseReportsPage,
  reportCampaignSchema,
  reportsPageHref,
} from "./campaign-reports"

const C1 = "11111111-1111-4111-8111-111111111111"
const C2 = "22222222-2222-4222-8222-222222222222"
const C3 = "33333333-3333-4333-8333-333333333333"
const C4 = "44444444-4444-4444-8444-444444444444"
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

describe("listCampaignReportQueue", () => {
  it("orders campaigns with open reports ahead of awaiting-only campaigns, loads complete report groups, and omits reporter_id/handled_by", async () => {
    const allUnresolved = [
      // C4 has the oldest awaiting report (07:00), but no open report -> placed AFTER C2 and C1!
      {
        id: "r0",
        campaign_id: C4,
        reason_code: "prohibited_or_harmful",
        details: "Chờ phản hồi",
        status: "awaiting_organizer",
        action_taken: "asked_organizer",
        resolution_note: "Đã hỏi.",
        handled_at: "2026-11-15T07:30:00Z",
        created_at: "2026-11-15T07:00:00Z",
        updated_at: "2026-11-15T07:30:00Z",
      },
      {
        id: "r1",
        campaign_id: C1,
        reason_code: "fraud_or_impersonation",
        details: "Mạo danh bệnh viện",
        status: "awaiting_organizer",
        action_taken: "asked_organizer",
        resolution_note: "Đề nghị gửi giấy xác nhận.",
        handled_at: "2026-11-15T10:00:00Z",
        created_at: "2026-11-15T08:00:00Z",
        updated_at: "2026-11-15T10:00:00Z",
      },
      // C2 has the oldest open report (09:00) -> placed first!
      {
        id: "r2",
        campaign_id: C2,
        reason_code: "misuse_of_funds",
        details: null,
        status: "open",
        action_taken: null,
        resolution_note: null,
        handled_at: null,
        created_at: "2026-11-15T09:00:00Z",
        updated_at: "2026-11-15T09:00:00Z",
      },
      // C1 gets a newer open report (01:00 next day) -> placed second, with BOTH r1 and r3 loaded!
      {
        id: "r3",
        campaign_id: C1,
        reason_code: "other",
        details: "Thêm chi tiết",
        status: "open",
        action_taken: null,
        resolution_note: null,
        handled_at: null,
        created_at: "2026-11-16T01:00:00Z",
        updated_at: "2026-11-16T01:00:00Z",
      },
    ]

    const calls: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "campaign_reports") {
        const eqStatus = call.ops.find(([n, col]) => n === "eq" && col === "status")?.[2] as string | undefined
        if (eqStatus) return { data: allUnresolved.filter((r) => r.status === eqStatus) }
        const campaignFilter = call.ops.find(([n, col]) => n === "in" && col === "campaign_id")?.[2] as
          string[] | undefined
        const statusFilter = call.ops.find(([n, col]) => n === "in" && col === "status")?.[2] as string[] | undefined
        if (statusFilter?.includes("open")) {
          return {
            data: campaignFilter ? allUnresolved.filter((r) => campaignFilter.includes(r.campaign_id)) : allUnresolved,
          }
        }
        return {
          data: [
            {
              id: "r4",
              campaign_id: C3,
              reason_code: "false_or_misleading",
              details: "Sai thông tin",
              status: "dismissed",
              action_taken: "dismissed",
              resolution_note: "Đã đối chiếu chứng từ.",
              handled_at: "2026-11-16T05:00:00Z",
              created_at: "2026-11-14T08:00:00Z",
              updated_at: "2026-11-16T05:00:00Z",
            },
            {
              id: "r5",
              campaign_id: C3,
              reason_code: "other",
              details: "Cùng chiến dịch",
              status: "dismissed",
              action_taken: "dismissed",
              resolution_note: "Đã đối chiếu chứng từ.",
              handled_at: "2026-11-16T05:00:00Z",
              created_at: "2026-11-14T07:00:00Z",
              updated_at: "2026-11-16T05:00:00Z",
            },
          ],
        }
      }
      if (call.target === "rpc:managed_campaigns") {
        return {
          data: [
            {
              id: C1,
              slug: "chien-dich-1",
              type: "give",
              status: "live",
              title: "Chiến dịch 1",
              organizer_id: ORG,
              review_note: null,
              payments_stopped_at: null,
              payments_stopped_note: null,
              organizer: {
                user_id: ORG,
                kind: "organization",
                legal_name: "Quỹ Một",
                display_name: "Quỹ Một",
                verification_status: "verified",
              },
            },
            {
              id: C2,
              slug: "du-an-2",
              type: "back",
              status: "succeeded",
              title: "Dự án 2",
              organizer_id: ORG,
              review_note: null,
              payments_stopped_at: null,
              payments_stopped_note: null,
              organizer: null,
            },
            {
              id: C3,
              slug: "chien-dich-3",
              type: "give",
              status: "live",
              title: "Chiến dịch 3",
              organizer_id: ORG,
              review_note: null,
              payments_stopped_at: null,
              payments_stopped_note: null,
              organizer: null,
            },
            {
              id: C4,
              slug: "chien-dich-4",
              type: "give",
              status: "live",
              title: "Chiến dịch 4",
              organizer_id: ORG,
              review_note: null,
              payments_stopped_at: null,
              payments_stopped_note: null,
              organizer: null,
            },
          ],
        }
      }
      return undefined
    }, calls)

    const queue = await listCampaignReportQueue(db as never)

    const reportReads = calls.filter((c) => c.target === "campaign_reports")
    expect(reportReads).toHaveLength(4)
    for (const read of reportReads) {
      const cols = String(op(read, "select")?.[0] ?? "")
      expect(cols).not.toBe("*")
      expect(cols).not.toMatch(/reporter_id|handled_by/)
    }

    expect(queue.totalUnresolvedCampaigns).toBe(3)
    expect(queue.page).toBe(1)
    expect(queue.totalPages).toBe(1)
    expect(
      queue.unresolved.map((u) => [u.campaign_id, u.open_count, u.awaiting_count, u.reports.map((r) => r.id)])
    ).toEqual([
      [C2, 1, 0, ["r2"]],
      [C1, 1, 1, ["r1", "r3"]],
      [C4, 0, 1, ["r0"]],
    ])
    expect(queue.resolved).toHaveLength(1)
    expect(queue.resolved[0].campaign_id).toBe(C3)
    expect(queue.resolved[0].reports.map((r) => r.id)).toEqual(["r4", "r5"])
    expect(queue.resolved[0].latest.id).toBe("r4")
  })

  it("paginates unresolved campaigns without letting awaiting reports starve open ones, and chunks managed_campaigns", async () => {
    // 105 awaiting-only campaigns followed by 1 newer open campaign -> open campaign lands on page 1!
    const awaitingIds = Array.from({ length: 105 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)
    const freshOpenId = "99999999-9999-4999-8999-999999999999"
    const allRows = [
      ...awaitingIds.map((cid, i) => ({
        id: `aw-${i}`,
        campaign_id: cid,
        reason_code: "other" as const,
        details: "waiting",
        status: "awaiting_organizer" as const,
        action_taken: "asked_organizer" as const,
        resolution_note: "q",
        handled_at: "2026-11-15T01:00:00Z",
        created_at: `2026-11-15T00:00:${String(i % 60).padStart(2, "0")}Z`,
        updated_at: "2026-11-15T01:00:00Z",
      })),
      {
        id: "open-fresh",
        campaign_id: freshOpenId,
        reason_code: "fraud_or_impersonation" as const,
        details: "fresh",
        status: "open" as const,
        action_taken: null,
        resolution_note: null,
        handled_at: null,
        created_at: "2026-11-16T12:00:00Z",
        updated_at: "2026-11-16T12:00:00Z",
      },
    ]

    const calls: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "campaign_reports") {
        const eqStatus = call.ops.find(([n, col]) => n === "eq" && col === "status")?.[2] as string | undefined
        if (eqStatus) return { data: allRows.filter((r) => r.status === eqStatus) }
        const statusFilter = call.ops.find(([n, col]) => n === "in" && col === "status")?.[2] as string[] | undefined
        if (!statusFilter?.includes("open")) return { data: [] }
        const campaignFilter = call.ops.find(([n, col]) => n === "in" && col === "campaign_id")?.[2] as
          string[] | undefined
        return { data: campaignFilter ? allRows.filter((r) => campaignFilter.includes(r.campaign_id)) : allRows }
      }
      if (call.target === "rpc:managed_campaigns") return { data: [] }
      return undefined
    }, calls)

    // Page 1 with pageSize 110 forces two chunks of managed_campaigns (100 + 6).
    const p1 = await listCampaignReportQueue(db as never, 1, 110)
    expect(p1.unresolved[0].campaign_id).toBe(freshOpenId)
    expect(p1.unresolved[0].open_count).toBe(1)
    const managedCalls = calls.filter((c) => c.target === "rpc:managed_campaigns")
    expect(managedCalls).toHaveLength(2)
    expect((op(managedCalls[0], "in")?.[1] as string[]).length).toBe(CAMPAIGNS_PER_REQUEST)
    expect((op(managedCalls[1], "in")?.[1] as string[]).length).toBe(6)

    // Standard pagination at pageSize 20: 106 campaigns -> 6 pages; page 6 holds the last 6 awaiting campaigns.
    const p6 = await listCampaignReportQueue(db as never, 6, 20)
    expect(p6.totalPages).toBe(6)
    expect(p6.page).toBe(6)
    expect(p6.unresolved).toHaveLength(6)
  })

  it("never drops fresh open reports even behind >20,000 range-paged awaiting_organizer rows", async () => {
    const rows = Array.from({ length: 20_500 }, (_, i) => ({
      id: `wait-${i}`,
      campaign_id: "00000000-0000-4000-8000-000000000001",
      reason_code: "other" as const,
      details: "waiting",
      status: "awaiting_organizer" as const,
      action_taken: "asked_organizer" as const,
      resolution_note: "q",
      handled_at: "2026-11-15T00:00:00Z",
      created_at: "2026-11-15T00:00:00Z",
      updated_at: "2026-11-15T00:00:00Z",
    }))
    rows.push({
      id: "fresh-open",
      campaign_id: "99999999-9999-4999-8999-999999999999",
      reason_code: "fraud_or_impersonation" as unknown as "other",
      details: "fresh",
      status: "open" as unknown as "awaiting_organizer",
      action_taken: null as unknown as "asked_organizer",
      resolution_note: null as unknown as string,
      handled_at: null as unknown as string,
      created_at: "2026-11-16T00:00:00Z",
      updated_at: "2026-11-16T00:00:00Z",
    })
    const db = fakeDb((call) => {
      if (call.target !== "campaign_reports") return { data: [] }
      const eqStatus = call.ops.find(([n, col]) => n === "eq" && col === "status")?.[2] as string | undefined
      const inStatuses = call.ops.find(([n, col]) => n === "in" && col === "status")?.[2] as string[] | undefined
      const inCampaigns = call.ops.find(([n, col]) => n === "in" && col === "campaign_id")?.[2] as string[] | undefined
      const range = (op(call, "range") as [number, number] | undefined) ?? [0, 49]
      const filtered = rows.filter(
        (r) =>
          (eqStatus ? r.status === eqStatus : Boolean(inStatuses?.includes(r.status))) &&
          (!inCampaigns || inCampaigns.includes(r.campaign_id))
      )
      return { data: filtered.slice(range[0], range[1] + 1) }
    })

    const q = await listCampaignReportQueue(db as never, 1, 20)
    expect(q.totalUnresolvedCampaigns).toBe(2)
    expect(q.unresolved.map((u) => [u.campaign_id, u.reports.length])).toEqual([
      ["99999999-9999-4999-8999-999999999999", 1],
      ["00000000-0000-4000-8000-000000000001", 20_500],
    ])
  })

  it("skips managed_campaigns and full-report fetches when there are no reports", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => (call.target === "campaign_reports" ? { data: [] } : undefined), calls)
    expect(await listCampaignReportQueue(db as never)).toEqual({
      unresolved: [],
      totalUnresolvedCampaigns: 0,
      page: 1,
      totalPages: 1,
      resolved: [],
    })
    expect(calls.map((c) => c.target)).toEqual(["campaign_reports", "campaign_reports", "campaign_reports"])
  })
})

describe("parseReportsPage and reportsPageHref", () => {
  it("normalizes page query parameters and omits ?page=1", () => {
    expect(parseReportsPage({})).toBe(1)
    expect(parseReportsPage({ page: "0" })).toBe(1)
    expect(parseReportsPage({ page: "-3" })).toBe(1)
    expect(parseReportsPage({ page: "abc" })).toBe(1)
    expect(parseReportsPage({ page: ["3", "4"] })).toBe(3)
    expect(reportsPageHref(1)).toBe("/admin/reports")
    expect(reportsPageHref(2)).toBe("/admin/reports?page=2")
  })
})

describe("status helpers", () => {
  it("allows suspend only for approved, live or already-suspended campaigns", () => {
    expect(canSuspendReportedCampaign({ status: "approved" })).toBe(true)
    expect(canSuspendReportedCampaign({ status: "live" })).toBe(true)
    expect(canSuspendReportedCampaign({ status: "suspended" })).toBe(true)
    expect(canSuspendReportedCampaign({ status: "succeeded" })).toBe(false)
    expect(canSuspendReportedCampaign({ status: "closed" })).toBe(false)
  })

  it("allows stop_payment_requests only for succeeded back campaigns", () => {
    expect(canStopReportedPaymentRequests({ type: "back", status: "succeeded" })).toBe(true)
    expect(canStopReportedPaymentRequests({ type: "back", status: "live" })).toBe(false)
    expect(canStopReportedPaymentRequests({ type: "give", status: "succeeded" })).toBe(false)
  })
})

describe("reportCampaignSchema", () => {
  it("accepts structured reasons with optional details, and requires details for 'other'", () => {
    expect(reportCampaignSchema.parse({ reason_code: "fraud_or_impersonation", details: "  " })).toEqual({
      reason_code: "fraud_or_impersonation",
      details: null,
    })
    expect(reportCampaignSchema.parse({ reason_code: "other", details: "  Nêu rõ vi phạm  " })).toEqual({
      reason_code: "other",
      details: "Nêu rõ vi phạm",
    })
    expect(reportCampaignSchema.safeParse({ reason_code: "other", details: " \t\n " }).success).toBe(false)
    expect(reportCampaignSchema.safeParse({ reason_code: "unknown", details: "x" }).success).toBe(false)
    expect(reportCampaignSchema.safeParse({ reason_code: "misuse_of_funds", details: "x".repeat(1001) }).success).toBe(
      false
    )
  })
})

describe("moderateCampaignReportsSchema", () => {
  it("requires a note, requires public_note only for stop_payment_requests, and refuses public_note on other actions", () => {
    expect(moderateCampaignReportsSchema.parse({ action: "dismiss", reason: "  Hợp lệ  ", public_note: " " })).toEqual({
      action: "dismiss",
      reason: "Hợp lệ",
      public_note: null,
    })
    expect(
      moderateCampaignReportsSchema.parse({
        action: "stop_payment_requests",
        reason: "Đang kiểm tra",
        public_note: "  Tạm dừng thanh toán. ",
      })
    ).toEqual({
      action: "stop_payment_requests",
      reason: "Đang kiểm tra",
      public_note: "Tạm dừng thanh toán.",
    })
    expect(
      moderateCampaignReportsSchema.safeParse({ action: "stop_payment_requests", reason: "r", public_note: " " })
        .success
    ).toBe(false)
    expect(
      moderateCampaignReportsSchema.safeParse({ action: "dismiss", reason: "r", public_note: "ghi chú nhầm" }).success
    ).toBe(false)
    expect(moderateCampaignReportsSchema.safeParse({ action: "dismiss", reason: "  ", public_note: "" }).success).toBe(
      false
    )
    expect(
      moderateCampaignReportsSchema.safeParse({
        action: "ask_organizer",
        reason: "x".repeat(1001),
        public_note: "",
      }).success
    ).toBe(false)
    expect(
      moderateCampaignReportsSchema.safeParse({
        action: "stop_payment_requests",
        reason: "r",
        public_note: "p".repeat(501),
      }).success
    ).toBe(false)
  })
})
