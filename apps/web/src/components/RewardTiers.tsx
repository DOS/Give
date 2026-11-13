import clsx from "clsx"
import Link from "next/link"

import { Badge } from "@/components/ui/Badge"
import { deliveryMonth, isSoldOut, type PublicRewardTier } from "@/lib/pledges"
import { minAmountLabel, pledgeHref, quantityLabel } from "@/lib/reward-tiers"

/**
 * The reward tiers of a back campaign on its public page (DOS/Give#83,
 * DESIGN.md 8). While the campaign takes pledges, each tier with slots left
 * is one link into the pledge flow (DOS/Give#31) with the tier chosen; the
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
    <section aria-labelledby="reward-tiers">
      <h2 id="reward-tiers" className="text-h3">
        Chọn mức ủng hộ
      </h2>
      {!open && <p className="mt-1 text-sm text-muted">{closedNote}</p>}
      <ol className="mt-3 space-y-3">
        {tiers.map((tier) => {
          const soldOut = isSoldOut(tier)
          const delivery = deliveryMonth(tier.estimated_delivery)
          const choosable = open && !soldOut
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-bold text-fg tabular-nums">{minAmountLabel(tier.min_amount)}</p>
                {soldOut ? (
                  <Badge tone="danger">{quantityLabel(tier)}</Badge>
                ) : (
                  <p className="shrink-0 text-sm text-muted">{quantityLabel(tier)}</p>
                )}
              </div>
              <h3 className="mt-1 font-semibold break-words text-fg">
                {choosable ? (
                  <Link
                    href={pledgeHref(slug, tier.id)}
                    className="after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary"
                  >
                    {tier.title}
                  </Link>
                ) : (
                  tier.title
                )}
              </h3>
              {tier.description && (
                <p className="mt-1 text-sm break-words whitespace-pre-line text-muted">{tier.description}</p>
              )}
              <p className="mt-2 text-sm text-muted">
                {[
                  delivery && `Giao dự kiến ${delivery.toLowerCase()}`,
                  tier.requires_shipping ? "Giao tận nơi (cần địa chỉ nhận)" : "Không cần giao hàng",
                  tier.quantity_claimed > 0 && `${tier.quantity_claimed} người đã chọn`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {tier.requires_shipping && tier.shipping_note && (
                <p className="mt-1 text-sm break-words whitespace-pre-line text-muted">{tier.shipping_note}</p>
              )}
            </>
          )
          return (
            <li
              key={tier.id}
              // The ring of a choosable tier is on the whole box (RingBoxScroll).
              data-ring-box={choosable || undefined}
              className={clsx(
                "relative card p-4 transition-colors duration-150",
                choosable ? "hover:border-primary" : "bg-surface"
              )}
            >
              {body}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
