import { encode } from "uqr"

import { bankLabel } from "./banks"
import {
  isPublicCampaignVisible,
  isPublicStatus,
  STATUS_LABELS,
  TYPE_LABELS,
  type CampaignStatus,
  type CampaignType,
  type DisplayOptions,
  type PublicOrganizer,
} from "./campaigns"
import { formatDate, formatVnd, progressPercent } from "./format"
import { maskedAccountLast4 } from "./notices"
import { raisedAmount, type MoneyTotals } from "./statement"

/**
 * Shared domain logic for Give viral sharing (DOS/Give#313):
 * 1. Dynamic Open Graph card eligibility & display model for /campaigns/[slug]
 * 2. Downloadable QR poster eligibility (#93 stopped-payment gating & account masking)
 * 3. Shareable "Tôi đã chung tay" thank-you card eligibility & amount-privacy toggle
 *
 * Client-safe: never imports server-only modules or Supabase clients.
 */

const OG_TITLE_MAX_CHARS = 92
const POSTER_TITLE_MAX_CHARS = 120
const THANK_YOU_TITLE_MAX_CHARS = 120
const THANK_YOU_DONOR_MAX_CHARS = 60

export const ANONYMOUS_DONOR_CARD_LABEL = "Người ủng hộ ẩn danh"
export const DEFAULT_DONOR_CARD_LABEL = "Người ủng hộ"

/** Truncates cleanly by Unicode code point so diacritics and surrogate pairs never split. */
export function truncateCodePoints(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, " ").trim()
  const chars = Array.from(clean)
  if (chars.length <= maxChars) return clean
  return `${chars
    .slice(0, Math.max(1, maxChars - 1))
    .join("")
    .trimEnd()}…`
}

// ---------------------------------------------------------------------------
// 1. Dynamic Open Graph card (/campaigns/[slug]/opengraph-image)
// ---------------------------------------------------------------------------

export interface OgCampaignInput {
  slug: string
  type: CampaignType
  status: CampaignStatus
  title: string
  goal_amount: number
  display_options: DisplayOptions
  prelaunch_public?: boolean
  starts_at?: string | null
}

export interface OgCampaignCardModel {
  title: string
  type: CampaignType
  typeBadge: string
  statusBadge: string | null
  isPrelaunch: boolean
  launchDateText: string | null
  raised: number
  goal: number
  percent: number
  raisedLabel: string
  raisedText: string
  goalText: string
  showProgressBar: boolean
  supportersText: string | null
  organizerName: string | null
  organizerVerified: boolean
  verifiedStatementBadge: string | null
  footerText: string
}

/** Only publicly visible campaigns (including opted-in future pre-launch teasers) may render an Open Graph card; everything else is 404. */
export function isOgEligible(
  campaign: Pick<OgCampaignInput, "status" | "prelaunch_public" | "starts_at"> | null | undefined,
  now: Date = new Date()
): boolean {
  return campaign != null && isPublicCampaignVisible(campaign, now)
}

/**
 * Verified statement indicator for the OG card: shown only when public totals
 * loaded cleanly and there are zero unexplained outgoing transactions.
 * "Sao kê đối chiếu ngân hàng" is reserved for campaigns with recorded inflows
 * (`paid_amount > 0`); zero-inflow campaigns show "Sao kê công khai".
 */
export function verifiedStatementLabel(
  totals: Pick<MoneyTotals, "paid_amount" | "unexplained_out_count"> | null | undefined,
  _organizer?: Pick<PublicOrganizer, "verification_status"> | null | undefined
): string | null {
  if (!totals || totals.unexplained_out_count > 0) return null
  if (totals.paid_amount > 0) {
    return "Sao kê đối chiếu ngân hàng"
  }
  return "Sao kê công khai"
}

export function buildOgCampaignCardModel({
  campaign,
  totals,
  organizer,
  now = new Date(),
}: {
  campaign: OgCampaignInput
  totals: MoneyTotals | null
  organizer: Pick<PublicOrganizer, "display_name" | "verification_status"> | null
  now?: Date
}): OgCampaignCardModel | null {
  if (!isOgEligible(campaign, now)) return null

  const isGive = campaign.type === "give"
  const isPrelaunch = !isPublicStatus(campaign.status)
  if (isPrelaunch) {
    const validStartsAt =
      campaign.starts_at && !Number.isNaN(Date.parse(campaign.starts_at)) ? formatDate(campaign.starts_at) : null
    return {
      title: truncateCodePoints(campaign.title, OG_TITLE_MAX_CHARS),
      type: campaign.type,
      typeBadge: TYPE_LABELS[campaign.type],
      statusBadge: "Sắp ra mắt",
      isPrelaunch: true,
      launchDateText: validStartsAt ? `Dự kiến mở ngày ${validStartsAt}` : null,
      raised: 0,
      goal: campaign.goal_amount,
      percent: 0,
      raisedLabel: "Mục tiêu gây quỹ",
      raisedText: formatVnd(campaign.goal_amount),
      goalText: validStartsAt ? `Mở ngày ${validStartsAt}` : "Sắp ra mắt",
      showProgressBar: false,
      supportersText: "Đăng ký nhận thông báo khi mở",
      organizerName: organizer ? truncateCodePoints(organizer.display_name, 56) : null,
      organizerVerified: organizer?.verification_status === "verified",
      verifiedStatementBadge: null,
      footerText: "give.vn · Đăng ký nhận thông báo khi mở",
    }
  }

  const raised = raisedAmount(totals, campaign.type)
  const percent = progressPercent(raised, campaign.goal_amount)
  const people = totals ? (isGive ? totals.supporters_count : totals.backers_count) : null
  const supportersText =
    people !== null && campaign.display_options.backers_count !== false
      ? `${people} ${isGive ? "người ủng hộ" : "người đồng hành"}`
      : null

  return {
    title: truncateCodePoints(campaign.title, OG_TITLE_MAX_CHARS),
    type: campaign.type,
    typeBadge: TYPE_LABELS[campaign.type],
    statusBadge: campaign.status !== "live" ? STATUS_LABELS[campaign.status] : null,
    isPrelaunch: false,
    launchDateText: null,
    raised,
    goal: campaign.goal_amount,
    percent,
    raisedLabel: isGive ? "Đã nhận" : "Đã cam kết",
    raisedText: formatVnd(raised),
    goalText: `Mục tiêu ${formatVnd(campaign.goal_amount)}`,
    showProgressBar: campaign.display_options.progress_bar !== false,
    supportersText,
    organizerName: organizer ? truncateCodePoints(organizer.display_name, 56) : null,
    organizerVerified: organizer?.verification_status === "verified",
    verifiedStatementBadge: verifiedStatementLabel(totals, organizer),
    footerText: isGive
      ? "give.vn · Tiền vào thẳng tài khoản chiến dịch · Sao kê công khai"
      : "give.vn · Gây quỹ minh bạch",
  }
}

// ---------------------------------------------------------------------------
// 2. Downloadable QR Poster (/campaigns/[slug])
// ---------------------------------------------------------------------------

export type PosterFormat = "story" | "square"

export const POSTER_DIMENSIONS: Record<PosterFormat, { width: number; height: number; label: string }> = {
  story: { width: 1080, height: 1920, label: "Story (9:16)" },
  square: { width: 1080, height: 1080, label: "Vuông (1:1)" },
}

export interface QrMatrix {
  size: number
  /** Row-major bit string of length size * size ('1' = dark module, '0' = light module). */
  bits: string
}

/** Encodes a string into a deterministic QR module matrix (error correction M, 4-module quiet zone). */
export function encodeQrMatrix(value: string): QrMatrix {
  const { size, data } = encode(value, { ecc: "M", border: 4 })
  let bits = ""
  for (let y = 0; y < size; y++) {
    const row = data[y]
    for (let x = 0; x < size; x++) {
      bits += row?.[x] ? "1" : "0"
    }
  }
  return { size, bits }
}

export interface PosterVietQrBox {
  qr: QrMatrix
  bankName: string
  /** Strictly masked via maskedAccountLast4 ("•••• 5678") or "••••". Never raw digits. */
  maskedAccount: string
}

export interface CampaignPosterData {
  campaignId: string
  slug: string
  path: string
  origin?: string
  type: CampaignType
  typeBadge: string
  title: string
  organizerName: string | null
  organizerVerified: boolean
  raisedLabel: string
  raisedText: string
  goalText: string
  percent: number
  showProgressBar: boolean
  verifiedStatementBadge: string | null
  /** Present only for a live give campaign accepting donations with no payments_stopped_at and a usable bank account. */
  vietQr: PosterVietQrBox | null
}

export interface PosterVietQrEligibilityInput {
  campaign: {
    type: CampaignType
    status: CampaignStatus
    starts_at: string | null
    ends_at: string | null
    payments_stopped_at?: string | null
  }
  totals: Pick<MoneyTotals, "payments_stopped_at"> | null | undefined
  hasUsableAccount: boolean
  now?: Date
}

/**
 * #93 & money safety gate for poster VietQR boxes:
 * Strictly suppresses VietQR / payment instructions whenever payments_stopped_at
 * is set (on campaign or public_campaigns totals), when stopped-payment status
 * cannot be verified (both `totals == null` and `campaign.payments_stopped_at === undefined`),
 * or when the campaign is not a live give campaign inside its active dates with
 * a verified usable bank account.
 */
export function shouldIncludePosterVietQr({
  campaign,
  totals,
  hasUsableAccount,
  now = new Date(),
}: PosterVietQrEligibilityInput): boolean {
  if (!isPublicStatus(campaign.status)) return false
  if (campaign.type !== "give" || campaign.status !== "live") return false
  if (totals == null && campaign.payments_stopped_at === undefined) return false
  if (campaign.payments_stopped_at || totals?.payments_stopped_at) return false
  if (campaign.starts_at && new Date(campaign.starts_at) > now) return false
  if (campaign.ends_at && new Date(campaign.ends_at) <= now) return false
  return hasUsableAccount
}

/**
 * Formats the bank summary shown next to a poster's VietQR box.
 * Reuses maskedAccountLast4 so raw or malformed account numbers can never leak.
 */
export function formatPosterBankHint(
  bankBin: string | null | undefined,
  accountNumber: string | null | undefined
): { bankName: string; maskedAccount: string } {
  const trimmed = accountNumber?.trim() ?? ""
  const last4 = /^[0-9A-Za-z]{5,19}$/.test(trimmed) ? trimmed.slice(-4) : null
  return {
    bankName: bankLabel(bankBin),
    maskedAccount: maskedAccountLast4(last4, null) ?? "••••",
  }
}

/** Strips protocol and trailing slashes for compact display on posters and cards. */
export function displayShortUrl(origin: string | undefined, path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`
  if (!origin) return `give.vn${cleanPath}`
  try {
    const parsed = new URL(cleanPath, origin)
    return `${parsed.host}${parsed.pathname}`
  } catch {
    return `give.vn${cleanPath}`
  }
}

export function posterDisplayTitle(title: string): string {
  return truncateCodePoints(title, POSTER_TITLE_MAX_CHARS)
}

// ---------------------------------------------------------------------------
// 3. Shareable "Tôi đã chung tay" Thank-You Card
// ---------------------------------------------------------------------------

export interface ThankYouEligibilityInput {
  kind: "donation" | "pledge"
  status: string
  receivedAmount: number
  hasPublicCampaign: boolean
}

/**
 * Thank-you cards are only available for matched/received donations or paid
 * pledges with a positive net amount on a public campaign.
 */
export function isThankYouCardEligible({
  kind,
  status,
  receivedAmount,
  hasPublicCampaign,
}: ThankYouEligibilityInput): boolean {
  if (!hasPublicCampaign) return false
  if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) return false
  return kind === "donation" ? status === "received" : status === "paid"
}

/**
 * Resolves the display name shown on a thank-you card.
 * Anonymous contributions ALWAYS render as "Người ủng hộ ẩn danh", never
 * leaking public_name or account display names.
 */
export function resolveThankYouDonorName({
  publicName,
  isAnonymous,
  fallbackName,
}: {
  publicName?: string | null
  isAnonymous?: boolean | null
  fallbackName?: string | null
}): string {
  if (isAnonymous) return ANONYMOUS_DONOR_CARD_LABEL
  const chosen = publicName?.trim() || fallbackName?.trim() || ""
  return chosen ? truncateCodePoints(chosen, THANK_YOU_DONOR_MAX_CHARS) : DEFAULT_DONOR_CARD_LABEL
}

export interface ThankYouCardInput {
  kind: "donation" | "pledge"
  referenceCode: string
  amount: number
  campaignTitle: string
  campaignSlug: string
  campaignType: CampaignType
  donorName?: string | null
  isAnonymous?: boolean
  createdAt?: string | null
  origin?: string
}

export interface ThankYouCardModel {
  headline: string
  donorName: string
  campaignTitle: string
  typeBadge: string
  /** Formatted VND amount when visible, strictly null when hideAmount is enabled. */
  amountText: string | null
  amountCaption: string
  referenceCode: string
  dateText: string | null
  statementUrlText: string
  footerText: string
}

export function buildThankYouCardModel(input: ThankYouCardInput, options: { hideAmount: boolean }): ThankYouCardModel {
  const donorName = resolveThankYouDonorName({
    publicName: input.donorName,
    isAnonymous: input.isAnonymous,
  })
  const cleanCode = input.referenceCode.trim().toUpperCase()
  const hideAmount = options.hideAmount
  const amountText = hideAmount ? null : formatVnd(input.amount)
  const amountCaption = hideAmount
    ? "Đã xác nhận chung tay (ẩn số tiền)"
    : input.kind === "pledge"
      ? "Đã xác nhận đồng hành"
      : "Đã xác nhận ủng hộ"

  return {
    headline: "Tôi đã chung tay",
    donorName,
    campaignTitle: truncateCodePoints(input.campaignTitle, THANK_YOU_TITLE_MAX_CHARS),
    typeBadge: TYPE_LABELS[input.campaignType],
    amountText,
    amountCaption,
    referenceCode: cleanCode,
    dateText: input.createdAt ? formatDate(input.createdAt) : null,
    statementUrlText: displayShortUrl(input.origin, `/campaigns/${input.campaignSlug}/statement`),
    footerText: "give.vn · Minh bạch từng đồng · Đối chiếu sao kê ngân hàng",
  }
}
