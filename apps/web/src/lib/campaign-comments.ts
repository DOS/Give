import { z } from "zod"

import type { Db } from "./campaigns"
import { isUuid } from "./ids"

/**
 * Campaign comments with one reply level, reporting and moderation
 * (DOS/Give#250; DB contract in DOS/Give#262, migration
 * `supabase/migrations/20261129150000_give_campaign_comments.sql`).
 *
 * Every RPC runs with `dbAs(session?.accessToken)` — all writes and
 * moderation derive the caller from `auth.uid()` without needing the
 * service role.
 */

export const COMMENT_BODY_MAX = 2000
export const COMMENT_MODERATION_REASON_MAX = 500
export const COMMENT_REPORT_DETAILS_MAX = 1000
export const COMMENTS_PAGE_SIZE = 20
export const COMMENT_REPORTS_PAGE_SIZE = 20
export const MAX_COMMENTS_PAGE = 10_000
export const DELETED_AUTHOR_FALLBACK = "Người dùng đã xóa tài khoản"

export const COMMENT_REPORT_REASONS = [
  "spam_or_scam",
  "harassment_or_hate",
  "misinformation",
  "personal_data",
  "off_topic_or_inappropriate",
  "other",
] as const
export type CommentReportReasonCode = (typeof COMMENT_REPORT_REASONS)[number]

export const COMMENT_REPORT_REASON_LABELS: Record<CommentReportReasonCode, string> = {
  spam_or_scam: "Tin rác hoặc lừa đảo",
  harassment_or_hate: "Quấy rối hoặc ngôn từ thù ghét",
  misinformation: "Thông tin sai sự thật",
  personal_data: "Lộ thông tin cá nhân",
  off_topic_or_inappropriate: "Lạc đề hoặc không phù hợp",
  other: "Lý do khác",
}

export const COMMENT_REPORT_STATUSES = ["open", "actioned", "dismissed", "all"] as const
export type CommentReportStatusFilter = (typeof COMMENT_REPORT_STATUSES)[number]
export type CommentReportStatus = Exclude<CommentReportStatusFilter, "all">

export const COMMENT_REPORT_STATUS_LABELS: Record<CommentReportStatusFilter, string> = {
  open: "Chờ xử lý",
  actioned: "Đã xử lý",
  dismissed: "Đã bác bỏ",
  all: "Tất cả",
}

export const COMMENT_REPORT_RESOLVE_ACTIONS = ["hide", "dismiss"] as const
export type CommentReportResolveAction = (typeof COMMENT_REPORT_RESOLVE_ACTIONS)[number]

export const COMMENT_MODERATION_ACTIONS = ["hide", "unhide", "dismiss_reports"] as const
export type CommentModerationAction = (typeof COMMENT_MODERATION_ACTIONS)[number]

export type CommentStatus = "visible" | "hidden"
export type ReportedCommentStatus = CommentStatus | "deleted"
export type CommentHiddenRole = "organizer" | "moderator" | "admin"

export const COMMENT_STATUS_LABELS: Record<ReportedCommentStatus, string> = {
  visible: "Đang hiển thị",
  hidden: "Đã ẩn",
  deleted: "Tác giả đã xóa",
}

export const COMMENT_HIDDEN_ROLE_LABELS: Record<CommentHiddenRole, string> = {
  organizer: "Người tổ chức",
  moderator: "Kiểm duyệt viên",
  admin: "Quản trị viên",
}

export interface CampaignCommentRow {
  id: string
  campaign_id: string
  parent_id: string | null
  body: string
  status: CommentStatus
  author_display_name: string | null
  author_avatar_url: string | null
  is_organizer: boolean
  is_author: boolean
  created_at: string
  edited_at: string | null
  hidden_role: CommentHiddenRole | null
  hidden_reason: string | null
  hidden_at: string | null
  hidden_by_display_name: string | null
  total_top_level_count: number
}

export interface CommentThread {
  root: CampaignCommentRow
  replies: CampaignCommentRow[]
}

export interface CampaignCommentsPage {
  threads: CommentThread[]
  rows: CampaignCommentRow[]
  totalTopLevel: number
}

export interface CommentReportRow {
  report_id: string
  comment_id: string | null
  campaign_id: string
  campaign_slug: string
  campaign_title: string
  comment_parent_id: string | null
  comment_body: string | null
  comment_status: ReportedCommentStatus
  comment_created_at: string | null
  comment_deleted_at: string | null
  comment_author_name: string | null
  reason_code: CommentReportReasonCode
  details: string | null
  status: CommentReportStatus
  action_taken: string | null
  resolution_note: string | null
  handled_by_name: string | null
  handled_at: string | null
  created_at: string
  total_count: number
}

export interface CommentReportsPage {
  reports: CommentReportRow[]
  totalCount: number
}

export interface CommentModerationHistoryRow {
  id: number
  action: string
  actor_display_name: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}

/** Neutral fallback for soft-deleted profiles or deleted DOS.Me accounts. */
export function commentAuthorName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim()
  return trimmed ? trimmed : DELETED_AUTHOR_FALLBACK
}

/** First Unicode code point of the author name for the 36px initial tile. */
export function commentAuthorInitial(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim()
  if (!trimmed) return "?"
  return Array.from(trimmed)[0]?.toUpperCase() ?? "?"
}

/** Groups flat `give.list_campaign_comments` rows into 1-level threads preserving DB order. */
export function groupCommentThreads(rows: readonly CampaignCommentRow[]): CommentThread[] {
  const threads: CommentThread[] = []
  const byRootId = new Map<string, CommentThread>()

  for (const row of rows) {
    if (row.parent_id === null) {
      const thread: CommentThread = { root: row, replies: [] }
      threads.push(thread)
      byRootId.set(row.id, thread)
    }
  }

  for (const row of rows) {
    if (row.parent_id !== null) {
      const parent = byRootId.get(row.parent_id)
      if (parent) parent.replies.push(row)
    }
  }

  return threads
}

export function commentReportActionLabel(actionTaken: string | null | undefined): string {
  switch (actionTaken) {
    case "hide":
    case "hidden":
      return "Đã ẩn bình luận"
    case "unhide":
    case "unhidden":
      return "Đã hiện lại bình luận"
    case "dismiss":
    case "dismissed":
    case "dismiss_reports":
      return "Đã bác bỏ báo cáo"
    default:
      return actionTaken ?? "—"
  }
}

export function commentModerationHistoryLabel(action: string): string {
  switch (action) {
    case "campaign_comment.hide":
      return "Người tổ chức ẩn bình luận"
    case "campaign_comment.moderate_hide":
      return "Kiểm duyệt ẩn bình luận"
    case "campaign_comment.moderate_unhide":
    case "campaign_comment.unhide":
      return "Hiện lại bình luận"
    case "comment_reports.moderate":
      return "Chốt báo cáo bình luận"
    case "campaign_comment.dismiss_reports":
      return "Bác bỏ báo cáo bình luận"
    case "campaign_comment.report_resolve":
    case "comment_report.resolve":
      return "Xử lý báo cáo bình luận"
    case "campaign_comment.delete":
      return "Tác giả xóa bình luận"
    case "campaign_comment.report":
      return "Báo cáo bình luận"
    default:
      return action
  }
}

export function commentModerationHistoryReason(entry: Pick<CommentModerationHistoryRow, "after">): string | null {
  const after = entry.after
  if (!after || typeof after !== "object") return null
  for (const key of ["reason", "hidden_reason", "resolution_note"]) {
    const value = after[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

/** Parses `?comments_page=` on `/campaigns/[slug]` into a bounded 1-based page integer. */
export function parseCommentsPage(params: Record<string, string | string[] | undefined>): number {
  const raw = (Array.isArray(params.comments_page) ? params.comments_page[0] : params.comments_page) ?? ""
  if (!/^[1-9][0-9]*$/.test(raw)) return 1
  return Math.min(Number(raw), MAX_COMMENTS_PAGE)
}

/** Parses `?show_hidden=1` (staff-only toggle on `/campaigns/[slug]`). */
export function parseShowHiddenComments(params: Record<string, string | string[] | undefined>): boolean {
  const raw = Array.isArray(params.show_hidden) ? params.show_hidden[0] : params.show_hidden
  return raw === "1" || raw === "true"
}

export function campaignCommentsHref(
  slug: string,
  { page = 1, showHidden = false }: { page?: number; showHidden?: boolean } = {}
): string {
  const search = new URLSearchParams()
  if (page > 1) search.set("comments_page", String(page))
  if (showHidden) search.set("show_hidden", "1")
  const query = search.toString()
  return `/campaigns/${encodeURIComponent(slug)}${query ? `?${query}` : ""}#binh-luan`
}

/** Parses `/admin/reports/comments` query parameters. */
export function parseCommentReportFilters(params: Record<string, string | string[] | undefined>): {
  status: CommentReportStatusFilter
  page: number
  campaignId: string | null
} {
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status
  const status: CommentReportStatusFilter =
    rawStatus && (COMMENT_REPORT_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as CommentReportStatusFilter)
      : "open"

  const rawPage = (Array.isArray(params.page) ? params.page[0] : params.page) ?? ""
  const page = /^[1-9][0-9]*$/.test(rawPage) ? Math.min(Number(rawPage), MAX_COMMENTS_PAGE) : 1

  const rawCampaign = Array.isArray(params.campaign) ? params.campaign[0] : params.campaign
  const campaignId = rawCampaign && isUuid(rawCampaign) ? rawCampaign : null

  return { status, page, campaignId }
}

export function commentReportsHref({
  status = "open",
  page = 1,
  campaignId = null,
}: {
  status?: CommentReportStatusFilter
  page?: number
  campaignId?: string | null
} = {}): string {
  const search = new URLSearchParams()
  if (status !== "open") search.set("status", status)
  if (campaignId) search.set("campaign", campaignId)
  if (page > 1) search.set("page", String(page))
  const query = search.toString()
  return query ? `/admin/reports/comments?${query}` : "/admin/reports/comments"
}

/** Reads one page of comments + replies for a public campaign (`give.list_campaign_comments`). */
export async function listCampaignComments(
  db: Db,
  campaignId: string,
  {
    limit = COMMENTS_PAGE_SIZE,
    offset = 0,
    includeHidden = false,
  }: { limit?: number; offset?: number; includeHidden?: boolean } = {}
): Promise<CampaignCommentsPage> {
  const { data, error } = await db.rpc("list_campaign_comments", {
    p_campaign_id: campaignId,
    p_limit: Math.max(1, Math.min(100, Math.trunc(limit))),
    p_offset: Math.max(0, Math.trunc(offset)),
    p_include_hidden: includeHidden,
  })
  if (error) throw error
  const rawRows = (data ?? []) as unknown as Array<
    Omit<CampaignCommentRow, "total_top_level_count"> & { total_top_level_count: number | string | null }
  >
  const rows: CampaignCommentRow[] = rawRows.map((row) => ({
    ...row,
    total_top_level_count: Number(row.total_top_level_count) || 0,
  }))
  const totalTopLevel = rows.length > 0 ? rows[0].total_top_level_count : 0
  return {
    threads: groupCommentThreads(rows),
    rows,
    totalTopLevel,
  }
}

/** Reads one page of comment reports for moderator/admin staff (`give.list_comment_reports`). */
export async function listCommentReports(
  db: Db,
  {
    status = "open",
    campaignId = null,
    limit = COMMENT_REPORTS_PAGE_SIZE,
    offset = 0,
  }: {
    status?: CommentReportStatusFilter
    campaignId?: string | null
    limit?: number
    offset?: number
  } = {}
): Promise<CommentReportsPage> {
  const { data, error } = await db.rpc("list_comment_reports", {
    p_status: status,
    p_campaign_id: campaignId,
    p_limit: Math.max(1, Math.min(100, Math.trunc(limit))),
    p_offset: Math.max(0, Math.trunc(offset)),
  })
  if (error) throw error
  const rawRows = (data ?? []) as unknown as Array<
    Omit<CommentReportRow, "total_count"> & { total_count: number | string | null }
  >
  const reports: CommentReportRow[] = rawRows.map((row) => ({
    ...row,
    total_count: Number(row.total_count) || 0,
  }))
  const totalCount = reports.length > 0 ? reports[0].total_count : 0
  return { reports, totalCount }
}

/** Reads moderation audit history for a single live/hidden comment (`give.list_comment_moderation_history`). */
export async function listCommentModerationHistory(
  db: Db,
  commentId: string,
  limit = 50
): Promise<CommentModerationHistoryRow[]> {
  const { data, error } = await db.rpc("list_comment_moderation_history", {
    p_comment_id: commentId,
    p_limit: Math.max(1, Math.min(100, Math.trunc(limit))),
  })
  if (error) throw error
  const rawRows = (data ?? []) as unknown as Array<Omit<CommentModerationHistoryRow, "id"> & { id: number | string }>
  return rawRows.map((row) => ({
    ...row,
    id: Number(row.id),
  }))
}

/** Batch-loads moderation history for unique non-null comment IDs; per-comment failures degrade cleanly. */
export async function listCommentModerationHistoryByComment(
  db: Db,
  commentIds: readonly (string | null)[],
  limit = 20
): Promise<Map<string, CommentModerationHistoryRow[]>> {
  const unique = [...new Set(commentIds.filter((id): id is string => Boolean(id)))]
  const entries = await Promise.all(
    unique.map(async (commentId) => {
      const history = await listCommentModerationHistory(db, commentId, limit).catch(() => [])
      return [commentId, history] as const
    })
  )
  return new Map(entries)
}

/** Creating a top-level comment or 1-level reply (`give.create_campaign_comment`). */
export const createCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Hãy nhập nội dung bình luận.")
    .max(COMMENT_BODY_MAX, `Nội dung bình luận tối đa ${COMMENT_BODY_MAX} ký tự.`),
  parent_id: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || isUuid(v), { message: "Bình luận gốc không hợp lệ." }),
})

/** Editing an author's own visible comment (`give.edit_campaign_comment`). */
export const editCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Hãy nhập nội dung bình luận.")
    .max(COMMENT_BODY_MAX, `Nội dung bình luận tối đa ${COMMENT_BODY_MAX} ký tự.`),
})

/** Organizer hiding a comment on their own public campaign (`give.hide_campaign_comment`). */
export const hideCommentSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(COMMENT_MODERATION_REASON_MAX, `Lý do tối đa ${COMMENT_MODERATION_REASON_MAX} ký tự.`)
    .transform((v) => (v === "" ? null : v)),
})

/** Reporting a visible comment (`give.report_campaign_comment`). */
export const reportCommentSchema = z
  .object({
    reason_code: z.enum(COMMENT_REPORT_REASONS, { message: "Chọn lý do báo cáo." }),
    details: z
      .string()
      .trim()
      .max(COMMENT_REPORT_DETAILS_MAX, `Chi tiết báo cáo tối đa ${COMMENT_REPORT_DETAILS_MAX} ký tự.`)
      .transform((v) => (v === "" ? null : v)),
  })
  .refine((v) => v.reason_code !== "other" || v.details !== null, {
    message: "Ghi chi tiết khi chọn lý do “Lý do khác”.",
    path: ["details"],
  })

/** Moderator/admin resolving a comment report (`give.resolve_comment_report`). */
export const resolveCommentReportSchema = z.object({
  action: z.enum(COMMENT_REPORT_RESOLVE_ACTIONS, { message: "Thao tác kiểm duyệt không hợp lệ." }),
  reason: z
    .string()
    .trim()
    .min(1, "Cần ghi lý do xử lý để lưu vào nhật ký kiểm toán.")
    .max(COMMENT_MODERATION_REASON_MAX, `Lý do tối đa ${COMMENT_MODERATION_REASON_MAX} ký tự.`),
})

/** Moderator/admin directly moderating a comment (`give.moderate_campaign_comment`). */
export const moderateCommentSchema = z.object({
  action: z.enum(COMMENT_MODERATION_ACTIONS, { message: "Thao tác kiểm duyệt không hợp lệ." }),
  reason: z
    .string()
    .trim()
    .min(1, "Cần ghi lý do xử lý để lưu vào nhật ký kiểm toán.")
    .max(COMMENT_MODERATION_REASON_MAX, `Lý do tối đa ${COMMENT_MODERATION_REASON_MAX} ký tự.`),
})
