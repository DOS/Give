import { z } from "zod"

import type { Db } from "./campaigns"
import { isUuid } from "./ids"

/**
 * Moderated donor wishes wall and heart reactions (DOS/Give#320; DB contract
 * in `DOS/DOS.Me` migration `20261202140000_give_donor_wishes_and_hearts.sql`).
 *
 * Every read and write runs under `dbAs(session?.accessToken)` (or `dbAs()`
 * for anonymous reads of `give.list_campaign_wishes`) — zero `dbService()`
 * usage and zero raw PII/user IDs exposed.
 */

export const WISHES_PAGE_SIZE = 20
export const WISH_REPORTS_LIMIT = 50
export const WISH_HIDDEN_LIMIT = 50
export const WISH_REASON_MAX = 500
export const MAX_WISHES_PAGE = 10_000

export const ANONYMOUS_DONOR_LABEL = "Người ủng hộ ẩn danh"
export const UNNAMED_DONOR_LABEL = "Nhà hảo tâm"

export const WISH_REPORT_STATUSES = ["open", "resolved", "dismissed", "all"] as const
export type WishReportStatusFilter = (typeof WISH_REPORT_STATUSES)[number]
export type WishReportStatus = Exclude<WishReportStatusFilter, "all">

export const WISH_REPORT_STATUS_LABELS: Record<WishReportStatusFilter, string> = {
  open: "Chờ xử lý",
  resolved: "Đã ẩn lời chúc",
  dismissed: "Đã bác bỏ",
  all: "Tất cả",
}

export const WISH_MODERATION_ACTIONS = ["hide", "restore", "dismiss_reports"] as const
export type WishModerationAction = (typeof WISH_MODERATION_ACTIONS)[number]

export type WishHiddenRole = "owner" | "editor" | "moderator" | "admin"

export const WISH_HIDDEN_ROLE_LABELS: Record<WishHiddenRole, string> = {
  owner: "Người tổ chức",
  editor: "Đồng tổ chức",
  moderator: "Kiểm duyệt viên",
  admin: "Quản trị viên",
}

export interface CampaignWishRow {
  contribution_id: string
  display_name: string | null
  is_anonymous: boolean
  amount: number
  message: string
  created_at: string
  heart_count: number
  viewer_hearted: boolean
  total_count: number
}

export interface CampaignWishesPage {
  wishes: CampaignWishRow[]
  totalCount: number
}

export interface HiddenCampaignWishRow {
  contribution_id: string
  display_name: string | null
  is_anonymous: boolean
  amount: number
  message: string
  created_at: string
  message_hidden_at: string
  message_hidden_role: WishHiddenRole
  message_hide_reason: string | null
  can_restore: boolean
}

export interface ReportedWishRow {
  report_id: string
  contribution_id: string
  campaign_id: string
  campaign_slug: string
  campaign_title: string
  donor_display_name: string | null
  is_anonymous: boolean
  amount: number
  message: string | null
  message_hidden_at: string | null
  message_hidden_role: WishHiddenRole | null
  message_hide_reason: string | null
  reason: string
  status: WishReportStatus
  resolved_by_name: string | null
  resolved_at: string | null
  created_at: string
  total_count: number
}

export interface ReportedWishesPage {
  reports: ReportedWishRow[]
  totalCount: number
}

export interface WishHeartToggleResult {
  hearted: boolean
  heart_count: number
}

export interface WishModerationResult {
  contribution_id: string
  action: WishModerationAction
  message_hidden_at: string | null
  resolved_reports: number
}

/**
 * Formats donor display name on the Donor Wishes Wall & moderation queue:
 * masks anonymous donors cleanly and falls back when a public name was omitted.
 */
export function wishDonorName(displayName: string | null | undefined, isAnonymous: boolean): string {
  if (isAnonymous) return ANONYMOUS_DONOR_LABEL
  const trimmed = displayName?.trim()
  return trimmed ? trimmed : UNNAMED_DONOR_LABEL
}

/** Single-character initial for the 36px donor tile on the wishes wall. */
export function wishDonorInitial(displayName: string | null | undefined, isAnonymous: boolean): string {
  if (isAnonymous) return "Ẩ"
  const label = wishDonorName(displayName, false)
  return Array.from(label)[0]?.toUpperCase() ?? "?"
}

/** Parses `?wishes_page=` on `/campaigns/[slug]` into a bounded 1-based page integer. */
export function parseWishesPage(params: Record<string, string | string[] | undefined>): number {
  const raw = (Array.isArray(params.wishes_page) ? params.wishes_page[0] : params.wishes_page) ?? ""
  if (!/^[1-9][0-9]*$/.test(raw)) return 1
  return Math.min(Number(raw), MAX_WISHES_PAGE)
}

/** Parses `?show_hidden_wishes=1` (authorized owner/editor/staff toggle on `/campaigns/[slug]`). */
export function parseShowHiddenWishes(params: Record<string, string | string[] | undefined>): boolean {
  const raw = Array.isArray(params.show_hidden_wishes) ? params.show_hidden_wishes[0] : params.show_hidden_wishes
  return raw === "1" || raw === "true"
}

export function campaignWishesHref(
  slug: string,
  { page = 1, showHidden = false }: { page?: number; showHidden?: boolean } = {}
): string {
  const search = new URLSearchParams()
  if (page > 1) search.set("wishes_page", String(page))
  if (showHidden) search.set("show_hidden_wishes", "1")
  const qs = search.toString()
  return `/campaigns/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}#tuong-loi-chuc`
}

export function parseWishReportStatus(params: Record<string, string | string[] | undefined>): WishReportStatusFilter {
  const raw = (Array.isArray(params.status) ? params.status[0] : params.status) ?? "open"
  return (WISH_REPORT_STATUSES as readonly string[]).includes(raw) ? (raw as WishReportStatusFilter) : "open"
}

export function wishReportsHref(status: WishReportStatusFilter = "open"): string {
  if (status === "open") return "/admin/reports/wishes"
  return `/admin/reports/wishes?status=${encodeURIComponent(status)}`
}

export const reportWishSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Hãy ghi lý do báo cáo lời chúc.")
    .max(WISH_REASON_MAX, `Lý do báo cáo tối đa ${WISH_REASON_MAX} ký tự.`),
})

export const moderateWishSchema = z.object({
  action: z.enum(WISH_MODERATION_ACTIONS, { message: "Thao tác kiểm duyệt không hợp lệ." }),
  reason: z
    .string()
    .trim()
    .max(WISH_REASON_MAX, `Lý do kiểm duyệt tối đa ${WISH_REASON_MAX} ký tự.`)
    .transform((v) => (v === "" ? null : v)),
})

function normalizeHiddenRole(value: unknown): WishHiddenRole | null {
  return value === "owner" || value === "editor" || value === "moderator" || value === "admin" ? value : null
}

/**
 * Loads a page of public matched donor wishes (`give.list_campaign_wishes`).
 * Pass `dbAs(session.accessToken)` for signed-in visitors so `viewer_hearted`
 * reflects their own hearts, or `dbAs()` for anonymous guests.
 */
export async function listCampaignWishes(
  db: Db,
  campaignId: string,
  { limit = WISHES_PAGE_SIZE, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<CampaignWishesPage> {
  if (!isUuid(campaignId)) return { wishes: [], totalCount: 0 }
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || WISHES_PAGE_SIZE, 1), 50)
  const safeOffset = Math.max(Math.trunc(offset) || 0, 0)
  const { data, error } = await db.rpc("list_campaign_wishes", {
    p_campaign_id: campaignId,
    p_limit: safeLimit,
    p_offset: safeOffset,
  })
  if (error) throw error
  const rawRows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
  const wishes: CampaignWishRow[] = rawRows.map((row) => ({
    contribution_id: String(row.contribution_id ?? ""),
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    is_anonymous: row.is_anonymous === true,
    amount: Number(row.amount) || 0,
    message: typeof row.message === "string" ? row.message : "",
    created_at: String(row.created_at ?? ""),
    heart_count: Number(row.heart_count) || 0,
    viewer_hearted: row.viewer_hearted === true,
    total_count: Number(row.total_count) || 0,
  }))
  const totalCount = wishes[0]?.total_count ?? 0
  return { wishes, totalCount }
}

/**
 * Loads hidden donor wishes on a campaign (`give.list_hidden_campaign_wishes`)
 * for authorized actors (owner, accepted editor, or moderator/admin) under
 * `dbAs(session.accessToken)`.
 */
export async function listHiddenCampaignWishes(
  db: Db,
  campaignId: string,
  limit = WISH_HIDDEN_LIMIT
): Promise<HiddenCampaignWishRow[]> {
  if (!isUuid(campaignId)) return []
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || WISH_HIDDEN_LIMIT, 1), 100)
  const { data, error } = await db.rpc("list_hidden_campaign_wishes", {
    p_campaign_id: campaignId,
    p_limit: safeLimit,
  })
  if (error) throw error
  const rawRows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
  return rawRows.map((row) => ({
    contribution_id: String(row.contribution_id ?? ""),
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    is_anonymous: row.is_anonymous === true,
    amount: Number(row.amount) || 0,
    message: typeof row.message === "string" ? row.message : "",
    created_at: String(row.created_at ?? ""),
    message_hidden_at: String(row.message_hidden_at ?? ""),
    message_hidden_role: normalizeHiddenRole(row.message_hidden_role) ?? "moderator",
    message_hide_reason: typeof row.message_hide_reason === "string" ? row.message_hide_reason : null,
    can_restore: row.can_restore === true,
  }))
}

/**
 * Loads the moderator/admin queue of reported donor wishes
 * (`give.list_reported_contribution_messages`) under `dbAs(session.accessToken)`.
 */
export async function listReportedContributionMessages(
  db: Db,
  { status = "open", limit = WISH_REPORTS_LIMIT }: { status?: WishReportStatusFilter; limit?: number } = {}
): Promise<ReportedWishesPage> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || WISH_REPORTS_LIMIT, 1), 100)
  const { data, error } = await db.rpc("list_reported_contribution_messages", {
    p_status: status,
    p_limit: safeLimit,
  })
  if (error) throw error
  const rawRows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
  const reports: ReportedWishRow[] = rawRows.map((row) => ({
    report_id: String(row.report_id ?? ""),
    contribution_id: String(row.contribution_id ?? ""),
    campaign_id: String(row.campaign_id ?? ""),
    campaign_slug: String(row.campaign_slug ?? ""),
    campaign_title: String(row.campaign_title ?? ""),
    donor_display_name: typeof row.donor_display_name === "string" ? row.donor_display_name : null,
    is_anonymous: row.is_anonymous === true,
    amount: Number(row.amount) || 0,
    message: typeof row.message === "string" ? row.message : null,
    message_hidden_at: typeof row.message_hidden_at === "string" ? row.message_hidden_at : null,
    message_hidden_role: normalizeHiddenRole(row.message_hidden_role),
    message_hide_reason: typeof row.message_hide_reason === "string" ? row.message_hide_reason : null,
    reason: String(row.reason ?? ""),
    status:
      row.status === "resolved" || row.status === "dismissed" || row.status === "open"
        ? (row.status as WishReportStatus)
        : "open",
    resolved_by_name: typeof row.resolved_by_name === "string" ? row.resolved_by_name : null,
    resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null,
    created_at: String(row.created_at ?? ""),
    total_count: Number(row.total_count) || 0,
  }))
  const totalCount = reports[0]?.total_count ?? 0
  return { reports, totalCount }
}
