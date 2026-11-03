import { formatDateTime, formatVnd } from "@/lib/format"
import type { MoneyTotals } from "@/lib/statement"

/**
 * The public figures of a back campaign side by side (section 4.2 step 6):
 * "Cam kết X / Đã thanh toán Y / Mục tiêu Z", and what the creator still owes
 * backers in refunds until it is refunded (step 5). Straight from
 * give.public_campaigns. "Đã thanh toán" leaves out money finance explained
 * as not from backers (other_in: an organizer top-up, interest), as
 * raisedAmount does for give campaigns, so a top-up cannot make the project
 * look paid. When a moderator stopped the payment requests after success
 * (DOS/Give#89), the public notice comes first, with the moderator's note.
 */
export function PledgeTotals({ totals }: { totals: MoneyTotals }) {
  return (
    <div className="space-y-3">
      {totals.payments_stopped_at && (
        <div className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900" data-notice="payments_stopped">
          <p className="font-semibold">
            Give đã tạm dừng yêu cầu thanh toán của dự án này từ {formatDateTime(totals.payments_stopped_at)}.
          </p>
          {totals.payments_stopped_note && <p className="whitespace-pre-line">{totals.payments_stopped_note}</p>}
          <p>Người ủng hộ đừng chuyển thêm tiền cho tới khi Give thông báo tiếp.</p>
        </div>
      )}
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-gray-500">Cam kết</dt>
          <dd className="font-bold tabular-nums" data-figure="pledged">
            {formatVnd(totals.pledged_amount)}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Đã thanh toán</dt>
          <dd className="font-bold tabular-nums" data-figure="paid">
            {formatVnd(Math.max(0, totals.paid_amount - totals.other_in_amount))}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Mục tiêu</dt>
          <dd className="font-bold tabular-nums" data-figure="goal">
            {formatVnd(totals.goal_amount)}
          </dd>
        </div>
      </dl>
      {totals.refund_owed_amount > 0 && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900" data-figure="refund_owed">
          Hoàn tiền còn nợ người ủng hộ: <span className="font-semibold">{formatVnd(totals.refund_owed_amount)}</span>.
          Người tạo dự án phải hoàn lại tiền đã nhận của những cam kết không còn hiệu lực (chưa thanh toán đủ trước hạn)
          và phần chuyển thừa.
        </p>
      )}
    </div>
  )
}
