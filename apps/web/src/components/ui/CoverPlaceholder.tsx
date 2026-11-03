import { HeartIcon, SparkIcon } from "@/components/ui/icons"
import type { CampaignType } from "@/lib/campaigns"

/** Stands in for a missing cover: a tinted panel with the campaign type's icon. */
export function CoverPlaceholder({ type }: { type: CampaignType }) {
  const Icon = type === "give" ? HeartIcon : SparkIcon
  return (
    <div
      className={`flex h-full items-center justify-center ${type === "give" ? "bg-brand-50 text-brand-200" : "bg-accent-50 text-accent-200"}`}
    >
      <Icon width={56} height={56} strokeWidth={1.25} />
    </div>
  )
}
