import clsx from "clsx"

import {
  STATUS_LABELS,
  TYPE_LABELS,
  VERIFICATION_LABELS,
  type CampaignStatus,
  type CampaignType,
  type VerificationStatus,
} from "@/lib/campaigns"
import { ACCOUNT_STATUS_LABELS, type AccountStatus } from "@/lib/receiving-accounts"

const pill = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"

/** "❤️ Từ thiện" for give, "🚀 Dự án" for back (ported from the old TypeBadge). */
export function TypeBadge({ type, className }: { type: CampaignType; className?: string }) {
  return (
    <span
      className={clsx(pill, type === "give" ? "bg-pink-100 text-pink-800" : "bg-blue-100 text-blue-800", className)}
    >
      {type === "give" ? "❤️" : "🚀"} {TYPE_LABELS[type]}
    </span>
  )
}

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_review: "bg-amber-100 text-amber-800",
  changes_requested: "bg-orange-100 text-orange-800",
  approved: "bg-sky-100 text-sky-800",
  live: "bg-green-100 text-green-800",
  settling: "bg-indigo-100 text-indigo-800",
  succeeded: "bg-emerald-100 text-emerald-800",
  failed: "bg-gray-100 text-gray-700",
  closed: "bg-gray-100 text-gray-700",
  suspended: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-500",
}

export function StatusBadge({ status, className }: { status: CampaignStatus; className?: string }) {
  return <span className={clsx(pill, STATUS_COLORS[status], className)}>{STATUS_LABELS[status]}</span>
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <span
      className={clsx(
        pill,
        status === "verified" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600",
        status === "rejected" && "bg-red-100 text-red-700"
      )}
    >
      {status === "verified" ? "✓ " : ""}
      {VERIFICATION_LABELS[status]}
    </span>
  )
}

const ACCOUNT_STATUS_COLORS: Record<AccountStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  verified: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
  disabled: "bg-gray-100 text-gray-600",
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span className={clsx(pill, ACCOUNT_STATUS_COLORS[status])}>
      {status === "verified" ? "✓ " : ""}
      {ACCOUNT_STATUS_LABELS[status]}
    </span>
  )
}
