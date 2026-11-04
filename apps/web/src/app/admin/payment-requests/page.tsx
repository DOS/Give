import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { Field } from "@/components/ui/Field"
import { Callout } from "@/components/ui/Callout"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import {
  listSucceededBackCampaigns,
  STOP_PUBLIC_NOTE_MAX,
  STOP_REASON_MAX,
  type SucceededBackCampaign,
} from "@/lib/payment-requests"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, Fact, Facts, ItemActions, ItemCard, ItemList } from "../_components/ui"
import { setPaymentRequestsStopped } from "./actions"

export const metadata: Metadata = { title: "Yêu cầu thanh toán", robots: { index: false } }

/**
 * Moderators stop the payment requests of a back campaign that reached its
 * goal when fraud is suspected, and resume them once it is cleared
 * (DOS/Give#89). The list is public data (give.public_campaigns); the database
 * function checks the role again and refuses the moderator's own campaign.
 */
export default async function AdminPaymentRequestsPage() {
  const session = await requireSession("/admin/payment-requests")
  const db = dbAs(session.accessToken)
  if (!(await isStaff(db))) notFound()

  const campaigns = await listSucceededBackCampaigns(db)

  return (
    <AdminPage
      title="Yêu cầu thanh toán của dự án ủng hộ"
      intro={
        <p>
          Dự án ủng hộ đạt mục tiêu thì người ủng hộ được yêu cầu chuyển tiền thẳng vào tài khoản của người tạo dự án.
          Khi nghi gian lận, hãy tạm dừng yêu cầu thanh toán: Give ngừng nhắc thanh toán, ẩn thông tin chuyển khoản, báo
          cho người ủng hộ đang chờ thanh toán và người tạo dự án, và trang dự án hiện ghi chú công khai. Lý do nội bộ
          chỉ lưu vào nhật ký kiểm toán. Trong lúc tạm dừng không cam kết nào hết hạn; khi mở lại, hạn thanh toán và
          ngày nhắc của các cam kết đang chờ được lùi thêm đúng thời gian đã tạm dừng. Tiền vẫn chuyển tới được ghi nhận
          như thường. Đổi ghi chú của một lần tạm dừng chỉ đổi trang dự án; thông báo đã gửi giữ ghi chú cũ.
        </p>
      }
    >
      <AdminSection id="campaigns" title="Dự án đã đạt mục tiêu" count={campaigns.length}>
        {campaigns.length === 0 ? (
          <EmptyState title="Chưa có dự án ủng hộ nào đạt mục tiêu.">
            Dự án đạt mục tiêu sẽ hiện ở đây để tạm dừng yêu cầu thanh toán khi cần.
          </EmptyState>
        ) : (
          <ItemList>
            {campaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </ItemList>
        )}
      </AdminSection>
    </AdminPage>
  )
}

function CampaignCard({ campaign }: { campaign: SucceededBackCampaign }) {
  const stopped = !!campaign.payments_stopped_at
  return (
    <ItemCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {campaign.title}
            {stopped && <Badge tone="danger">Đã tạm dừng</Badge>}
          </h3>
          <p className="text-sm text-muted">Đạt mục tiêu {formatDate(campaign.outcome_at)}</p>
        </div>
        <ButtonLink href={`/campaigns/${campaign.slug}`} variant="secondary" target="_blank">
          Xem dự án<span className="sr-only"> (mở thẻ mới)</span>
        </ButtonLink>
      </div>
      <Facts columns={4}>
        <Fact label="Cam kết">
          <span className="figure">{formatVnd(campaign.pledged_amount)}</span>
        </Fact>
        <Fact label="Đã thanh toán">
          <span className="figure">{formatVnd(campaign.paid_amount)}</span>
        </Fact>
        <Fact label="Hoàn tiền còn nợ">
          <span className="figure">{formatVnd(campaign.refund_owed_amount)}</span>
        </Fact>
        <Fact label="Người đồng hành">
          <span className="figure">{campaign.backers_count}</span>
        </Fact>
      </Facts>

      {stopped ? (
        <>
          <Callout
            tone="danger"
            title={`Đã tạm dừng yêu cầu thanh toán từ ${formatDateTime(campaign.payments_stopped_at)}.`}
          >
            {campaign.payments_stopped_note && (
              <p className="whitespace-pre-line">Ghi chú công khai: {campaign.payments_stopped_note}</p>
            )}
          </Callout>
          <ItemActions>
            <ActionForm
              action={setPaymentRequestsStopped.bind(null, campaign.id)}
              confirm="Mở lại yêu cầu thanh toán? Trang thanh toán hiện lại và người ủng hộ đang chờ thanh toán được báo."
              className="space-y-3"
            >
              <input type="hidden" name="action" value="resume" />
              <Field htmlFor={`resume-reason-${campaign.id}`} label="Lý do mở lại (nội bộ)">
                <textarea
                  id={`resume-reason-${campaign.id}`}
                  name="reason"
                  className="field"
                  rows={2}
                  required
                  maxLength={STOP_REASON_MAX}
                />
              </Field>
              <SubmitButton>Mở lại yêu cầu thanh toán</SubmitButton>
            </ActionForm>
            <StopForm campaign={campaign} />
          </ItemActions>
        </>
      ) : (
        <div className="border-t border-line pt-5">
          <div className="max-w-2xl">
            <StopForm campaign={campaign} />
          </div>
        </div>
      )}
    </ItemCard>
  )
}

/** Stops the payment requests, or changes the public note of a stop (no new notices then). */
function StopForm({ campaign }: { campaign: SucceededBackCampaign }) {
  const stopped = !!campaign.payments_stopped_at
  return (
    <ActionForm
      action={setPaymentRequestsStopped.bind(null, campaign.id)}
      confirm={
        stopped
          ? "Đổi ghi chú công khai của lần tạm dừng này?"
          : "Tạm dừng yêu cầu thanh toán của dự án này? Người ủng hộ đang chờ thanh toán và người tạo dự án sẽ được báo, trang dự án hiện ghi chú công khai."
      }
      className="space-y-3"
    >
      <input type="hidden" name="action" value="stop" />
      <Field
        htmlFor={`stop-reason-${campaign.id}`}
        label={stopped ? "Lý do đổi ghi chú (nội bộ)" : "Lý do tạm dừng (nội bộ, ghi vào nhật ký kiểm toán)"}
      >
        <textarea
          id={`stop-reason-${campaign.id}`}
          name="reason"
          className="field"
          rows={2}
          required
          maxLength={STOP_REASON_MAX}
          placeholder={stopped ? undefined : "Ví dụ: báo cáo gian lận, đã đối chiếu bằng chứng."}
        />
      </Field>
      <Field htmlFor={`stop-note-${campaign.id}`} label="Ghi chú công khai (người ủng hộ và trang dự án thấy)">
        <textarea
          id={`stop-note-${campaign.id}`}
          name="public_note"
          className="field"
          rows={2}
          required
          maxLength={STOP_PUBLIC_NOTE_MAX}
          defaultValue={campaign.payments_stopped_note ?? ""}
          placeholder="Ví dụ: Give đang xác minh dự án này. Đừng chuyển tiền cho tới khi có thông báo mới."
        />
      </Field>
      <SubmitButton className={stopped ? "btn-secondary" : "btn-danger"}>
        {stopped ? "Đổi ghi chú công khai" : "Tạm dừng yêu cầu thanh toán"}
      </SubmitButton>
    </ActionForm>
  )
}
