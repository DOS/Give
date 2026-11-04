import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import type { ReactNode } from "react"

import { TypeBadge, VerificationBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { ButtonLink } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { requireSession } from "@/lib/auth/session"
import {
  accountProblemLabel,
  isStaff,
  listOrganizersToVerify,
  listReviewQueue,
  listWaitingForAccount,
  waitingAdvice,
  type CampaignType,
  type WaitingForAccount,
} from "@/lib/campaigns"
import { formatDate, formatVnd } from "@/lib/format"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, Fact, Facts, ItemActions, ItemCard, ItemList } from "./_components/ui"
import { approveCampaign, requestChanges, setVerification } from "./actions"

export const metadata: Metadata = { title: "Kiểm duyệt", robots: { index: false } }

export default async function AdminReviewPage() {
  const session = await requireSession("/admin")
  const db = dbAs(session.accessToken)
  const [moderates, reviewsAccounts] = await Promise.all([isStaff(db), isStaff(db, FINANCE_ROLES)])
  // Finance-only staff work on receiving accounts; everyone else who is not
  // staff gets a plain 404 so the page does not advertise itself.
  if (!moderates) {
    if (reviewsAccounts) redirect("/admin/accounts")
    notFound()
  }

  // Links to the other admin pages are the admin layout's tabs.
  const [queue, waiting, organizers] = await Promise.all([
    listReviewQueue(db),
    // A read error hides only this section, not the review queue.
    listWaitingForAccount(db).catch((e: { code?: string; message?: string } | null): WaitingForAccount[] | null => {
      console.error("campaigns_waiting_for_account failed", e?.code, e?.message)
      return null
    }),
    listOrganizersToVerify(db),
  ])

  return (
    <AdminPage title="Kiểm duyệt">
      <AdminSection id="queue" title="Chiến dịch chờ duyệt" count={queue.length}>
        {queue.length === 0 ? (
          <EmptyState title="Không có chiến dịch nào chờ duyệt.">
            Chiến dịch người tổ chức gửi duyệt sẽ hiện ở đây, gửi sớm nhất ở trên cùng.
          </EmptyState>
        ) : (
          <ItemList>
            {queue.map((campaign) => {
              const own = campaign.organizer_id === session.user.id
              return (
                <ItemCard key={campaign.id}>
                  <CampaignHead
                    campaign={campaign}
                    meta={
                      campaign.category && (
                        <span className="text-sm text-muted">
                          {campaign.category.icon} {campaign.category.name}
                        </span>
                      )
                    }
                  >
                    <p className="mt-1 text-body">{campaign.summary}</p>
                  </CampaignHead>
                  <Facts>
                    <Fact label="Mục tiêu">
                      <span className="font-semibold tabular-nums">{formatVnd(campaign.goal_amount)}</span>
                    </Fact>
                    <Fact label="Thời gian">
                      {campaign.starts_at ? formatDate(campaign.starts_at) : "Khi duyệt"} →{" "}
                      {formatDate(campaign.ends_at)}
                    </Fact>
                    <Fact label="Gửi duyệt">{formatDate(campaign.submitted_at)}</Fact>
                    {campaign.organizer && (
                      <Fact label="Người tổ chức" wide>
                        <span className="flex flex-wrap items-center gap-2">
                          {campaign.organizer.display_name} (tên pháp lý: {campaign.organizer.legal_name},{" "}
                          {campaign.organizer.kind === "organization" ? "tổ chức" : "cá nhân"})
                          <VerificationBadge status={campaign.organizer.verification_status} />
                        </span>
                      </Fact>
                    )}
                    {campaign.type === "give" && (
                      <Fact label="Người thụ hưởng" wide>
                        {campaign.beneficiary_name}
                        {campaign.beneficiary_relation ? ` (${campaign.beneficiary_relation})` : ""}
                      </Fact>
                    )}
                  </Facts>
                  {own ? (
                    <Callout tone="warning">Đây là chiến dịch của bạn; một kiểm duyệt viên khác cần duyệt.</Callout>
                  ) : (
                    <ItemActions>
                      <ActionForm
                        action={approveCampaign.bind(null, campaign.id)}
                        confirm="Duyệt chiến dịch này? Nếu đã tới ngày bắt đầu, chiến dịch sẽ công khai ngay."
                        className="space-y-2"
                      >
                        <p className="label">Duyệt</p>
                        <p className="text-sm text-muted">
                          Nếu đã tới ngày bắt đầu, chiến dịch công khai ngay khi duyệt.
                        </p>
                        <SubmitButton>Duyệt</SubmitButton>
                      </ActionForm>
                      <ActionForm action={requestChanges.bind(null, campaign.id)} resetOnSuccess className="space-y-2">
                        <input type="hidden" name="from_status" value="in_review" />
                        <label htmlFor={`reason-${campaign.id}`} className="label">
                          Yêu cầu chỉnh sửa
                        </label>
                        <textarea
                          id={`reason-${campaign.id}`}
                          name="reason"
                          className="field"
                          rows={2}
                          required
                          maxLength={2000}
                          placeholder="Người tổ chức cần sửa gì?"
                        />
                        <SubmitButton className="btn-secondary">Gửi yêu cầu</SubmitButton>
                      </ActionForm>
                    </ItemActions>
                  )}
                </ItemCard>
              )
            })}
          </ItemList>
        )}
      </AdminSection>

      <AdminSection
        id="waiting"
        title="Đã duyệt, chờ tài khoản nhận"
        count={waiting?.length}
        lead="Chiến dịch (từ thiện hoặc dự án có quà tặng) đã duyệt nhưng tài khoản nhận tiền không còn dùng được, nên hệ thống không tự mở. Chiến dịch tự mở nếu tài khoản dùng được trở lại; nếu không, hãy yêu cầu chỉnh sửa để người tổ chức nhả tài khoản cũ, gắn tài khoản khác rồi gửi duyệt lại."
      >
        {waiting === null ? (
          <Callout tone="danger" title="Chưa tải được danh sách này.">
            Các phần khác của trang vẫn dùng được. Hãy tải lại trang sau.
          </Callout>
        ) : waiting.length === 0 ? (
          <EmptyState title="Không có chiến dịch đã duyệt nào đang chờ tài khoản nhận." />
        ) : (
          <ItemList>
            {waiting.map((campaign) => {
              const own = campaign.organizer_id === session.user.id
              const now = new Date()
              const ended = campaign.ends_at !== null && new Date(campaign.ends_at) <= now
              const due = !campaign.starts_at || new Date(campaign.starts_at) <= now
              const advice = waitingAdvice(campaign, now)
              return (
                <ItemCard key={campaign.id}>
                  <CampaignHead campaign={campaign}>
                    <p className="mt-1 font-medium text-red-700">{accountProblemLabel(campaign.account_problem)}</p>
                  </CampaignHead>
                  <Facts>
                    <Fact label="Ngày bắt đầu">
                      {campaign.starts_at ? formatDate(campaign.starts_at) : "Khi duyệt"}
                      {ended ? " (đã quá ngày kết thúc)" : due ? " (đã tới, đang chờ mở)" : ""}
                    </Fact>
                    <Fact label="Ngày kết thúc">{formatDate(campaign.ends_at)}</Fact>
                    <Fact label="Duyệt lúc">{formatDate(campaign.approved_at)}</Fact>
                    {campaign.organizer && (
                      <Fact label="Người tổ chức" wide>
                        <span className="flex flex-wrap items-center gap-2">
                          {campaign.organizer.display_name} (tên pháp lý: {campaign.organizer.legal_name})
                          <VerificationBadge status={campaign.organizer.verification_status} />
                        </span>
                      </Fact>
                    )}
                  </Facts>
                  {advice.note && <Callout tone="warning">{advice.note}</Callout>}
                  {advice.sendBackReason === null ? null : own ? (
                    <Callout tone="warning">Đây là chiến dịch của bạn; một kiểm duyệt viên khác cần xử lý.</Callout>
                  ) : (
                    <ActionForm
                      action={requestChanges.bind(null, campaign.id)}
                      confirm="Trả chiến dịch đã duyệt về cho người tổ chức chỉnh sửa? Chiến dịch sẽ phải gửi duyệt lại."
                      className="space-y-2 border-t border-line pt-5"
                    >
                      <input type="hidden" name="from_status" value="approved" />
                      <label htmlFor={`waiting-reason-${campaign.id}`} className="label">
                        Yêu cầu chỉnh sửa
                      </label>
                      <textarea
                        id={`waiting-reason-${campaign.id}`}
                        name="reason"
                        className="field max-w-2xl"
                        rows={4}
                        required
                        maxLength={2000}
                        defaultValue={advice.sendBackReason}
                      />
                      <SubmitButton className="btn-secondary">Gửi yêu cầu</SubmitButton>
                    </ActionForm>
                  )}
                </ItemCard>
              )
            })}
          </ItemList>
        )}
      </AdminSection>

      <AdminSection
        id="organizers"
        title="Xác minh người tổ chức"
        count={organizers.length}
        lead="Xác minh khi đã đối chiếu tên pháp lý với giấy tờ hoặc tài khoản ngân hàng. Nếu người tổ chức đổi tên sau khi trang này tải, thao tác sẽ bị từ chối để bạn xem lại."
      >
        {organizers.length === 0 ? (
          <EmptyState title="Không có hồ sơ nào chờ xác minh." />
        ) : (
          <ul className="divide-y divide-line card">
            {organizers.map((organizer) => (
              <li key={organizer.user_id} className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                <div className="min-w-0 flex-1 basis-60 text-sm">
                  <p className="text-base font-semibold text-ink">{organizer.display_name}</p>
                  <p className="text-body">
                    Tên pháp lý: {organizer.legal_name} · {organizer.kind === "organization" ? "Tổ chức" : "Cá nhân"}
                    {organizer.phone ? ` · ${organizer.phone}` : ""}
                  </p>
                  <p className="mt-1">
                    <VerificationBadge status={organizer.verification_status} />
                  </p>
                </div>
                {organizer.user_id !== session.user.id && (
                  <div className="flex flex-wrap gap-2">
                    {(["verified", "rejected"] as const).map((status) => (
                      <ActionForm key={status} action={setVerification.bind(null, organizer.user_id)}>
                        <input type="hidden" name="status" value={status} />
                        <input type="hidden" name="expected_legal_name" value={organizer.legal_name} />
                        <input type="hidden" name="expected_display_name" value={organizer.display_name} />
                        <input type="hidden" name="expected_kind" value={organizer.kind} />
                        <SubmitButton className={status === "verified" ? "btn-primary" : "btn-danger"}>
                          {status === "verified" ? "Xác minh" : "Từ chối"}
                        </SubmitButton>
                      </ActionForm>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </AdminPage>
  )
}

/** A campaign's type, title and a line under it, with a preview link on the right. */
function CampaignHead({
  campaign,
  meta,
  children,
}: {
  campaign: { type: CampaignType; title: string; slug: string }
  meta?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={campaign.type} />
          {meta}
        </div>
        <h3 className="mt-2 text-lg font-semibold">{campaign.title}</h3>
        {children}
      </div>
      <ButtonLink href={`/campaigns/${campaign.slug}`} variant="secondary" target="_blank">
        Xem trước<span className="sr-only"> (mở thẻ mới)</span>
      </ButtonLink>
    </div>
  )
}
