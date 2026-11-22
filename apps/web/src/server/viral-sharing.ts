import "server-only"

import { isPublicStatus, TYPE_LABELS, type PublicCampaign, type PublicOrganizer } from "@/lib/campaigns"
import { formatVnd, progressPercent } from "@/lib/format"
import { raisedAmount, type MoneyTotals } from "@/lib/statement"
import {
  encodeQrMatrix,
  formatPosterBankHint,
  posterDisplayTitle,
  shouldIncludePosterVietQr,
  verifiedStatementLabel,
  type CampaignPosterData,
  type PosterVietQrBox,
} from "@/lib/viral-sharing"
import type { PaymentAccount } from "@/server/contributions"
import { encodeVietQr } from "@/server/vietqr"
import { hasValidCrc } from "@/server/vietqr/crc16"

/**
 * Server-side assembly of downloadable QR poster props for /campaigns/[slug].
 *
 * Security & #93 invariants:
 * - Returns null for non-public campaigns so drafts/private campaigns never build posters.
 * - Encodes static VietQR strictly on the server only when `shouldIncludePosterVietQr`
 *   allows it (live give campaign, inside dates, no `payments_stopped_at`, usable account).
 * - Never sends raw `account_number` or `account_name` to client components; the human-readable
 *   bank hint uses `formatPosterBankHint` (reusing `maskedAccountLast4`), and the VietQR
 *   payload is pre-encoded into a boolean module matrix.
 */
export function buildServerPosterData({
  campaign,
  totals,
  organizer,
  account,
  origin,
  now = new Date(),
}: {
  campaign: Pick<
    PublicCampaign,
    | "id"
    | "slug"
    | "type"
    | "status"
    | "title"
    | "goal_amount"
    | "starts_at"
    | "ends_at"
    | "display_options"
    | "payments_stopped_at"
  >
  totals: MoneyTotals | null
  organizer: Pick<PublicOrganizer, "display_name" | "verification_status"> | null
  account: PaymentAccount | null
  origin?: string
  now?: Date
}): CampaignPosterData | null {
  if (!isPublicStatus(campaign.status)) return null

  const isGive = campaign.type === "give"
  const raised = raisedAmount(totals, campaign.type)
  const percent = progressPercent(raised, campaign.goal_amount)

  let vietQr: PosterVietQrBox | null = null
  const allowVietQr = shouldIncludePosterVietQr({
    campaign,
    totals,
    hasUsableAccount: account !== null,
    now,
  })

  if (allowVietQr && account) {
    try {
      const payload = encodeVietQr({
        bankBin: account.bank_bin,
        consumerId: account.account_number,
        service: "account",
      })
      if (hasValidCrc(payload)) {
        const hint = formatPosterBankHint(account.bank_bin, account.account_number)
        vietQr = {
          qr: encodeQrMatrix(payload),
          bankName: hint.bankName,
          maskedAccount: hint.maskedAccount,
        }
      }
    } catch {
      // Malformed bank BIN or account number falls back safely to campaign-link QR only.
      vietQr = null
    }
  }

  return {
    campaignId: campaign.id,
    slug: campaign.slug,
    path: `/campaigns/${campaign.slug}`,
    origin,
    type: campaign.type,
    typeBadge: TYPE_LABELS[campaign.type],
    title: posterDisplayTitle(campaign.title),
    organizerName: organizer?.display_name ?? null,
    organizerVerified: organizer?.verification_status === "verified",
    raisedLabel: isGive ? "Đã nhận" : "Đã cam kết",
    raisedText: formatVnd(raised),
    goalText: `Mục tiêu ${formatVnd(campaign.goal_amount)}`,
    percent,
    showProgressBar: campaign.display_options.progress_bar !== false,
    verifiedStatementBadge: verifiedStatementLabel(totals, organizer),
    vietQr,
  }
}
