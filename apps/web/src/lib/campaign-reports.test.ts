import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  canStopReportedPaymentRequests,
  canSuspendReportedCampaign,
  listCampaignReportQueue,
  moderateCampaignReportsSchema,
  reportCampaignSchema,
} from "./campaign-reports"

const C1 = "11111111-1111-4111-8111-111111111111"
const C2 = "22222222-2222-4222-8222-222222222222"
const C3 = "33333333-3333-4333-8333-333333333333"
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

describe("listCampaignReportQueue", () => {
  it("groups unresolved reports oldest-first and resolved newest-first, never selecting reporter_id or handled_by", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "campaign_reports") {
        const statuses = op(call, "in")?.[1] as string[] | undefined
        if (statuses?.includes("open")) {
          return {
            data: [
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
            ],
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
          ],
        }
      }
      return undefined
    }, calls)

    const { unresolved, resolved } = await listCampaignReportQueue(db as never)

    const reportReads = calls.filter((c) => c.target === "campaign_reports")
    expect(reportReads).toHaveLength(2)
    for (const read of reportReads) {
      const cols = String(op(read, "select")?.[0] ?? "")
      expect(cols).not.toBe("*")
      expect(cols).not.toMatch(/reporter_id|handled_by/)
    }

    const managedRead = calls.find((c) => c.target === "rpc:managed_campaigns")
    expect(op(managedRead, "in")).toEqual(["id", [C1, C2, C3]])

    expect(unresolved.map((u) => [u.campaign_id, u.open_count, u.awaiting_count, u.reports.map((r) => r.id)])).toEqual([
      [C1, 1, 1, ["r1", "r3"]],
      [C2, 1, 0, ["r2"]],
    ])
    expect(unresolved[0].campaign?.title).toBe("Chiến dịch 1")
    expect(resolved).toHaveLength(1)
    expect(resolved[0].campaign_id).toBe(C3)
    expect(resolved[0].reports.map((r) => r.id)).toEqual(["r4", "r5"])
    expect(resolved[0].latest.id).toBe("r4")
  })

  it("skips managed_campaigns when there are no reports", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => (call.target === "campaign_reports" ? { data: [] } : undefined), calls)
    expect(await listCampaignReportQueue(db as never)).toEqual({ unresolved: [], resolved: [] })
    expect(calls.map((c) => c.target)).toEqual(["campaign_reports", "campaign_reports"])
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
