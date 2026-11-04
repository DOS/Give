import type { BadgeTone } from "@/components/ui/Badge"
import type { DonationStatus } from "@/lib/contributions"
import type { FulfillmentStatus } from "@/lib/fulfillment"
import type { PledgeStatus } from "@/lib/pledges"
import type { RowStatus } from "@/lib/statement-import"

/** Badge tones of the statuses /me lists show (labels stay in lib). */
export const DONATION_TONES: Record<DonationStatus, BadgeTone> = {
  awaiting_transfer: "warning",
  received: "brand",
  expired: "neutral",
}

export const PLEDGE_TONES: Record<PledgeStatus, BadgeTone> = {
  pledged: "info",
  payment_due: "warning",
  partially_paid: "warning",
  paid: "brand",
  cancelled: "neutral",
  lapsed: "neutral",
  refund_due: "danger",
  refunded: "neutral",
}

export const FULFILLMENT_TONES: Record<FulfillmentStatus, BadgeTone> = {
  pending: "neutral",
  in_progress: "info",
  shipped: "info",
  delivered: "brand",
  issue: "danger",
}

export const ROW_TONES: Record<RowStatus, BadgeTone> = {
  ready: "neutral",
  duplicate: "neutral",
  ambiguous: "warning",
  imported: "brand",
}

/** The tone of a status read from the database as a plain string; neutral when unknown. */
export function toneOf(tones: Partial<Record<string, BadgeTone>>, status: string | null): BadgeTone {
  return (status !== null && tones[status]) || "neutral"
}
