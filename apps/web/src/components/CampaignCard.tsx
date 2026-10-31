import Image from "next/image"
import Link from "next/link"

import { TypeBadge } from "@/components/badges"
import { ProgressBar } from "@/components/ProgressBar"
import type { CampaignWithRefs } from "@/lib/campaigns"
import { daysLeft, formatVnd, progressPercent } from "@/lib/format"
import { mediaUrl } from "@/lib/supabase"

/**
 * Campaign card for discovery, ported from the old ProjectCard. Money totals
 * arrive with M1 (ledger); until then the card shows the goal and 0 raised.
 */
export function CampaignCard({ campaign }: { campaign: CampaignWithRefs }) {
  const raised = 0
  const percent = progressPercent(raised, campaign.goal_amount)
  const days = daysLeft(campaign.ends_at)
  const options = campaign.display_options

  return (
    <Link href={`/campaigns/${campaign.slug}`} className="group block">
      <article className="h-full overflow-hidden card transition-shadow group-hover:shadow-md">
        <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
          {campaign.cover?.storage_path ? (
            <Image
              src={mediaUrl(campaign.cover.storage_path)}
              alt={campaign.cover.alt ?? campaign.title}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl text-gray-300" aria-hidden>
              {campaign.category?.icon ?? (campaign.type === "give" ? "❤️" : "🚀")}
            </div>
          )}
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={campaign.type} />
            {campaign.category && (
              <span className="text-xs text-gray-500">
                {campaign.category.icon} {campaign.category.name}
              </span>
            )}
          </div>
          <h3 className="line-clamp-2 text-lg leading-snug font-semibold text-gray-900">{campaign.title}</h3>
          {campaign.summary && <p className="line-clamp-2 text-sm text-gray-600">{campaign.summary}</p>}
          {options.progress_bar !== false && <ProgressBar percent={percent} />}
          <div className="flex items-center justify-between text-sm">
            <span>
              <span className="font-semibold">{formatVnd(raised)}</span>
              <span className="text-gray-500"> / {formatVnd(campaign.goal_amount)}</span>
            </span>
            {options.time_remaining !== false && days !== null && (
              <span className="text-gray-500">{days > 0 ? `Còn ${days} ngày` : "Đã hết hạn"}</span>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}
