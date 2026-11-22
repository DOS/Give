import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  campaignCommentsHref,
  COMMENT_BODY_MAX,
  COMMENT_MODERATION_REASON_MAX,
  COMMENT_REPORT_DETAILS_MAX,
  commentAuthorInitial,
  commentAuthorName,
  commentModerationHistoryLabel,
  commentModerationHistoryReason,
  commentReportActionLabel,
  commentReportsHref,
  createCommentSchema,
  DELETED_AUTHOR_FALLBACK,
  editCommentSchema,
  groupCommentThreads,
  hideCommentSchema,
  listCampaignComments,
  listCommentModerationHistory,
  listCommentModerationHistoryByComment,
  listCommentReports,
  moderateCommentSchema,
  parseCommentReportFilters,
  parseCommentsPage,
  parseShowHiddenComments,
  reportCommentSchema,
  resolveCommentReportSchema,
  type CampaignCommentRow,
} from "./campaign-comments"
import type { Db } from "./campaigns"

const CAMPAIGN = "11111111-1111-4111-8111-111111111111"
const ROOT_1 = "22222222-2222-4222-8222-222222222222"
const ROOT_2 = "33333333-3333-4333-8333-333333333333"
const REPLY_1 = "44444444-4444-4444-8444-444444444444"
const REPLY_2 = "55555555-5555-4555-8555-555555555555"

function commentRow(id: string, overrides: Partial<CampaignCommentRow> = {}): CampaignCommentRow {
  return {
    id,
    campaign_id: CAMPAIGN,
    parent_id: null,
    body: "Nội dung bình luận",
    status: "visible",
    author_display_name: "Minh Anh",
    author_avatar_url: null,
    is_organizer: false,
    is_author: false,
    created_at: "2026-11-20T08:00:00.000Z",
    edited_at: null,
    hidden_role: null,
    hidden_reason: null,
    hidden_at: null,
    hidden_by_display_name: null,
    total_top_level_count: 2,
    ...overrides,
  }
}

describe("campaign-comments helpers & thread grouping (DOS/Give#250)", () => {
  it("groups flat RPC rows into 1-level threads preserving DB order and ignoring orphan replies", () => {
    const rows: CampaignCommentRow[] = [
      commentRow(ROOT_1, { body: "Gốc mới hơn" }),
      commentRow(REPLY_1, { parent_id: ROOT_1, body: "Phản hồi 1" }),
      commentRow(REPLY_2, { parent_id: ROOT_1, body: "Phản hồi 2" }),
      commentRow(ROOT_2, { body: "Gốc cũ hơn" }),
      commentRow("99999999-9999-4999-8999-999999999999", {
        parent_id: "88888888-8888-4888-8888-888888888888",
        body: "Phản hồi mồ côi",
      }),
    ]

    const threads = groupCommentThreads(rows)
    expect(threads).toHaveLength(2)
    expect(threads[0].root.id).toBe(ROOT_1)
    expect(threads[0].replies.map((r) => r.id)).toEqual([REPLY_1, REPLY_2])
    expect(threads[1].root.id).toBe(ROOT_2)
    expect(threads[1].replies).toEqual([])
  })

  it("renders neutral fallback for deleted accounts and safe Unicode code-point initials", () => {
    expect(commentAuthorName(null)).toBe(DELETED_AUTHOR_FALLBACK)
    expect(commentAuthorName("   ")).toBe(DELETED_AUTHOR_FALLBACK)
    expect(commentAuthorName("  Lan Phương  ")).toBe("Lan Phương")

    expect(commentAuthorInitial(null)).toBe("?")
    expect(commentAuthorInitial("   ")).toBe("?")
    expect(commentAuthorInitial("đồng hành")).toBe("Đ")
    expect(commentAuthorInitial("🌱 Mầm Xanh")).toBe("🌱")
    expect(commentAuthorInitial("𠀀 Xuân")).toBe("𠀀")
  })

  it("maps report actions and moderation history entries cleanly to Vietnamese", () => {
    expect(commentReportActionLabel("hide")).toBe("Đã ẩn bình luận")
    expect(commentReportActionLabel("hidden")).toBe("Đã ẩn bình luận")
    expect(commentReportActionLabel("dismiss")).toBe("Đã bác bỏ báo cáo")
    expect(commentReportActionLabel("dismissed")).toBe("Đã bác bỏ báo cáo")
    expect(commentReportActionLabel("unhide")).toBe("Đã hiện lại bình luận")
    expect(commentReportActionLabel(null)).toBe("—")

    expect(commentModerationHistoryLabel("campaign_comment.hide")).toBe("Người tổ chức ẩn bình luận")
    expect(commentModerationHistoryLabel("campaign_comment.moderate_hide")).toBe("Kiểm duyệt ẩn bình luận")
    expect(commentModerationHistoryLabel("campaign_comment.moderate_unhide")).toBe("Hiện lại bình luận")
    expect(commentModerationHistoryLabel("comment_reports.moderate")).toBe("Chốt báo cáo bình luận")
    expect(commentModerationHistoryLabel("campaign_comment.unhide")).toBe("Hiện lại bình luận")
    expect(commentModerationHistoryLabel("campaign_comment.dismiss_reports")).toBe("Bác bỏ báo cáo bình luận")
    expect(commentModerationHistoryLabel("campaign_comment.delete")).toBe("Tác giả xóa bình luận")

    expect(commentModerationHistoryReason({ after: { reason: "  Vi phạm quy định  " } })).toBe("Vi phạm quy định")
    expect(commentModerationHistoryReason({ after: { hidden_reason: "Tin rác" } })).toBe("Tin rác")
    expect(commentModerationHistoryReason({ after: { resolution_note: "Không vi phạm" } })).toBe("Không vi phạm")
    expect(commentModerationHistoryReason({ after: null })).toBeNull()
  })

  it("parses and builds campaign comment and admin comment report URLs safely", () => {
    expect(parseCommentsPage({})).toBe(1)
    expect(parseCommentsPage({ comments_page: "0" })).toBe(1)
    expect(parseCommentsPage({ comments_page: "-3" })).toBe(1)
    expect(parseCommentsPage({ comments_page: "3" })).toBe(3)
    expect(parseCommentsPage({ comments_page: "999999" })).toBe(10_000)

    expect(parseShowHiddenComments({})).toBe(false)
    expect(parseShowHiddenComments({ show_hidden: "1" })).toBe(true)
    expect(parseShowHiddenComments({ show_hidden: "true" })).toBe(true)
    expect(parseShowHiddenComments({ show_hidden: "0" })).toBe(false)

    expect(campaignCommentsHref("xay-truong")).toBe("/campaigns/xay-truong#binh-luan")
    expect(campaignCommentsHref("xay-truong", { page: 2, showHidden: true })).toBe(
      "/campaigns/xay-truong?comments_page=2&show_hidden=1#binh-luan"
    )

    expect(parseCommentReportFilters({})).toEqual({ status: "open", page: 1, campaignId: null })
    expect(parseCommentReportFilters({ status: "bogus", page: "abc", campaign: "not-a-uuid" })).toEqual({
      status: "open",
      page: 1,
      campaignId: null,
    })
    expect(parseCommentReportFilters({ status: "actioned", page: "2", campaign: CAMPAIGN })).toEqual({
      status: "actioned",
      page: 2,
      campaignId: CAMPAIGN,
    })

    expect(commentReportsHref()).toBe("/admin/reports/comments")
    expect(commentReportsHref({ status: "dismissed", page: 2, campaignId: CAMPAIGN })).toBe(
      `/admin/reports/comments?status=dismissed&campaign=${CAMPAIGN}&page=2`
    )
  })
})

describe("campaign-comments RPC loaders (DOS/Give#250)", () => {
  it("loads paginated campaign comments via give.list_campaign_comments and normalizes bigint counts", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          { ...commentRow(ROOT_1), total_top_level_count: "42" },
          { ...commentRow(REPLY_1, { parent_id: ROOT_1 }), total_top_level_count: "42" },
        ],
      }),
      calls
    ) as unknown as Db

    const result = await listCampaignComments(db, CAMPAIGN, { limit: 20, offset: 20, includeHidden: true })
    expect(calls[0].target).toBe("rpc:list_campaign_comments")
    expect(op(calls[0], "args")?.[0]).toEqual({
      p_campaign_id: CAMPAIGN,
      p_limit: 20,
      p_offset: 20,
      p_include_hidden: true,
    })
    expect(result.totalTopLevel).toBe(42)
    expect(result.threads).toHaveLength(1)
    expect(result.threads[0].replies).toHaveLength(1)
  })

  it("loads comment reports via give.list_comment_reports and normalizes total_count", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          {
            report_id: "aaaa0000-0000-4000-8000-000000000001",
            comment_id: ROOT_1,
            campaign_id: CAMPAIGN,
            campaign_slug: "xay-truong",
            campaign_title: "Xây trường",
            comment_parent_id: null,
            comment_body: "Bình luận bị báo cáo",
            comment_status: "visible",
            comment_created_at: "2026-11-20T08:00:00.000Z",
            comment_deleted_at: null,
            comment_author_name: "Người viết",
            reason_code: "spam_or_scam",
            details: "Quảng cáo",
            status: "open",
            action_taken: null,
            resolution_note: null,
            handled_by_name: null,
            handled_at: null,
            created_at: "2026-11-20T09:00:00.000Z",
            total_count: "7",
          },
        ],
      }),
      calls
    ) as unknown as Db

    const page = await listCommentReports(db, { status: "open", campaignId: CAMPAIGN, limit: 20, offset: 0 })
    expect(calls[0].target).toBe("rpc:list_comment_reports")
    expect(op(calls[0], "args")?.[0]).toEqual({
      p_status: "open",
      p_campaign_id: CAMPAIGN,
      p_limit: 20,
      p_offset: 0,
    })
    expect(page.totalCount).toBe(7)
    expect(page.reports).toHaveLength(1)
  })

  it("loads comment moderation history and degrades per-comment failures cleanly in batch", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => {
      const args = op(call, "args")?.[0] as { p_comment_id?: string } | undefined
      if (args?.p_comment_id === ROOT_1) {
        return {
          data: [
            {
              id: "12",
              action: "campaign_comment.hide",
              actor_display_name: "Kiểm duyệt viên",
              before: { status: "visible" },
              after: { status: "hidden", reason: "Vi phạm" },
              created_at: "2026-11-20T10:00:00.000Z",
            },
          ],
        }
      }
      return { error: { code: "42501", message: "permission denied" } }
    }, calls) as unknown as Db

    const single = await listCommentModerationHistory(db, ROOT_1, 10)
    expect(single).toHaveLength(1)
    expect(single[0].id).toBe(12)

    const map = await listCommentModerationHistoryByComment(db, [ROOT_1, null, ROOT_2, ROOT_1], 10)
    expect(map.get(ROOT_1)).toHaveLength(1)
    expect(map.get(ROOT_2)).toEqual([])
  })
})

describe("campaign-comments Zod schemas (DOS/Give#250)", () => {
  it("validates create, edit, hide, report, resolve and moderate payloads against DB bounds", () => {
    expect(createCommentSchema.safeParse({ body: "  Chúc thành công!  ", parent_id: "" })).toMatchObject({
      success: true,
      data: { body: "Chúc thành công!", parent_id: null },
    })
    expect(createCommentSchema.safeParse({ body: "   ", parent_id: "" }).success).toBe(false)
    expect(createCommentSchema.safeParse({ body: "a".repeat(COMMENT_BODY_MAX + 1), parent_id: "" }).success).toBe(false)
    expect(createCommentSchema.safeParse({ body: "Trả lời", parent_id: "not-a-uuid" }).success).toBe(false)
    expect(createCommentSchema.safeParse({ body: "Trả lời", parent_id: ROOT_1 }).success).toBe(true)

    expect(editCommentSchema.safeParse({ body: "  Sửa lại  " })).toMatchObject({
      success: true,
      data: { body: "Sửa lại" },
    })
    expect(editCommentSchema.safeParse({ body: "" }).success).toBe(false)

    expect(hideCommentSchema.safeParse({ reason: "   " })).toMatchObject({ success: true, data: { reason: null } })
    expect(hideCommentSchema.safeParse({ reason: "a".repeat(COMMENT_MODERATION_REASON_MAX + 1) }).success).toBe(false)

    expect(reportCommentSchema.safeParse({ reason_code: "spam_or_scam", details: "  " })).toMatchObject({
      success: true,
      data: { reason_code: "spam_or_scam", details: null },
    })
    expect(reportCommentSchema.safeParse({ reason_code: "other", details: "   " }).success).toBe(false)
    expect(
      reportCommentSchema.safeParse({
        reason_code: "spam_or_scam",
        details: "x".repeat(COMMENT_REPORT_DETAILS_MAX + 1),
      }).success
    ).toBe(false)

    expect(resolveCommentReportSchema.safeParse({ action: "hide", reason: "  Vi phạm  " })).toMatchObject({
      success: true,
      data: { action: "hide", reason: "Vi phạm" },
    })
    expect(resolveCommentReportSchema.safeParse({ action: "unhide", reason: "x" }).success).toBe(false)
    expect(resolveCommentReportSchema.safeParse({ action: "dismiss", reason: "   " }).success).toBe(false)

    expect(moderateCommentSchema.safeParse({ action: "unhide", reason: "Đã xác minh" }).success).toBe(true)
    expect(moderateCommentSchema.safeParse({ action: "dismiss_reports", reason: "Không vi phạm" }).success).toBe(true)
    expect(moderateCommentSchema.safeParse({ action: "delete", reason: "x" }).success).toBe(false)
  })
})
