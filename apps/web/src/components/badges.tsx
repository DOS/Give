import { Badge, type BadgeTone } from "@/components/ui/Badge"
import { CheckBadgeIcon } from "@/components/ui/icons"
import {
  STATUS_LABELS,
  TYPE_LABELS,
  VERIFICATION_LABELS,
  type CampaignStatus,
  type CampaignType,
  type VerificationStatus,
} from "@/lib/campaigns"
import { ACCOUNT_STATUS_LABELS, type AccountStatus } from "@/lib/receiving-accounts"

/** "Từ thiện" for give, "Dự án sáng tạo" for back, as the home page and discovery name them (DESIGN.md 4: accent marks back). */
const TYPE_BADGE_LABELS: Record<CampaignType, string> = { give: TYPE_LABELS.give, back: "Dự án sáng tạo" }

/** `md` is the 28px tag size the campaign page uses above its title (DESIGN.md 6, Tag). */
export function TypeBadge({ type, size, className }: { type: CampaignType; size?: "md"; className?: string }) {
  return (
    <Badge tone={type === "give" ? "brand" : "accent"} size={size} className={className}>
      {TYPE_BADGE_LABELS[type]}
    </Badge>
  )
}

const STATUS_TONES: Record<CampaignStatus, BadgeTone> = {
  draft: "neutral",
  in_review: "warning",
  changes_requested: "accent",
  approved: "info",
  live: "brand",
  settling: "info",
  succeeded: "brand",
  failed: "neutral",
  closed: "neutral",
  suspended: "danger",
  cancelled: "neutral",
}

export function StatusBadge({ status, className }: { status: CampaignStatus; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status]} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <Badge
      tone={status === "verified" ? "brand" : status === "rejected" ? "danger" : "neutral"}
      icon={status === "verified" ? <CheckBadgeIcon width={16} height={16} /> : undefined}
    >
      {VERIFICATION_LABELS[status]}
    </Badge>
  )
}

const ACCOUNT_STATUS_TONES: Record<AccountStatus, BadgeTone> = {
  pending: "warning",
  verified: "brand",
  rejected: "danger",
  disabled: "neutral",
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return (
    <Badge
      tone={ACCOUNT_STATUS_TONES[status]}
      icon={status === "verified" ? <CheckBadgeIcon width={16} height={16} /> : undefined}
    >
      {ACCOUNT_STATUS_LABELS[status]}
    </Badge>
  )
}
