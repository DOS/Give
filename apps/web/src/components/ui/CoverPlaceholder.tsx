import { HeartIcon, SparkIcon } from "@/components/ui/icons"
import type { CampaignType } from "@/lib/campaigns"

/** Stands in for a missing cover (DESIGN.md 9): a flat surface fill with the campaign type's icon. */
export function CoverPlaceholder({ type }: { type: CampaignType }) {
  const Icon = type === "give" ? HeartIcon : SparkIcon
  return (
    <div className="flex h-full items-center justify-center bg-surface text-muted">
      <Icon width={40} height={40} />
    </div>
  )
}
