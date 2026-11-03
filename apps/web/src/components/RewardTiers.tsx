import Link from "next/link"

import { deliveryMonth, isSoldOut, type PublicRewardTier } from "@/lib/pledges"
import { minAmountLabel, pledgeHref, quantityLabel } from "@/lib/reward-tiers"

/**
 * The reward tiers of a back campaign on its public page (DOS/Give#83).
 * "Chọn mức này" opens the pledge flow (DOS/Give#31) with the tier chosen,
 * only while the campaign takes pledges and the tier has slots left; the
 * pledge RPC re-checks both.
 */
export function RewardTiers({
  tiers,
  slug,
  open,
  closedNote,
}: {
  tiers: readonly PublicRewardTier[]
  slug: string
  /** The campaign takes pledges now (live, before its end, not a preview). */
  open: boolean
  /** Why no tier can be chosen, shown when `open` is false. */
  closedNote: string
}) {
  if (tiers.length === 0) return null
  return (
    <section aria-labelledby="reward-tiers" className="space-y-3">
      <h2 id="reward-tiers" className="text-lg font-bold">
        Các mức ủng hộ
      </h2>
      {!open && <p className="text-xs text-gray-500">{closedNote}</p>}
      <ol className="space-y-3">
        {tiers.map((tier) => {
          const soldOut = isSoldOut(tier)
          const delivery = deliveryMonth(tier.estimated_delivery)
          return (
            <li key={tier.id} className={`space-y-3 card p-5 ${soldOut ? "opacity-75" : ""}`}>
              <div>
                <p className="text-sm font-semibold text-brand-600">{minAmountLabel(tier.min_amount)}</p>
                <h3 className="mt-1 font-semibold break-words">{tier.title}</h3>
              </div>
              {tier.description && (
                <p className="text-sm break-words whitespace-pre-line text-gray-700">{tier.description}</p>
              )}
              <dl className="space-y-1 text-xs text-gray-600">
                {delivery && (
                  <div className="flex gap-1">
                    <dt>Dự kiến giao:</dt>
                    <dd className="font-medium text-gray-800">{delivery}</dd>
                  </div>
                )}
                <div className="flex gap-1">
                  <dt>Nhận quà:</dt>
                  <dd className="font-medium text-gray-800">
                    {tier.requires_shipping ? "Giao tận nơi (cần địa chỉ nhận)" : "Không cần giao hàng"}
                  </dd>
                </div>
                {tier.requires_shipping && tier.shipping_note && (
                  <div>
                    <dt className="sr-only">Ghi chú giao hàng</dt>
                    <dd className="break-words whitespace-pre-line">{tier.shipping_note}</dd>
                  </div>
                )}
                <div className="flex flex-wrap gap-x-3">
                  <dt className="sr-only">Số suất</dt>
                  <dd className={soldOut ? "font-semibold text-red-700" : "font-medium text-gray-800"}>
                    {quantityLabel(tier)}
                  </dd>
                  {tier.quantity_claimed > 0 && <dd>{tier.quantity_claimed} người đã chọn</dd>}
                </div>
              </dl>
              {open && !soldOut ? (
                <Link href={pledgeHref(slug, tier.id)} className="btn-primary w-full">
                  Chọn mức này
                </Link>
              ) : (
                <button type="button" disabled className="btn-secondary w-full">
                  {soldOut ? "Đã hết suất" : "Chọn mức này"}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
