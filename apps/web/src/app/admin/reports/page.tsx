import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import type { ReactNode } from "react"

import { StatusBadge, TypeBadge, VerificationBadge } from "@/components/badges"
import {
  listStatusEventsByCampaign,
  StatusHistory,
  type CampaignStatusEvent,
} from "@/components/campaign/StatusHistory"
import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge, type BadgeTone } from "@/components/ui/Badge"
import { ButtonLink } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { Field } from "@/components/ui/Field"
import { MachineId } from "@/components/ui/RefCode"
import { requireSession } from "@/lib/auth/session"
import {
  canStopReportedPaymentRequests,
  canSuspendReportedCampaign,
  listCampaignReportQueue,
  MODERATION_NOTE_MAX,
  parseReportsPage,
  REPORT_ACTION_LABELS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  reportsPageHref,
  RESOLVED_REPORTS_LIMIT,
  type CampaignReportActionTaken,
  type ReportedCampaign,
  type ResolvedCampaignItem,
  type UnresolvedCampaignItem,
} from "@/lib/campaign-reports"
import { isStaff } from "@/lib/campaigns"
import { MODERATION_ROLES } from "@/lib/evidence-moderation"
import { formatDateTime } from "@/lib/format"
import { STOP_PUBLIC_NOTE_MAX } from "@/lib/payment-requests"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, Fact, Facts, ItemActions, ItemCard, ItemList } from "../_components/ui"
import { moderateCampaignReports } from "./actions"

export const metadata: Metadata = { title: "Báo cáo chiến dịch", robots: { index: false } }

const ACTION_TONES: Record<CampaignReportActionTaken, BadgeTone> = {
  asked_organizer: "warning",
  dismissed: "neutral",
  suspended: "danger",
  stopped_payment_requests: "danger",
}

/**
 * Moderator queue for reported public campaigns (DOS/Give#98): unresolved
 * reports grouped by campaign (campaigns with new `open` reports first, oldest
 * first, then campaigns awaiting the organizer's reply; paginated), plus
 * campaigns whose reports were recently handled. Moderator/admin staff only;
 * everyone else gets a 404.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
} = {}) {
  const params = searchParams ? await searchParams : {}
  const requestedPage = parseReportsPage(params)
  const session = await requireSession(reportsPageHref(requestedPage))
  const db = dbAs(session.accessToken)
  if (!(await isStaff(db, MODERATION_ROLES))) notFound()

  const { unresolved, totalUnresolvedCampaigns, page, totalPages, resolved } = await listCampaignReportQueue(
    db,
    requestedPage
  )
  if (requestedPage > totalPages) redirect(reportsPageHref(totalPages))

  const statusEventsByCampaign = await listStatusEventsByCampaign(
    db,
    unresolved.map((item) => item.campaign_id)
  ).catch(() => new Map<string, CampaignStatusEvent[]>())

  const resolvedTotal = resolved.reduce((sum, item) => sum + item.reports.length, 0)

  return (
    <AdminPage
      title="Báo cáo chiến dịch"
      intro={
        <p>
          Người dùng đã đăng nhập báo cáo chiến dịch công khai có dấu hiệu vi phạm. Một quyết định áp dụng cho toàn bộ
          báo cáo chưa chốt của chiến dịch đó: hỏi người tổ chức (người tổ chức chỉ nhận câu hỏi của bạn trong mục Thông
          báo, không biết ai báo cáo hay nội dung gốc người báo cáo viết), bác bỏ nếu không có vi phạm, tạm dừng chiến
          dịch đang gây quỹ, hoặc tạm dừng yêu cầu thanh toán của dự án có quà tặng đã đạt mục tiêu. Mọi quyết định đều
          ghi vào nhật ký kiểm toán.
        </p>
      }
    >
      <AdminSection id="unresolved" title="Chờ xử lý" count={totalUnresolvedCampaigns}>
        {unresolved.length === 0 ? (
          <EmptyState title="Không có báo cáo chiến dịch nào chờ xử lý.">
            Chiến dịch bị người xem báo cáo sẽ hiện ở đây, ưu tiên các báo cáo mới gửi sớm nhất ở trên cùng.
          </EmptyState>
        ) : (
          <>
            <ItemList>
              {unresolved.map((item) => (
                <UnresolvedCampaignCard
                  key={item.campaign_id}
                  item={item}
                  selfId={session.user.id}
                  statusEvents={statusEventsByCampaign.get(item.campaign_id) ?? []}
                />
              ))}
            </ItemList>
            {totalPages > 1 && (
              <nav
                aria-label="Phân trang báo cáo chờ xử lý"
                className="flex flex-wrap items-center justify-between gap-4"
              >
                <p className="text-sm text-muted">
                  Trang {page} / {totalPages} ({totalUnresolvedCampaigns} chiến dịch)
                </p>
                <div className="flex flex-wrap gap-2">
                  {page > 1 && (
                    <ButtonLink href={reportsPageHref(page - 1)} variant="secondary">
                      Trang trước
                    </ButtonLink>
                  )}
                  {page < totalPages && (
                    <ButtonLink href={reportsPageHref(page + 1)} variant="secondary">
                      Trang sau
                    </ButtonLink>
                  )}
                </div>
              </nav>
            )}
          </>
        )}
      </AdminSection>

      <AdminSection
        id="resolved"
        title="Đã xử lý gần đây"
        count={resolvedTotal < RESOLVED_REPORTS_LIMIT ? resolved.length : `${resolved.length} chiến dịch gần nhất`}
      >
        {resolved.length === 0 ? (
          <EmptyState title="Chưa có báo cáo chiến dịch nào được xử lý." />
        ) : (
          <ItemList>
            {resolved.map((item) => (
              <ResolvedCampaignCard key={item.campaign_id} item={item} />
            ))}
          </ItemList>
        )}
      </AdminSection>
    </AdminPage>
  )
}

function CampaignHeading({
  campaign,
  fallbackId,
  extraBadges,
}: {
  campaign: ReportedCampaign | null
  fallbackId: string
  extraBadges?: ReactNode
}) {
  const hasBadges = Boolean(campaign || extraBadges)
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 basis-64">
        {hasBadges && (
          <div className="flex flex-wrap items-center gap-2">
            {campaign && (
              <>
                <TypeBadge type={campaign.type} />
                <StatusBadge status={campaign.status} />
                {campaign.payments_stopped_at && <Badge tone="danger">Đã tạm dừng thanh toán</Badge>}
              </>
            )}
            {extraBadges}
          </div>
        )}
        <h3 className="mt-2 text-h3 break-words">{campaign ? campaign.title : <MachineId>{fallbackId}</MachineId>}</h3>
      </div>
      {campaign && (
        <ButtonLink href={`/campaigns/${campaign.slug}`} variant="secondary" target="_blank">
          Xem chiến dịch<span className="sr-only">: {campaign.title} (mở thẻ mới)</span>
        </ButtonLink>
      )}
    </div>
  )
}

function UnresolvedCampaignCard({
  item,
  selfId,
  statusEvents,
}: {
  item: UnresolvedCampaignItem
  selfId: string
  statusEvents: readonly CampaignStatusEvent[]
}) {
  const { campaign, reports, open_count, awaiting_count } = item
  const organizer = campaign?.organizer ?? null
  const own = campaign?.organizer_id === selfId
  const canSuspend = campaign !== null && canSuspendReportedCampaign(campaign)
  const canStopPayments = campaign !== null && canStopReportedPaymentRequests(campaign)
  const hasEnforcementForm = canSuspend || canStopPayments

  const countsText = [
    open_count > 0 ? `${open_count} chờ xem xét` : null,
    awaiting_count > 0 ? `${awaiting_count} chờ người tổ chức phản hồi` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const noteHintId = `note-hint-${item.campaign_id}`
  const inquiryAndDismissForm = (
    <ActionForm action={moderateCampaignReports.bind(null, item.campaign_id)} className="space-y-6" resetOnSuccess>
      <Field
        htmlFor={`note-${item.campaign_id}`}
        hintId={noteHintId}
        label={open_count > 0 ? "Câu hỏi gửi người tổ chức hoặc lý do bác bỏ" : "Lý do bác bỏ (lưu nhật ký kiểm toán)"}
        hint={
          open_count > 0
            ? "Người tổ chức chỉ nhận câu hỏi của bạn, không biết ai báo cáo hay nội dung người báo cáo viết."
            : "Tất cả báo cáo đang mở đều đã được gửi câu hỏi cho người tổ chức."
        }
      >
        <textarea
          id={`note-${item.campaign_id}`}
          aria-describedby={noteHintId}
          name="reason"
          rows={2}
          required
          maxLength={MODERATION_NOTE_MAX}
          placeholder={
            open_count > 0
              ? "Ví dụ: Đề nghị bổ sung giấy xác nhận của bệnh viện trước ngày…"
              : "Ví dụ: Người tổ chức đã bổ sung chứng từ hợp lệ."
          }
          className="field"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {open_count > 0 && (
          <SubmitButton name="action" value="ask_organizer" className="btn-primary">
            Hỏi người tổ chức
          </SubmitButton>
        )}
        <SubmitButton name="action" value="dismiss" className="btn-secondary">
          Bác bỏ báo cáo
        </SubmitButton>
      </div>
    </ActionForm>
  )

  return (
    <ItemCard>
      <CampaignHeading campaign={campaign} fallbackId={item.campaign_id} />

      <Facts columns={3}>
        <Fact label="Báo cáo chưa chốt">{countsText}</Fact>
        <Fact label="Báo cáo sớm nhất">{formatDateTime(reports[0].created_at)}</Fact>
        <Fact label="Người tổ chức">
          {organizer ? (
            <span className="flex flex-wrap items-center gap-2">
              {organizer.display_name} ({organizer.legal_name},{" "}
              {organizer.kind === "organization" ? "tổ chức" : "cá nhân"})
              <VerificationBadge status={organizer.verification_status} />
            </span>
          ) : (
            "—"
          )}
        </Fact>
      </Facts>

      {campaign?.status === "suspended" && (
        <Callout tone="danger">
          <p className="max-w-[68ch] break-words whitespace-pre-line">
            Chiến dịch này đã ở trạng thái tạm dừng{campaign.review_note ? `: ${campaign.review_note}` : "."}
          </p>
        </Callout>
      )}
      {campaign?.payments_stopped_at && (
        <Callout
          tone="danger"
          title={`Đã tạm dừng yêu cầu thanh toán từ ${formatDateTime(campaign.payments_stopped_at)}.`}
        >
          {campaign.payments_stopped_note && (
            <p className="max-w-[68ch] break-words whitespace-pre-line">
              Ghi chú công khai: {campaign.payments_stopped_note}
            </p>
          )}
        </Callout>
      )}

      <div>
        <p className="font-semibold text-fg">Nội dung báo cáo ({reports.length})</p>
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {reports.map((report) => (
            <li key={report.id} className="space-y-1 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-fg">
                  {REPORT_REASON_LABELS[report.reason_code] ?? report.reason_code}
                </span>
                <Badge tone={report.status === "awaiting_organizer" ? "warning" : "info"}>
                  {REPORT_STATUS_LABELS[report.status]}
                </Badge>
                <span className="text-muted">{formatDateTime(report.created_at)}</span>
              </div>
              <p className="max-w-[68ch] break-words whitespace-pre-line text-fg">
                {report.details ?? <span className="text-muted">(không ghi chi tiết)</span>}
              </p>
              {report.status === "awaiting_organizer" && report.resolution_note && (
                <p className="max-w-[68ch] text-sm break-words whitespace-pre-line text-muted">
                  Đã hỏi người tổ chức ({formatDateTime(report.handled_at)}): {report.resolution_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      <StatusHistory events={statusEvents} campaignTitle={campaign?.title ?? item.campaign_id} />

      {own ? (
        <Callout tone="warning">Đây là chiến dịch của bạn; một kiểm duyệt viên khác cần xử lý các báo cáo này.</Callout>
      ) : hasEnforcementForm && campaign ? (
        <ItemActions>
          {inquiryAndDismissForm}
          {canSuspend ? <SuspendForm campaign={campaign} /> : <StopPaymentRequestsForm campaign={campaign} />}
        </ItemActions>
      ) : (
        <div className="space-y-4 border-t border-border pt-6">
          <div className="max-w-160">{inquiryAndDismissForm}</div>
          {campaign && (
            <p className="max-w-[68ch] text-sm text-muted">
              Chiến dịch đã kết thúc gây quỹ nên không còn tạm dừng được; bạn vẫn có thể hỏi người tổ chức hoặc bác bỏ
              báo cáo.
            </p>
          )}
        </div>
      )}
    </ItemCard>
  )
}

function SuspendForm({ campaign }: { campaign: ReportedCampaign }) {
  const alreadySuspended = campaign.status === "suspended"
  return (
    <ActionForm
      action={moderateCampaignReports.bind(null, campaign.id)}
      confirm={
        alreadySuspended
          ? undefined
          : "Tạm dừng chiến dịch này? Chiến dịch sẽ ẩn khỏi trang công khai ngay và các báo cáo đang mở được đánh dấu đã xử lý."
      }
      className="space-y-6"
    >
      <input type="hidden" name="action" value="suspend" />
      <Field
        htmlFor={`suspend-reason-${campaign.id}`}
        label={
          alreadySuspended
            ? "Ghi chú chốt báo cáo theo trạng thái tạm dừng"
            : "Lý do tạm dừng (người tổ chức thấy trên trang quản lý)"
        }
      >
        <textarea
          id={`suspend-reason-${campaign.id}`}
          name="reason"
          rows={2}
          required
          maxLength={MODERATION_NOTE_MAX}
          placeholder="Ví dụ: Chưa đối chiếu được giấy tờ xác nhận của đơn vị thụ hưởng."
          className="field"
        />
      </Field>
      <SubmitButton className={alreadySuspended ? "btn-secondary" : "btn-danger"}>
        {alreadySuspended ? "Chốt theo trạng thái tạm dừng" : "Tạm dừng chiến dịch"}
      </SubmitButton>
    </ActionForm>
  )
}

function StopPaymentRequestsForm({ campaign }: { campaign: ReportedCampaign }) {
  const stopped = !!campaign.payments_stopped_at
  return (
    <ActionForm
      action={moderateCampaignReports.bind(null, campaign.id)}
      confirm={
        stopped
          ? "Cập nhật ghi chú công khai của lần tạm dừng này và chốt các báo cáo đang mở?"
          : "Tạm dừng yêu cầu thanh toán của dự án này? Người ủng hộ đang chờ thanh toán và người tạo dự án sẽ được báo, trang dự án hiện ghi chú công khai."
      }
      className="space-y-6"
    >
      <input type="hidden" name="action" value="stop_payment_requests" />
      <Field htmlFor={`stop-reason-${campaign.id}`} label="Lý do tạm dừng (nội bộ, ghi vào nhật ký kiểm toán)">
        <textarea
          id={`stop-reason-${campaign.id}`}
          name="reason"
          rows={2}
          required
          maxLength={MODERATION_NOTE_MAX}
          placeholder="Ví dụ: Có báo cáo gian lận, đang đối chiếu bằng chứng với người tạo dự án."
          className="field"
        />
      </Field>
      <Field htmlFor={`stop-note-${campaign.id}`} label="Ghi chú công khai (người ủng hộ và trang dự án thấy)">
        <textarea
          id={`stop-note-${campaign.id}`}
          name="public_note"
          rows={2}
          required
          maxLength={STOP_PUBLIC_NOTE_MAX}
          defaultValue={campaign.payments_stopped_note ?? ""}
          placeholder="Ví dụ: Give đang xác minh dự án này. Đừng chuyển tiền cho tới khi có thông báo mới."
          className="field"
        />
      </Field>
      <SubmitButton className="btn-danger">
        {stopped ? "Cập nhật tạm dừng thanh toán" : "Tạm dừng yêu cầu thanh toán"}
      </SubmitButton>
    </ActionForm>
  )
}

function ResolvedCampaignCard({ item }: { item: ResolvedCampaignItem }) {
  const { campaign, latest, reports } = item
  const action = latest.action_taken
  return (
    <ItemCard>
      <CampaignHeading
        campaign={campaign}
        fallbackId={item.campaign_id}
        extraBadges={action ? <Badge tone={ACTION_TONES[action]}>{REPORT_ACTION_LABELS[action]}</Badge> : undefined}
      />
      <Facts columns={2}>
        <Fact label="Xử lý gần nhất">{formatDateTime(latest.handled_at)}</Fact>
        <Fact label="Số báo cáo đã chốt (trong 50 gần nhất)">{reports.length}</Fact>
        {latest.resolution_note && (
          <Fact label="Ghi chú kiểm duyệt" wide>
            <p className="max-w-[68ch] break-words whitespace-pre-line">{latest.resolution_note}</p>
          </Fact>
        )}
      </Facts>
    </ItemCard>
  )
}
