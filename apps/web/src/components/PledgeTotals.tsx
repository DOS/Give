import { SummaryCells } from "@/components/campaign/SummaryCells"
import { Callout } from "@/components/ui/Callout"
import { formatDateTime, formatVnd } from "@/lib/format"
import type { MoneyTotals } from "@/lib/statement"

/**
 * The public figures of a back campaign side by side (section 4.2 step 6):
 * "Cam kết X / Đã thanh toán Y / Mục tiêu Z / Còn thiếu", and what the
 * creator still owes backers in refunds until it is refunded (step 5).
 * Straight from give.public_campaigns. "Đã thanh toán" leaves out money
 * finance explained as not from backers (other_in: an organizer top-up,
 * interest), as raisedAmount does for give campaigns, so a top-up cannot make
 * the project look paid. When a moderator stopped the payment requests after
 * success (DOS/Give#89), the public notice comes first, with the moderator's
 * note.
 */
export function PledgeTotals({ totals }: { totals: MoneyTotals }) {
  return (
    <div className="space-y-4">
      {totals.payments_stopped_at && (
        <div data-notice="payments_stopped" role="note">
          <Callout
            tone="danger"
            title={`Give đã tạm dừng yêu cầu thanh toán của dự án này từ ${formatDateTime(totals.payments_stopped_at)}.`}
          >
            {totals.payments_stopped_note && <p className="whitespace-pre-line">{totals.payments_stopped_note}</p>}
            <p>Người ủng hộ đừng chuyển thêm tiền cho tới khi Give thông báo tiếp.</p>
          </Callout>
        </div>
      )}
      <SummaryCells
        label="Số liệu cam kết"
        cells={[
          { label: "Đã cam kết", amount: totals.pledged_amount, figure: "pledged" },
          { label: "Đã thanh toán", amount: Math.max(0, totals.paid_amount - totals.other_in_amount), figure: "paid" },
          { label: "Mục tiêu", amount: totals.goal_amount, figure: "goal" },
          {
            label: "Còn thiếu",
            amount: Math.max(0, totals.goal_amount - totals.pledged_amount),
            figure: "missing",
            tone: "accent",
          },
        ]}
      />
      {totals.refund_owed_amount > 0 && (
        <Callout tone="danger">
          <p data-figure="refund_owed">
            Hoàn tiền còn nợ người ủng hộ: <span className="font-semibold">{formatVnd(totals.refund_owed_amount)}</span>
            . Người tạo dự án phải hoàn lại tiền đã nhận của những cam kết không còn hiệu lực (chưa thanh toán đủ trước
            hạn) và phần chuyển thừa.
          </p>
        </Callout>
      )}
    </div>
  )
}
