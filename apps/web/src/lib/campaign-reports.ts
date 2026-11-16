import { z } from "zod"

import type { CampaignStatus, CampaignType, Db, Organizer } from "./campaigns"
import { STOP_PUBLIC_NOTE_MAX } from "./payment-requests"

/**
 * Campaign reports and the moderator queue (DOS/Give#98; DDL in DOS-Me
 * `supabase/migrations/20261120090000_give_campaign_reports.sql`):
 * give.campaign_reports, give.report_campaign and
 * give.moderate_campaign_reports.
 *
 * Access model: clients never write reports directly; both RPCs run as
 * service_role after the server verifies the caller's token. Moderator/admin
 * staff read reports under RLS with column-level SELECT that omits
 * `reporter_id` and `handled_by`, so neither who reported nor who handled
 * ever reaches a client.
 */

export const REPORT_REASONS = [
  "fraud_or_impersonation",
  "false_or_misleading",
  "prohibited_or_harmful",
  "misuse_of_funds",
  "personal_data_or_copyright",
  "other",
] as const
export type ReportReasonCode = (typeof REPORT_REASONS)[number]

export const REPORT_REASON_LABELS: Record<ReportReasonCode, string> = {
  fraud_or_impersonation: "Mạo danh hoặc lừa đảo",
  false_or_misleading: "Thông tin sai sự thật hoặc gây hiểu lầm",
  prohibited_or_harmful: "Nội dung bị cấm hoặc gây hại",
  misuse_of_funds: "Sử dụng tiền ủng hộ sai mục đích",
  personal_data_or_copyright: "Xâm phạm dữ liệu cá nhân hoặc bản quyền",
  other: "Lý do khác",
}

export const REPORT_DETAILS_MAX = 1000
export const MODERATION_NOTE_MAX = 1000

export const MODERATION_ACTIONS = ["dismiss", "ask_organizer", "suspend", "stop_payment_requests"] as const
export type ModerationAction = (typeof MODERATION_ACTIONS)[number]

export type CampaignReportStatus = "open" | "awaiting_organizer" | "actioned" | "dismissed"
export type CampaignReportActionTaken = "dismissed" | "asked_organizer" | "suspended" | "stopped_payment_requests"

export const REPORT_STATUS_LABELS: Record<CampaignReportStatus, string> = {
  open: "Chờ xem xét",
  awaiting_organizer: "Chờ người tổ chức phản hồi",
  actioned: "Đã xử lý",
  dismissed: "Đã bác bỏ",
}

export const REPORT_ACTION_LABELS: Record<CampaignReportActionTaken, string> = {
  asked_organizer: "Đã hỏi người tổ chức",
  dismissed: "Bác bỏ báo cáo",
  suspended: "Tạm dừng chiến dịch",
  stopped_payment_requests: "Tạm dừng yêu cầu thanh toán",
}

/** Granted columns only: reporter_id and handled_by are withheld by the database. */
export const CAMPAIGN_REPORT_COLUMNS =
  "id, campaign_id, reason_code, details, status, action_taken, resolution_note, handled_at, created_at, updated_at"

const MANAGED_REPORT_CAMPAIGN_COLUMNS =
  "id, slug, type, status, title, organizer_id, review_note, payments_stopped_at, payments_stopped_note, " +
  "organizer:organizers(user_id, kind, legal_name, display_name, verification_status)"

/** Unresolved reports read at once, oldest first. */
export const UNRESOLVED_REPORTS_LIMIT = 200
/** Recently resolved reports read at once, newest decision first. */
export const RESOLVED_REPORTS_LIMIT = 50

export interface CampaignReport {
  id: string
  campaign_id: string
  reason_code: ReportReasonCode
  details: string | null
  status: CampaignReportStatus
  action_taken: CampaignReportActionTaken | null
  resolution_note: string | null
  handled_at: string | null
  created_at: string
  updated_at: string
}

export type ReportedCampaignOrganizer = Pick<
  Organizer,
  "user_id" | "kind" | "legal_name" | "display_name" | "verification_status"
>

export interface ReportedCampaign {
  id: string
  slug: string
  type: CampaignType
  status: CampaignStatus
  title: string
  organizer_id: string
  review_note: string | null
  payments_stopped_at: string | null
  payments_stopped_note: string | null
  organizer: ReportedCampaignOrganizer | null
}

export interface UnresolvedCampaignItem {
  campaign_id: string
  campaign: ReportedCampaign | null
  reports: CampaignReport[]
  open_count: number
  awaiting_count: number
}

export interface ResolvedCampaignItem {
  campaign_id: string
  campaign: ReportedCampaign | null
  reports: CampaignReport[]
  latest: CampaignReport
}

/** Whether `give.moderate_campaign_reports(..., 'suspend', ...)` accepts this campaign's status. */
export function canSuspendReportedCampaign(campaign: Pick<ReportedCampaign, "status">): boolean {
  return campaign.status === "approved" || campaign.status === "live" || campaign.status === "suspended"
}

/** Whether `give.moderate_campaign_reports(..., 'stop_payment_requests', ...)` accepts this campaign. */
export function canStopReportedPaymentRequests(campaign: Pick<ReportedCampaign, "type" | "status">): boolean {
  return campaign.type === "back" && campaign.status === "succeeded"
}

async function loadReportedCampaigns(db: Db, ids: readonly string[]): Promise<Map<string, ReportedCampaign>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const { data, error } = await db.rpc("managed_campaigns", {}).select(MANAGED_REPORT_CAMPAIGN_COLUMNS).in("id", unique)
  if (error) throw error
  return new Map(((data ?? []) as unknown as ReportedCampaign[]).map((c) => [c.id, c]))
}

/**
 * The moderator queue for campaign reports: campaigns with unresolved reports
 * (`open` or `awaiting_organizer`, ordered by the oldest waiting report), and
 * campaigns with recently resolved reports (`actioned` or `dismissed`, newest
 * decision first). Moderator/admin only under RLS.
 */
export async function listCampaignReportQueue(
  db: Db
): Promise<{ unresolved: UnresolvedCampaignItem[]; resolved: ResolvedCampaignItem[] }> {
  const [unresolvedRes, resolvedRes] = await Promise.all([
    db
      .from("campaign_reports")
      .select(CAMPAIGN_REPORT_COLUMNS)
      .in("status", ["open", "awaiting_organizer"])
      .order("created_at", { ascending: true })
      .limit(UNRESOLVED_REPORTS_LIMIT),
    db
      .from("campaign_reports")
      .select(CAMPAIGN_REPORT_COLUMNS)
      .in("status", ["actioned", "dismissed"])
      .order("handled_at", { ascending: false })
      .limit(RESOLVED_REPORTS_LIMIT),
  ])
  if (unresolvedRes.error) throw unresolvedRes.error
  if (resolvedRes.error) throw resolvedRes.error

  const unresolvedRows = (unresolvedRes.data ?? []) as CampaignReport[]
  const resolvedRows = (resolvedRes.data ?? []) as CampaignReport[]

  const unresolvedByCampaign = new Map<string, CampaignReport[]>()
  for (const row of unresolvedRows) {
    unresolvedByCampaign.set(row.campaign_id, [...(unresolvedByCampaign.get(row.campaign_id) ?? []), row])
  }

  const resolvedByCampaign = new Map<string, CampaignReport[]>()
  for (const row of resolvedRows) {
    resolvedByCampaign.set(row.campaign_id, [...(resolvedByCampaign.get(row.campaign_id) ?? []), row])
  }

  const campaigns = await loadReportedCampaigns(db, [...unresolvedByCampaign.keys(), ...resolvedByCampaign.keys()])

  const unresolved: UnresolvedCampaignItem[] = [...unresolvedByCampaign.entries()].map(([campaign_id, reports]) => ({
    campaign_id,
    campaign: campaigns.get(campaign_id) ?? null,
    reports,
    open_count: reports.filter((r) => r.status === "open").length,
    awaiting_count: reports.filter((r) => r.status === "awaiting_organizer").length,
  }))

  const resolved: ResolvedCampaignItem[] = [...resolvedByCampaign.entries()].map(([campaign_id, reports]) => ({
    campaign_id,
    campaign: campaigns.get(campaign_id) ?? null,
    reports,
    latest: reports[0],
  }))

  return { unresolved, resolved }
}

/** A visitor's report on a public campaign (`give.report_campaign`). */
export const reportCampaignSchema = z
  .object({
    reason_code: z.enum(REPORT_REASONS, { message: "Chọn lý do báo cáo." }),
    details: z
      .string()
      .trim()
      .max(REPORT_DETAILS_MAX, `Chi tiết báo cáo tối đa ${REPORT_DETAILS_MAX} ký tự.`)
      .transform((v) => (v === "" ? null : v)),
  })
  .refine((v) => v.reason_code !== "other" || v.details !== null, {
    message: "Ghi chi tiết khi chọn lý do “Lý do khác”.",
    path: ["details"],
  })

/** A moderator's decision on a campaign's unresolved reports (`give.moderate_campaign_reports`). */
export const moderateCampaignReportsSchema = z
  .object({
    action: z.enum(MODERATION_ACTIONS, { message: "Thao tác không hợp lệ." }),
    reason: z
      .string()
      .trim()
      .min(1, "Ghi ghi chú xử lý (câu hỏi gửi người tổ chức, lý do tạm dừng hoặc lý do lưu vào nhật ký kiểm toán).")
      .max(MODERATION_NOTE_MAX, `Ghi chú quá dài (tối đa ${MODERATION_NOTE_MAX} ký tự).`),
    public_note: z
      .string()
      .trim()
      .max(STOP_PUBLIC_NOTE_MAX, `Ghi chú công khai tối đa ${STOP_PUBLIC_NOTE_MAX} ký tự.`)
      .transform((v) => (v === "" ? null : v)),
  })
  .refine((v) => v.action !== "stop_payment_requests" || v.public_note !== null, {
    message: "Ghi chú công khai là bắt buộc khi tạm dừng yêu cầu thanh toán; người ủng hộ và trang dự án sẽ thấy.",
    path: ["public_note"],
  })
  .refine((v) => v.action === "stop_payment_requests" || v.public_note === null, {
    message: "Thao tác không hợp lệ.",
    path: ["public_note"],
  })
