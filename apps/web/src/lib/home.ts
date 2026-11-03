import type { PublicCampaign } from "@/lib/campaigns"
import { progressPercent } from "@/lib/format"
import { raisedAmount, type MoneyTotals } from "@/lib/statement"

export interface HomeSections {
  /** Shown in the hero with its statement figures: the give campaign that raised most, else the newest. */
  featured: PublicCampaign | null
  /** Closest to their goal, featured left out. */
  trending: PublicCampaign[]
  /** Newest first, featured and trending left out. */
  newest: PublicCampaign[]
}

/**
 * Splits the live campaigns the home page loaded (newest first) into its
 * sections, from the public totals only, so no extra query is needed.
 */
export function homeSections(
  campaigns: readonly PublicCampaign[],
  totals: ReadonlyMap<string, MoneyTotals>,
  trendingCount = 3
): HomeSections {
  const raised = (c: PublicCampaign) => raisedAmount(totals.get(c.id), c.type)
  const give = campaigns.filter((c) => c.type === "give")
  const featured =
    give.length > 0 ? give.reduce((best, c) => (raised(c) > raised(best) ? c : best)) : (campaigns[0] ?? null)
  const rest = campaigns.filter((c) => c !== featured)
  const trending = [...rest]
    .filter((c) => raised(c) > 0)
    .sort((a, b) => progressPercent(raised(b), b.goal_amount) - progressPercent(raised(a), a.goal_amount))
    .slice(0, trendingCount)
  const newest = rest.filter((c) => !trending.includes(c))
  return { featured, trending, newest }
}
