import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
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
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div>
        <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">
          ← Kiểm duyệt
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Yêu cầu thanh toán của dự án ủng hộ</h1>
        <p className="mt-2 text-sm text-gray-600">
          Dự án ủng hộ đạt mục tiêu thì người ủng hộ được yêu cầu chuyển tiền thẳng vào tài khoản của người tạo dự án.
          Khi nghi gian lận, hãy tạm dừng yêu cầu thanh toán: Give ngừng nhắc thanh toán, ẩn thông tin chuyển khoản, báo
          cho người ủng hộ đang chờ thanh toán và người tạo dự án, và trang dự án hiện ghi chú công khai. Lý do nội bộ
          chỉ lưu vào nhật ký kiểm toán. Hạn thanh toán vẫn chạy: cam kết chưa trả đủ khi hết hạn sẽ hết hiệu lực, phần
          đã chuyển được ghi là tiền phải hoàn. Tiền vẫn chuyển tới được ghi nhận như thường.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <p className="card p-6 text-gray-600">Chưa có dự án ủng hộ nào đạt mục tiêu.</p>
      ) : (
        <ul className="space-y-4">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </ul>
      )}
    </div>
  )
}

function CampaignCard({ campaign }: { campaign: SucceededBackCampaign }) {
  const stopped = !!campaign.payments_stopped_at
  return (
    <li className="space-y-4 card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{campaign.title}</h2>
          <p className="text-sm text-gray-600">Đạt mục tiêu {formatDate(campaign.outcome_at)}</p>
        </div>
        <Link href={`/campaigns/${campaign.slug}`} className="btn-secondary" target="_blank">
          Xem dự án
        </Link>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-gray-500">Cam kết</dt>
          <dd>{formatVnd(campaign.pledged_amount)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Đã thanh toán</dt>
          <dd>{formatVnd(campaign.paid_amount)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Hoàn tiền còn nợ</dt>
          <dd>{formatVnd(campaign.refund_owed_amount)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Người đồng hành</dt>
          <dd>{campaign.backers_count}</dd>
        </div>
      </dl>

      {stopped ? (
        <>
          <div className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
            <p className="font-semibold">
              Đã tạm dừng yêu cầu thanh toán từ {formatDateTime(campaign.payments_stopped_at)}.
            </p>
            {campaign.payments_stopped_note && (
              <p className="whitespace-pre-line">Ghi chú công khai: {campaign.payments_stopped_note}</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ActionForm
              action={setPaymentRequestsStopped.bind(null, campaign.id)}
              confirm="Mở lại yêu cầu thanh toán? Trang thanh toán hiện lại và người ủng hộ đang chờ thanh toán được báo."
              className="space-y-2"
            >
              <input type="hidden" name="action" value="resume" />
              <label htmlFor={`resume-reason-${campaign.id}`} className="label">
                Lý do mở lại (nội bộ)
              </label>
              <textarea
                id={`resume-reason-${campaign.id}`}
                name="reason"
                className="field"
                rows={2}
                required
                maxLength={STOP_REASON_MAX}
              />
              <SubmitButton>Mở lại yêu cầu thanh toán</SubmitButton>
            </ActionForm>
            <StopForm campaign={campaign} />
          </div>
        </>
      ) : (
        <StopForm campaign={campaign} />
      )}
    </li>
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
      className="space-y-2"
    >
      <input type="hidden" name="action" value="stop" />
      <label htmlFor={`stop-reason-${campaign.id}`} className="label">
        {stopped ? "Lý do đổi ghi chú (nội bộ)" : "Lý do tạm dừng (nội bộ, ghi vào nhật ký kiểm toán)"}
      </label>
      <textarea
        id={`stop-reason-${campaign.id}`}
        name="reason"
        className="field"
        rows={2}
        required
        maxLength={STOP_REASON_MAX}
        placeholder={stopped ? undefined : "Ví dụ: báo cáo gian lận, đã đối chiếu bằng chứng."}
      />
      <label htmlFor={`stop-note-${campaign.id}`} className="label">
        Ghi chú công khai (người ủng hộ và trang dự án thấy)
      </label>
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
      <SubmitButton className={stopped ? "btn-secondary" : "btn-secondary text-red-700"}>
        {stopped ? "Đổi ghi chú công khai" : "Tạm dừng yêu cầu thanh toán"}
      </SubmitButton>
    </ActionForm>
  )
}
