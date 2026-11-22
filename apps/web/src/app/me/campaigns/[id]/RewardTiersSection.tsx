import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { ChevronDownIcon } from "@/components/ui/icons"
import type { CampaignStatus } from "@/lib/campaigns"
import { formatDateTime, formatVnd, toVietnamLocalInput } from "@/lib/format"
import { deliveryMonth, isTierExpired } from "@/lib/pledges"
import {
  canEditTiers,
  canRetireTier,
  deliveryMonthInput,
  MAX_TIERS,
  minAmountLabel,
  quantityLabel,
  RETIRABLE_STATUSES,
  sortTiers,
  type RewardTier,
} from "@/lib/reward-tiers"

import { checkInputClass, checkLabelClass, Panel } from "../../_components/Panel"
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
  startsAt = null,
  endsAt = null,
  tiers,
}: {
  campaignId: string
  status: CampaignStatus
  minContribution: number
  startsAt?: string | null
  endsAt?: string | null
  /** null when the tiers could not be read. */
  tiers: RewardTier[] | null
}) {
  const editable = canEditTiers(status)
  const ordered = tiers ? sortTiers(tiers) : []

  return (
    <Panel
      id="reward-tiers"
      title="Phần thưởng"
      description={
        <p>
          Mỗi mức có số tiền tối thiểu (không thấp hơn mức góp tối thiểu {formatVnd(minContribution)}), có thể giới hạn
          số suất. Người ủng hộ chọn một mức khi cam kết.{" "}
          {editable
            ? "Bạn chỉ thêm, sửa, xóa hay sắp xếp được khi dự án là bản nháp hoặc cần chỉnh sửa; sau khi gửi duyệt, các mức được giữ nguyên."
            : RETIRABLE_STATUSES.includes(status)
              ? "Dự án đã gửi duyệt nên các mức không sửa được nữa. Bạn vẫn có thể ngừng nhận một mức chưa có ai cam kết."
              : "Các mức không sửa được ở trạng thái này."}
        </p>
      }
    >
      {!tiers ? (
        <Callout tone="danger">Không tải được các mức phần thưởng. Hãy tải lại trang.</Callout>
      ) : ordered.length === 0 ? (
        <p className="text-muted">
          {editable
            ? "Chưa có mức nào. Không có mức nào thì người ủng hộ chỉ cam kết mà không nhận quà."
            : "Dự án không có mức phần thưởng nào."}
        </p>
      ) : (
        <ol className="space-y-4">
          {ordered.map((tier, index) => (
            <li key={tier.id} className="min-w-0 space-y-4 rounded-md border border-border p-4 sm:p-6">
              <TierSummary tier={tier} />
              {editable ? (
                <div className="space-y-2 border-t border-border pt-4">
                  <div className="flex flex-wrap gap-2">
                    {index > 0 && (
                      <ActionForm action={moveRewardTier.bind(null, campaignId, tier.id, "up")}>
                        <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>
                          ↑ Lên<span className="sr-only">: {tier.title}</span>
                        </SubmitButton>
                      </ActionForm>
                    )}
                    {index < ordered.length - 1 && (
                      <ActionForm action={moveRewardTier.bind(null, campaignId, tier.id, "down")}>
                        <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>
                          ↓ Xuống<span className="sr-only">: {tier.title}</span>
                        </SubmitButton>
                      </ActionForm>
                    )}
                    <ActionForm
                      action={deleteRewardTier.bind(null, campaignId, tier.id)}
                      confirm={`Xóa mức “${tier.title}”?`}
                    >
                      <SubmitButton className={buttonClass({ variant: "danger", size: "sm" })}>
                        Xóa<span className="sr-only"> mức {tier.title}</span>
                      </SubmitButton>
                    </ActionForm>
                  </div>
                  <details className="group">
                    <summary
                      aria-label={`Sửa mức này: ${tier.title}`}
                      className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 link [&::-webkit-details-marker]:hidden"
                    >
                      Sửa mức này
                      <ChevronDownIcon width={20} height={20} className="group-open:rotate-180" />
                    </summary>
                    <ActionForm
                      action={saveRewardTier.bind(null, campaignId, tier.id)}
                      className="mt-3 max-w-160 space-y-6"
                    >
                      <TierFields prefix={`tier_${tier.id}`} tier={tier} startsAt={startsAt} endsAt={endsAt} />
                      <SubmitButton className={buttonClass({ variant: "secondary" })}>
                        Lưu phần thưởng<span className="sr-only">: {tier.title}</span>
                      </SubmitButton>
                    </ActionForm>
                  </details>
                </div>
              ) : tier.status === "retired" ? null : canRetireTier(status, tier) ? (
                <ActionForm
                  action={retireRewardTier.bind(null, campaignId, tier.id)}
                  confirm={`Ngừng nhận cam kết mới cho mức “${tier.title}”? Mức này sẽ ẩn khỏi trang dự án và không mở lại được.`}
                >
                  <SubmitButton className={buttonClass({ variant: "secondary" })}>
                    Ngừng nhận mức này<span className="sr-only">: {tier.title}</span>
                  </SubmitButton>
                </ActionForm>
              ) : (
                RETIRABLE_STATUSES.includes(status) &&
                tier.quantity_claimed > 0 && (
                  <p className="text-sm text-muted">Đã có người cam kết nên mức này không ngừng nhận được.</p>
                )
              )}
            </li>
          ))}
        </ol>
      )}

      {editable && tiers && ordered.length < MAX_TIERS && (
        <details className="group mt-4 rounded-md border border-border px-4 py-1" open={ordered.length === 0}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold text-fg [&::-webkit-details-marker]:hidden">
            Thêm mức phần thưởng
            <ChevronDownIcon width={20} height={20} className="group-open:rotate-180" />
          </summary>
          <ActionForm
            action={saveRewardTier.bind(null, campaignId, null)}
            resetOnSuccess
            className="mt-2 mb-4 max-w-160 space-y-6"
          >
            <TierFields prefix="new_tier" tier={null} startsAt={startsAt} endsAt={endsAt} />
            <SubmitButton className={buttonClass({ variant: "secondary" })}>Thêm mức</SubmitButton>
          </ActionForm>
        </details>
      )}
    </Panel>
  )
}

function TierSummary({ tier }: { tier: RewardTier }) {
  const delivery = deliveryMonth(tier.estimated_delivery)
  const expired = isTierExpired(tier)
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 text-h3 break-words text-fg">{tier.title}</h3>
          {tier.is_early_bird && <Badge tone="warning">Ưu đãi Early Bird</Badge>}
          {expired && <Badge tone="danger">Đã hết hạn ưu đãi</Badge>}
        </div>
        <span className="font-semibold text-fg tabular-nums">{minAmountLabel(tier.min_amount)}</span>
      </div>
      {tier.description && <p className="max-w-[68ch] break-words whitespace-pre-line text-fg">{tier.description}</p>}
      <p className="text-sm text-muted tabular-nums">
        {tier.quantity_limit === null
          ? "Không giới hạn số suất"
          : `${tier.quantity_limit} suất · ${quantityLabel(tier)}`}
        {tier.quantity_claimed > 0 && ` · ${tier.quantity_claimed} người đã chọn`}
        {tier.available_until &&
          (expired
            ? ` · Đã hết hạn ưu đãi lúc ${formatDateTime(tier.available_until)}`
            : ` · Ưu đãi đến ${formatDateTime(tier.available_until)}`)}
        {delivery && ` · Dự kiến giao ${delivery.toLowerCase()}`}
        {tier.requires_shipping ? " · Cần giao hàng" : ""}
      </p>
      {tier.requires_shipping && tier.shipping_note && (
        <p className="text-sm break-words whitespace-pre-line text-muted">Giao hàng: {tier.shipping_note}</p>
      )}
      {tier.status === "retired" && (
        <p className="text-sm font-medium text-warning">Đã ngừng nhận cam kết mới (ẩn khỏi trang dự án).</p>
      )}
    </div>
  )
}

/** The fields of a tier; `prefix` keeps the ids unique when several forms are on the page. */
function TierFields({
  prefix,
  tier,
  startsAt,
  endsAt,
}: {
  prefix: string
  tier: RewardTier | null
  startsAt: string | null
  endsAt: string | null
}) {
  const minUntil = startsAt ? toVietnamLocalInput(startsAt) : undefined
  const maxUntil = endsAt ? toVietnamLocalInput(endsAt) : undefined
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 [&>*]:min-w-0">
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
            className="field tabular-nums"
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
            className="field tabular-nums"
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
      <label className={checkLabelClass}>
        <input
          type="checkbox"
          name="is_early_bird"
          className={checkInputClass}
          defaultChecked={tier?.is_early_bird ?? false}
        />
        Ưu đãi Early Bird (giới hạn số suất hoặc thời hạn mở bán sớm)
      </label>
      <div>
        <label htmlFor={`${prefix}_available_until`} className="label">
          Thời hạn ưu đãi Early Bird (giờ Việt Nam, không bắt buộc nếu đã giới hạn số suất)
        </label>
        <input
          id={`${prefix}_available_until`}
          name="available_until"
          type="datetime-local"
          className="field tabular-nums"
          min={minUntil || undefined}
          max={maxUntil || undefined}
          aria-describedby={`${prefix}_available_until_hint`}
          defaultValue={toVietnamLocalInput(tier?.available_until ?? null)}
        />
        <p id={`${prefix}_available_until_hint`} className="hint">
          Chỉ áp dụng khi bật ưu đãi Early Bird. Thời hạn phải ở tương lai và nằm trong lịch gây quỹ của dự án; các cam
          kết đã tạo trước hạn vẫn giữ nguyên hiệu lực.
        </p>
      </div>
      <label className={checkLabelClass}>
        <input
          type="checkbox"
          name="requires_shipping"
          className={checkInputClass}
          defaultChecked={tier?.requires_shipping ?? false}
        />
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
    <section
      id="fulfillment"
      aria-labelledby="fulfillment-title"
      className="flex scroll-mt-24 flex-col gap-4 rounded-md bg-surface p-4 sm:flex-row sm:items-center sm:p-6"
    >
      <div className="min-w-0 flex-1">
        <h2 id="fulfillment-title" className="text-h2">
          Giao quà cho người ủng hộ
        </h2>
        <p className="mt-2 max-w-[68ch] text-fg">
          Dự án đã gây quỹ thành công. Cập nhật tình trạng giao quà cho từng người đã thanh toán, hoặc nhiều người cùng
          lúc; người ủng hộ thấy cập nhật trong mục Ủng hộ của tôi.
        </p>
      </div>
      <ButtonLink href={`/me/campaigns/${campaignId}/fulfillment`} className="shrink-0">
        Cập nhật giao quà
      </ButtonLink>
    </section>
  )
}
