import clsx from "clsx"
import Link from "next/link"

import { Badge } from "@/components/ui/Badge"
import { buttonClass } from "@/components/ui/Button"
import { GiftIcon } from "@/components/ui/icons"
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
    <section aria-labelledby="reward-tiers" className="space-y-4">
      <div>
        <h2 id="reward-tiers" className="flex items-center gap-2 text-xl font-bold">
          <GiftIcon className="text-accent-700" />
          Các mức ủng hộ
        </h2>
        {!open && <p className="mt-1 text-muted">{closedNote}</p>}
      </div>
      <ol className="space-y-4">
        {tiers.map((tier) => {
          const soldOut = isSoldOut(tier)
          const delivery = deliveryMonth(tier.estimated_delivery)
          return (
            <li key={tier.id} className={clsx("space-y-4 card p-5", soldOut && "bg-surface")}>
              <div className="space-y-1">
                <p className="text-lg font-bold text-ink tabular-nums">{minAmountLabel(tier.min_amount)}</p>
                <h3 className="font-semibold break-words">{tier.title}</h3>
              </div>
              {tier.description && <p className="break-words whitespace-pre-line text-body">{tier.description}</p>}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4">
                {delivery && (
                  <div>
                    <dt className="text-sm text-muted">Dự kiến giao</dt>
                    <dd className="font-medium text-ink">{delivery}</dd>
                  </div>
                )}
                <div className={delivery ? undefined : "col-span-2"}>
                  <dt className="text-sm text-muted">Nhận quà</dt>
                  <dd className="font-medium text-ink">
                    {tier.requires_shipping ? "Giao tận nơi (cần địa chỉ nhận)" : "Không cần giao hàng"}
                  </dd>
                </div>
                {tier.requires_shipping && tier.shipping_note && (
                  <div className="col-span-2">
                    <dt className="sr-only">Ghi chú giao hàng</dt>
                    <dd className="text-sm break-words whitespace-pre-line text-muted">{tier.shipping_note}</dd>
                  </div>
                )}
                <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <dt className="sr-only">Số suất</dt>
                  <dd>
                    {soldOut ? (
                      <Badge tone="danger">{quantityLabel(tier)}</Badge>
                    ) : (
                      <span className="font-medium text-ink">{quantityLabel(tier)}</span>
                    )}
                  </dd>
                  {tier.quantity_claimed > 0 && <dd className="text-muted">{tier.quantity_claimed} người đã chọn</dd>}
                </div>
              </dl>
              {open && !soldOut ? (
                <Link href={pledgeHref(slug, tier.id)} className={buttonClass({ full: true })}>
                  Chọn mức này
                </Link>
              ) : (
                <button type="button" disabled className={buttonClass({ variant: "secondary", full: true })}>
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
