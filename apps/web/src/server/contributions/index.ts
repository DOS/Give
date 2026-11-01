import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"

import { cookieName, isLocalhost } from "@/lib/auth/cookies"
import type { Db } from "@/lib/campaigns"
import { isStatusToken, type ContributionStatus } from "@/lib/contributions"

/**
 * Server side of the donate flow. Money tables are never selected with `*`
 * (the grants refuse it and new columns must stay hidden), so every read
 * lists its columns.
 *
 * Who reads what:
 * - Guests have no database identity. Their status token is checked by
 *   give.get_contribution_status() (API callers that hold the token) or, for
 *   the payment page and its polling, against the stored sha256 under the
 *   service role. The hash is compared here, so it never goes into a query
 *   string.
 * - Signed-in donors read their own contributions with their own token under
 *   RLS (contributions_read).
 * - The campaign's receiving account is readable only by its owner and
 *   finance staff, so the payment details come through the service role,
 *   for a contribution the caller has already proven is theirs.
 */

/** Columns of a contribution the payment page needs. */
const PAYMENT_COLUMNS = "id, campaign_id, intended_amount, received_amount, reference_code, status, created_at"

export interface PaymentContribution {
  id: string
  campaign_id: string
  intended_amount: number
  received_amount: number
  reference_code: string
  status: string
  created_at: string
}

/** The hex form of sha256(token bytes), as give.create_donation stores it in status_token_hash. */
export function statusTokenHash(token: string): string {
  return createHash("sha256").update(Buffer.from(token, "hex")).digest("hex")
}

/**
 * The cookie that keeps a guest's status token for one donation, so its
 * payment page survives a reload and can poll its status without the token
 * ever reaching page script. `__Host-` on deployed hosts stops a sibling
 * subdomain from planting one (it requires Path=/).
 */
export function donationCookie(code: string, hostname: string) {
  return {
    name: cookieName(`give_dn_${code}`, hostname),
    options: { httpOnly: true, secure: !isLocalhost(hostname), sameSite: "lax" as const, path: "/" },
  }
}

/** The hostname from a Host header, as getSession() reads it, so cookie names agree everywhere. */
export function hostnameFrom(host: string | null): string {
  return (host ?? "localhost").replace(/:\d+$/, "")
}

/** At most this many guest donation cookies are kept; Path=/ sends each one with every request. */
export const MAX_DONATION_COOKIES = 20

/**
 * Names of guest donation cookies to drop before adding one more, oldest
 * first (browsers send cookies in creation order), so the request header
 * stays small.
 */
export function donationCookiesToDrop(names: readonly string[]): string[] {
  const own = names.filter((name) => /^(__Host-)?give_dn_GV[0-9A-Z]{6,7}$/.test(name))
  return own.slice(0, Math.max(0, own.length - (MAX_DONATION_COOKIES - 1)))
}

/** The status token in a guest's cookie for this donation, if it looks like one. */
export function donationCookieToken(
  cookies: { get(name: string): { value: string } | undefined },
  code: string,
  hostname: string
): string | null {
  const value = cookies.get(donationCookie(code, hostname).name)?.value
  return isStatusToken(value) ? value : null
}

interface GuestRow extends PaymentContribution {
  status_token_hash: string | null
  status_token_expires_at: string | null
}

// PostgREST returns bytea as a backslash, "x" and the hex digits.
const BYTEA_SHA256 = /^\\x([0-9a-f]{64})$/

/** A guest's donation by reference code, if the status token belongs to it and has not expired. */
export async function guestContribution(
  service: Db,
  code: string,
  token: string | null | undefined,
  now = new Date()
): Promise<PaymentContribution | null> {
  if (!isStatusToken(token)) return null
  const { data, error } = await service
    .from("contributions")
    .select(`${PAYMENT_COLUMNS}, status_token_hash, status_token_expires_at`)
    .eq("reference_code", code)
    .eq("kind", "donation")
    .is("contributor_user_id", null)
    .maybeSingle()
  if (error) throw error
  const row = data as GuestRow | null
  const stored = BYTEA_SHA256.exec(row?.status_token_hash ?? "")?.[1]
  if (!row || !stored || !row.status_token_expires_at || new Date(row.status_token_expires_at) <= now) return null
  if (!timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(statusTokenHash(token), "hex"))) return null
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    intended_amount: row.intended_amount,
    received_amount: row.received_amount,
    reference_code: row.reference_code,
    status: row.status,
    created_at: row.created_at,
  }
}

/** A signed-in donor's own donation by reference code (RLS also lets organizers read, so match the user). */
export async function ownContribution(db: Db, userId: string, code: string): Promise<PaymentContribution | null> {
  const { data, error } = await db
    .from("contributions")
    .select(PAYMENT_COLUMNS)
    .eq("reference_code", code)
    .eq("kind", "donation")
    .eq("contributor_user_id", userId)
    .maybeSingle()
  if (error) throw error
  return data as PaymentContribution | null
}

/** Status of a guest donation by its token; null for a wrong, malformed or expired token. */
export async function guestStatus(service: Db, token: string): Promise<ContributionStatus | null> {
  if (!isStatusToken(token)) return null
  const { data, error } = await service
    .rpc("get_contribution_status", { p_status_token: token })
    .select("status, received_amount")
    .maybeSingle()
  if (error) throw error
  return data as ContributionStatus | null
}

/** Status of a signed-in donor's own donation. */
export async function ownStatus(db: Db, userId: string, code: string): Promise<ContributionStatus | null> {
  const { data, error } = await db
    .from("contributions")
    .select("status, received_amount")
    .eq("reference_code", code)
    .eq("contributor_user_id", userId)
    .maybeSingle()
  if (error) throw error
  return data as ContributionStatus | null
}

/** PostgREST rejected the session token (expired or invalid). */
export function isSessionRejected(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === "PGRST301" || code === "PGRST303"
}

export interface PaymentCampaign {
  id: string
  slug: string
  title: string
  type: "give" | "back"
  status: string
  starts_at: string | null
  ends_at: string | null
}

export async function paymentCampaign(service: Db, campaignId: string): Promise<PaymentCampaign | null> {
  const { data, error } = await service
    .from("campaigns")
    .select("id, slug, title, type, status, starts_at, ends_at")
    .eq("id", campaignId)
    .maybeSingle()
  if (error) throw error
  return data as PaymentCampaign | null
}

/** Mirrors the campaign checks in give.create_donation: a live give campaign inside its dates. */
export function acceptsDonations(
  campaign: Pick<PaymentCampaign, "type" | "status" | "starts_at" | "ends_at">,
  now = new Date()
): boolean {
  return (
    campaign.type === "give" &&
    campaign.status === "live" &&
    (!campaign.starts_at || new Date(campaign.starts_at) <= now) &&
    (!campaign.ends_at || new Date(campaign.ends_at) > now)
  )
}

export interface PaymentAccount {
  bank_bin: string
  account_number: string
  account_name: string
}

interface BindingRow {
  bound_at: string
  account: {
    channel: string
    bank_bin: string | null
    account_number: string | null
    account_name: string | null
    verification_status: string
  } | null
  campaign: { organizer: { verification_status: string; legal_name: string } | null } | null
}

// The combining diacritical marks block, U+0300 to U+036F, as in give.normalize_person_name.
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g")

/**
 * give.normalize_person_name in TypeScript: drop Vietnamese tones and other
 * accents, map đ/Đ to D, upper-case, and keep letters and digits separated by
 * single spaces. The service role may not execute the database function.
 * Wherever the two could differ, this one is the stricter.
 */
export function normalizePersonName(name: string): string | null {
  const normalized = name
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    // ASCII letters only: JS maps a few other letters to ASCII ("ß" -> "SS")
    // where Postgres may not, and a mismatch must hide details, not show them.
    .replace(/[a-z]+/g, (letters) => letters.toUpperCase())
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
  return normalized === "" ? null : normalized
}

/** give.account_name_matches: both names normalise to the same non-empty value. */
export function accountNameMatches(accountName: string | null, legalName: string | null): boolean {
  const a = normalizePersonName(accountName ?? "")
  return a !== null && a === normalizePersonName(legalName ?? "")
}

/**
 * The bank account a donor pays into, under the rule give.create_donation
 * applies: an active binding to a verified bank account whose name matches
 * the verified organizer's legal name. The oldest such binding wins. When
 * none qualifies Give shows no payment details at all, also for donations
 * created earlier.
 */
export async function paymentAccount(service: Db, campaignId: string): Promise<PaymentAccount | null> {
  const { data, error } = await service
    .from("account_bindings")
    .select(
      "bound_at, account:receiving_accounts(channel, bank_bin, account_number, account_name, verification_status), campaign:campaigns(organizer:organizers(verification_status, legal_name))"
    )
    .eq("campaign_id", campaignId)
    .is("released_at", null)
    .order("bound_at")
  if (error) throw error
  for (const row of (data ?? []) as unknown as BindingRow[]) {
    const a = row.account
    const organizer = row.campaign?.organizer
    if (
      a &&
      organizer?.verification_status === "verified" &&
      a.channel !== "crypto" &&
      a.verification_status === "verified" &&
      a.bank_bin &&
      a.account_number &&
      accountNameMatches(a.account_name, organizer.legal_name)
    ) {
      return { bank_bin: a.bank_bin, account_number: a.account_number, account_name: a.account_name ?? "" }
    }
  }
  return null
}
