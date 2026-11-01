import "server-only"

import { createHash } from "node:crypto"

import { isLocalhost } from "@/lib/auth/cookies"
import type { Db } from "@/lib/campaigns"
import { isStatusToken, type ContributionStatus } from "@/lib/contributions"

/**
 * Server side of the donate flow. Money tables are never selected with `*`
 * (the grants refuse it and new columns must stay hidden), so every read
 * lists its columns.
 *
 * Who reads what:
 * - Guests have no database identity. Their status token is checked by
 *   give.get_contribution_status() or by its sha256 under the service role.
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
 * The cookie that keeps a guest's status token for one donation, so the
 * payment page survives a reload. It is sent only to that donation's page.
 * Deployed hosts use the `__Secure-` prefix (`__Host-` would force Path=/).
 */
export function donationCookie(code: string, hostname: string) {
  const local = isLocalhost(hostname)
  return {
    name: `${local ? "" : "__Secure-"}give_dn_${code}`,
    options: { httpOnly: true, secure: !local, sameSite: "lax" as const, path: `/donations/${code}` },
  }
}

/** A guest's donation by reference code, if the status token belongs to it and has not expired. */
export async function guestContribution(
  service: Db,
  code: string,
  token: string | undefined,
  now = new Date()
): Promise<PaymentContribution | null> {
  if (!isStatusToken(token)) return null
  const { data, error } = await service
    .from("contributions")
    .select(PAYMENT_COLUMNS)
    .eq("reference_code", code)
    .eq("kind", "donation")
    .eq("status_token_hash", `\\x${statusTokenHash(token)}`)
    .gt("status_token_expires_at", now.toISOString())
    .maybeSingle()
  if (error) throw error
  return data as PaymentContribution | null
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

/** Mirrors the checks in give.create_donation: a live give campaign inside its dates. */
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
}

/**
 * The bank account a donor pays into: the campaign's oldest active binding to
 * a verified bank account. give.create_donation also checks the organizer and
 * the account name; this only decides what to show.
 */
export async function paymentAccount(service: Db, campaignId: string): Promise<PaymentAccount | null> {
  const { data, error } = await service
    .from("account_bindings")
    .select(
      "bound_at, account:receiving_accounts(channel, bank_bin, account_number, account_name, verification_status)"
    )
    .eq("campaign_id", campaignId)
    .is("released_at", null)
    .order("bound_at")
  if (error) throw error
  for (const row of (data ?? []) as unknown as BindingRow[]) {
    const a = row.account
    if (a && a.channel !== "crypto" && a.verification_status === "verified" && a.bank_bin && a.account_number) {
      return { bank_bin: a.bank_bin, account_number: a.account_number, account_name: a.account_name ?? "" }
    }
  }
  return null
}
