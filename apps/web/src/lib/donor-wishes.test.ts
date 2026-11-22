import { describe, expect, it } from "vitest"

import type { Db } from "@/lib/campaigns"
import {
  ANONYMOUS_DONOR_LABEL,
  campaignWishesHref,
  listCampaignWishes,
  listHiddenCampaignWishes,
  listReportedContributionMessages,
  moderateWishSchema,
  parseShowHiddenWishes,
  parseWishesPage,
  parseWishReportStatus,
  reportWishSchema,
  UNNAMED_DONOR_LABEL,
  wishDonorInitial,
  wishDonorName,
  wishReportsHref,
} from "@/lib/donor-wishes"
import {
  dbErrorMessage,
  WISH_HEART_MESSAGES,
  WISH_MODERATION_MESSAGES,
  WISH_REPORT_MESSAGES,
  wishDbErrorMessage,
} from "@/lib/errors"
import { fakeDb, op, type Call } from "@/test/fake-db"

const CAMPAIGN = "3200c000-0000-4000-8000-000000000001"
const CONTRIB = "3200d000-0000-4000-8000-000000000001"

describe("donor-wishes helpers & schemas (DOS/Give#320)", () => {
  it("formats anonymous, named, and unnamed donor labels and initials cleanly", () => {
    expect(wishDonorName("Tên Bí Mật", true)).toBe(ANONYMOUS_DONOR_LABEL)
    expect(wishDonorInitial("Tên Bí Mật", true)).toBe("Ẩ")
    expect(wishDonorName("  Nguyễn An  ", false)).toBe("Nguyễn An")
    expect(wishDonorInitial("  nguyễn an ", false)).toBe("N")
    expect(wishDonorName("   ", false)).toBe(UNNAMED_DONOR_LABEL)
    expect(wishDonorName(null, false)).toBe(UNNAMED_DONOR_LABEL)
    expect(wishDonorInitial(null, false)).toBe("N")
  })

  it("parses pagination, hidden-wishes toggle, and report status filters safely", () => {
    expect(parseWishesPage({})).toBe(1)
    expect(parseWishesPage({ wishes_page: "0" })).toBe(1)
    expect(parseWishesPage({ wishes_page: "-3" })).toBe(1)
    expect(parseWishesPage({ wishes_page: "abc" })).toBe(1)
    expect(parseWishesPage({ wishes_page: "4" })).toBe(4)
    expect(parseWishesPage({ wishes_page: "9999999" })).toBe(10_000)

    expect(parseShowHiddenWishes({})).toBe(false)
    expect(parseShowHiddenWishes({ show_hidden_wishes: "1" })).toBe(true)
    expect(parseShowHiddenWishes({ show_hidden_wishes: "true" })).toBe(true)
    expect(parseShowHiddenWishes({ show_hidden_wishes: "0" })).toBe(false)

    expect(campaignWishesHref("chien-dich")).toBe("/campaigns/chien-dich#tuong-loi-chuc")
    expect(campaignWishesHref("chien-dich", { page: 2, showHidden: true })).toBe(
      "/campaigns/chien-dich?wishes_page=2&show_hidden_wishes=1#tuong-loi-chuc"
    )

    expect(parseWishReportStatus({})).toBe("open")
    expect(parseWishReportStatus({ status: "resolved" })).toBe("resolved")
    expect(parseWishReportStatus({ status: "dismissed" })).toBe("dismissed")
    expect(parseWishReportStatus({ status: "all" })).toBe("all")
    expect(parseWishReportStatus({ status: "bogus" })).toBe("open")

    expect(wishReportsHref("open")).toBe("/admin/reports/wishes")
    expect(wishReportsHref("resolved")).toBe("/admin/reports/wishes?status=resolved")
  })

  it("validates reportWishSchema and moderateWishSchema", () => {
    expect(reportWishSchema.safeParse({ reason: "  " }).success).toBe(false)
    expect(reportWishSchema.safeParse({ reason: "x".repeat(501) }).success).toBe(false)
    expect(reportWishSchema.parse({ reason: "  Quảng cáo rác  " })).toEqual({ reason: "Quảng cáo rác" })

    expect(moderateWishSchema.safeParse({ action: "delete", reason: "" }).success).toBe(false)
    expect(moderateWishSchema.safeParse({ action: "hide", reason: "x".repeat(501) }).success).toBe(false)
    expect(moderateWishSchema.parse({ action: "hide", reason: "   " })).toEqual({ action: "hide", reason: null })
    expect(moderateWishSchema.parse({ action: "restore", reason: "  Đã rà soát  " })).toEqual({
      action: "restore",
      reason: "Đã rà soát",
    })
    expect(moderateWishSchema.parse({ action: "dismiss_reports", reason: "" })).toEqual({
      action: "dismiss_reports",
      reason: null,
    })
  })
})

describe("donor-wishes RPC readers (DOS/Give#320)", () => {
  it("reads give.list_campaign_wishes with clamped bounds and coerces bigint counts", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          {
            contribution_id: CONTRIB,
            display_name: "Nguyễn An",
            is_anonymous: false,
            amount: "500000",
            message: "Chúc chiến dịch thành công!",
            created_at: "2026-11-22T09:00:00.000Z",
            heart_count: "12",
            viewer_hearted: true,
            total_count: "35",
          },
        ],
      }),
      calls
    ) as unknown as Db

    const page = await listCampaignWishes(db, CAMPAIGN, { limit: 99, offset: -5 })
    expect(calls[0].target).toBe("rpc:list_campaign_wishes")
    expect(op(calls[0], "args")?.[0]).toEqual({
      p_campaign_id: CAMPAIGN,
      p_limit: 50,
      p_offset: 0,
    })
    expect(page).toEqual({
      wishes: [
        {
          contribution_id: CONTRIB,
          display_name: "Nguyễn An",
          is_anonymous: false,
          amount: 500_000,
          message: "Chúc chiến dịch thành công!",
          created_at: "2026-11-22T09:00:00.000Z",
          heart_count: 12,
          viewer_hearted: true,
          total_count: 35,
        },
      ],
      totalCount: 35,
    })

    // Non-UUID campaign short-circuits before calling DB
    calls.length = 0
    expect(await listCampaignWishes(db, "not-a-uuid")).toEqual({ wishes: [], totalCount: 0 })
    expect(calls).toHaveLength(0)
  })

  it("reads give.list_hidden_campaign_wishes and give.list_reported_contribution_messages cleanly", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "rpc:list_hidden_campaign_wishes") {
        return {
          data: [
            {
              contribution_id: CONTRIB,
              display_name: null,
              is_anonymous: true,
              amount: "200000",
              message: "Nội dung bị ẩn",
              created_at: "2026-11-22T08:00:00.000Z",
              message_hidden_at: "2026-11-22T09:00:00.000Z",
              message_hidden_role: "moderator",
              message_hide_reason: "Vi phạm",
              can_restore: false,
            },
          ],
        }
      }
      if (call.target === "rpc:list_reported_contribution_messages") {
        return {
          data: [
            {
              report_id: "3200e000-0000-4000-8000-000000000001",
              contribution_id: CONTRIB,
              campaign_id: CAMPAIGN,
              campaign_slug: "give-320",
              campaign_title: "Chiến dịch 320",
              donor_display_name: "Nguyễn An",
              is_anonymous: false,
              amount: "500000",
              message: "Lời chúc bị báo cáo",
              message_hidden_at: null,
              message_hidden_role: null,
              message_hide_reason: null,
              reason: "Quảng cáo rác",
              status: "open",
              resolved_by_name: null,
              resolved_at: null,
              created_at: "2026-11-22T09:30:00.000Z",
              total_count: "1",
            },
          ],
        }
      }
      return undefined
    }, calls) as unknown as Db

    const hidden = await listHiddenCampaignWishes(db, CAMPAIGN)
    expect(hidden).toHaveLength(1)
    expect(hidden[0].can_restore).toBe(false)
    expect(hidden[0].message_hidden_role).toBe("moderator")

    const queue = await listReportedContributionMessages(db, { status: "open", limit: 25 })
    expect(queue.totalCount).toBe(1)
    expect(queue.reports[0].amount).toBe(500_000)
    expect(op(calls[1], "args")?.[0]).toEqual({ p_status: "open", p_limit: 25 })
  })
})

describe("donor-wishes error mappings (DOS/Give#320)", () => {
  it("maps GIVE_WISH_NOT_FOUND, GIVE_STAFF_HIDE_LOCKED, GIVE_SELF_REVIEW, and rate limits without leaking raw SQL", () => {
    expect(dbErrorMessage({ message: "GIVE_WISH_NOT_FOUND" })).toContain("Không tìm thấy lời chúc")
    expect(dbErrorMessage({ message: "GIVE_STAFF_HIDE_LOCKED" })).toContain("kiểm duyệt viên")
    expect(wishDbErrorMessage({ message: "GIVE_SELF_REVIEW" }, WISH_MODERATION_MESSAGES)).toContain(
      "một kiểm duyệt viên khác"
    )
    expect(wishDbErrorMessage({ message: "GIVE_NOT_ALLOWED" }, WISH_REPORT_MESSAGES)).toContain("của chính mình")
    expect(wishDbErrorMessage({ message: "GIVE_RATE_LIMITED: 30" }, WISH_HEART_MESSAGES)).toContain("30 giây")
    // Unknown raw Postgres internals never leak to UI
    const raw = wishDbErrorMessage({
      code: "XX000",
      message: "relation give.contribution_hearts does not exist at character 42",
    })
    expect(raw).toBe("Có lỗi xảy ra. Hãy thử lại sau.")
    expect(raw).not.toContain("contribution_hearts")
  })
})
