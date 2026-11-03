import Link from "next/link"

import { ActionForm, SubmitButton } from "@/components/forms"
import type { CampaignStatus } from "@/lib/campaigns"
import { formatVnd } from "@/lib/format"
import {
  canEditTiers,
  canRetireTier,
  deliveryMonthInput,
  deliveryMonthLabel,
  MAX_TIERS,
  minAmountLabel,
  quantityLabel,
  RETIRABLE_STATUSES,
  sortTiers,
  type RewardTier,
} from "@/lib/reward-tiers"

import { deleteRewardTier, moveRewardTier, retireRewardTier, saveRewardTier } from "../reward-actions"

/**
 * The reward tiers of a back campaign in its editor (DOS/Give#83): add, edit,
 * reorder and delete while draft or changes_requested; afterwards read-only,
 * with "Ngừng nhận" for a tier nobody pledged to until the campaign ends.
 */
export function RewardTiersSection({
  campaignId,
  status,
  minContribution,
  tiers,
}: {
  campaignId: string
  status: CampaignStatus
  minContribution: number
  /** null when the tiers could not be read. */
  tiers: RewardTier[] | null
}) {
  const editable = canEditTiers(status)
  const ordered = tiers ? sortTiers(tiers) : []

  return (
    <section id="reward-tiers" className="space-y-4 card p-6">
      <div>
        <h2 className="text-lg font-semibold">Phần thưởng</h2>
        <p className="text-sm text-gray-600">
          Mỗi mức có số tiền tối thiểu (không thấp hơn mức góp tối thiểu {formatVnd(minContribution)}), có thể giới hạn
          số suất. Người ủng hộ chọn một mức khi cam kết.{" "}
          {editable
            ? "Bạn chỉ thêm, sửa, xóa hay sắp xếp được khi dự án là bản nháp hoặc cần chỉnh sửa; sau khi gửi duyệt, các mức được giữ nguyên."
            : RETIRABLE_STATUSES.includes(status)
              ? "Dự án đã gửi duyệt nên các mức không sửa được nữa. Bạn vẫn có thể ngừng nhận một mức chưa có ai cam kết."
              : "Các mức không sửa được ở trạng thái này."}
        </p>
      </div>

      {!tiers ? (
        <p className="text-sm text-red-700">Không tải được các mức phần thưởng. Hãy tải lại trang.</p>
      ) : ordered.length === 0 ? (
        <p className="text-sm text-gray-500">
          {editable
            ? "Chưa có mức nào. Không có mức nào thì người ủng hộ chỉ cam kết mà không nhận quà."
            : "Dự án không có mức phần thưởng nào."}
        </p>
      ) : (
        <ol className="space-y-3">
          {ordered.map((tier, index) => (
            <li key={tier.id} className="space-y-3 rounded-md border border-gray-200 p-4 text-sm">
              <TierSummary tier={tier} />
              {editable ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {index > 0 && (
                      <ActionForm action={moveRewardTier.bind(null, campaignId, tier.id, "up")}>
                        <SubmitButton className="btn-secondary px-3 py-1">↑ Lên</SubmitButton>
                      </ActionForm>
                    )}
                    {index < ordered.length - 1 && (
                      <ActionForm action={moveRewardTier.bind(null, campaignId, tier.id, "down")}>
                        <SubmitButton className="btn-secondary px-3 py-1">↓ Xuống</SubmitButton>
                      </ActionForm>
                    )}
                    <ActionForm
                      action={deleteRewardTier.bind(null, campaignId, tier.id)}
                      confirm={`Xóa mức “${tier.title}”?`}
                    >
                      <SubmitButton className="btn-danger px-3 py-1">Xóa</SubmitButton>
                    </ActionForm>
                  </div>
                  <details>
                    <summary className="cursor-pointer font-medium text-brand-600">Sửa mức này</summary>
                    <ActionForm action={saveRewardTier.bind(null, campaignId, tier.id)} className="mt-3 space-y-3">
                      <TierFields prefix={`tier_${tier.id}`} tier={tier} />
                      <SubmitButton>Lưu phần thưởng</SubmitButton>
                    </ActionForm>
                  </details>
                </div>
              ) : tier.status === "retired" ? null : canRetireTier(status, tier) ? (
                <ActionForm
                  action={retireRewardTier.bind(null, campaignId, tier.id)}
                  confirm={`Ngừng nhận cam kết mới cho mức “${tier.title}”? Mức này sẽ ẩn khỏi trang dự án và không mở lại được.`}
                >
                  <SubmitButton className="btn-secondary px-3 py-1">Ngừng nhận mức này</SubmitButton>
                </ActionForm>
              ) : (
                RETIRABLE_STATUSES.includes(status) &&
                tier.quantity_claimed > 0 && (
                  <p className="text-gray-600">Đã có người cam kết nên mức này không ngừng nhận được.</p>
                )
              )}
            </li>
          ))}
        </ol>
      )}

      {editable && tiers && ordered.length < MAX_TIERS && (
        <details className="rounded-md border border-dashed border-gray-300 p-4" open={ordered.length === 0}>
          <summary className="cursor-pointer font-medium">Thêm mức phần thưởng</summary>
          <ActionForm action={saveRewardTier.bind(null, campaignId, null)} resetOnSuccess className="mt-3 space-y-3">
            <TierFields prefix="new_tier" tier={null} />
            <SubmitButton className="btn-secondary">Thêm mức</SubmitButton>
          </ActionForm>
        </details>
      )}
    </section>
  )
}

function TierSummary({ tier }: { tier: RewardTier }) {
  const delivery = deliveryMonthLabel(tier.estimated_delivery)
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold break-words">{tier.title}</p>
        <span className="font-medium text-gray-700">{minAmountLabel(tier.min_amount)}</span>
      </div>
      {tier.description && <p className="break-words whitespace-pre-line text-gray-600">{tier.description}</p>}
      <p className="text-xs text-gray-500">
        {tier.quantity_limit === null
          ? "Không giới hạn số suất"
          : `${tier.quantity_limit} suất · ${quantityLabel(tier)}`}
        {tier.quantity_claimed > 0 && ` · ${tier.quantity_claimed} người đã chọn`}
        {delivery && ` · Dự kiến giao ${delivery.toLowerCase()}`}
        {tier.requires_shipping ? " · Cần giao hàng" : ""}
      </p>
      {tier.requires_shipping && tier.shipping_note && (
        <p className="text-xs break-words whitespace-pre-line text-gray-500">Giao hàng: {tier.shipping_note}</p>
      )}
      {tier.status === "retired" && (
        <p className="text-xs font-medium text-amber-800">Đã ngừng nhận cam kết mới (ẩn khỏi trang dự án).</p>
      )}
    </div>
  )
}

/** The fields of a tier; `prefix` keeps the ids unique when several forms are on the page. */
function TierFields({ prefix, tier }: { prefix: string; tier: RewardTier | null }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${prefix}_title`} className="label">
            Tên phần thưởng
          </label>
          <input
            id={`${prefix}_title`}
            name="title"
            className="field"
            required
            minLength={2}
            maxLength={120}
            defaultValue={tier?.title ?? ""}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}_min_amount`} className="label">
            Số tiền tối thiểu (₫)
          </label>
          <input
            id={`${prefix}_min_amount`}
            name="min_amount"
            className="field"
            inputMode="numeric"
            required
            defaultValue={tier ? String(tier.min_amount) : ""}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}_quantity_limit`} className="label">
            Số suất (để trống nếu không giới hạn)
          </label>
          <input
            id={`${prefix}_quantity_limit`}
            name="quantity_limit"
            className="field"
            inputMode="numeric"
            defaultValue={tier?.quantity_limit ? String(tier.quantity_limit) : ""}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}_estimated_delivery`} className="label">
            Tháng giao quà dự kiến (không bắt buộc)
          </label>
          <input
            id={`${prefix}_estimated_delivery`}
            name="estimated_delivery"
            type="month"
            className="field"
            placeholder="2027-03"
            defaultValue={deliveryMonthInput(tier?.estimated_delivery ?? null)}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${prefix}_description`} className="label">
          Mô tả (không bắt buộc)
        </label>
        <textarea
          id={`${prefix}_description`}
          name="description"
          className="field"
          rows={3}
          maxLength={2000}
          defaultValue={tier?.description ?? ""}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requires_shipping" defaultChecked={tier?.requires_shipping ?? false} />
        Cần giao hàng (người ủng hộ nhập địa chỉ nhận khi cam kết)
      </label>
      <div>
        <label htmlFor={`${prefix}_shipping_note`} className="label">
          Ghi chú giao hàng (không bắt buộc, chỉ dùng khi cần giao hàng)
        </label>
        <input
          id={`${prefix}_shipping_note`}
          name="shipping_note"
          className="field"
          maxLength={500}
          placeholder="Ví dụ: chỉ giao trong Việt Nam, phí ship đã gồm trong số tiền."
          defaultValue={tier?.shipping_note ?? ""}
        />
      </div>
    </>
  )
}

/** Link from the editor to the fulfillment page of a succeeded back campaign. */
export function FulfillmentLink({ campaignId }: { campaignId: string }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 card p-6">
      <div>
        <h2 className="text-lg font-semibold">Giao quà cho người ủng hộ</h2>
        <p className="text-sm text-gray-600">
          Dự án đã gây quỹ thành công. Cập nhật tình trạng giao quà cho từng người đã thanh toán, hoặc nhiều người cùng
          lúc; người ủng hộ thấy cập nhật trong mục Ủng hộ của tôi.
        </p>
      </div>
      <Link href={`/me/campaigns/${campaignId}/fulfillment`} className="btn-primary">
        Cập nhật giao quà
      </Link>
    </section>
  )
}
