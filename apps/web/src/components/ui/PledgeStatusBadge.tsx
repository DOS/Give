import { Badge, type BadgeTone } from "@/components/ui/Badge"
import { pledgeStatusLabel, type PledgeStatus } from "@/lib/pledges"

const TONES: Record<PledgeStatus, BadgeTone> = {
  pledged: "info",
  payment_due: "warning",
  partially_paid: "warning",
  paid: "brand",
  cancelled: "neutral",
  lapsed: "neutral",
  refund_due: "danger",
  refunded: "neutral",
}

/** A pledge's status as a kit badge (DOS/Give#96), toned like the old `pledgeStatusColor` pill. */
export function PledgeStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={TONES[status as PledgeStatus] ?? "neutral"} className={className}>
      {pledgeStatusLabel(status)}
    </Badge>
  )
}
