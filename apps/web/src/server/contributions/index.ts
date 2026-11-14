import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { isIP } from "node:net"

import { cookieName, isLocalhost } from "@/lib/auth/cookies"
import type { Db } from "@/lib/campaigns"
import { isStatusToken, type ContributionStatus } from "@/lib/contributions"
import { isDonationCode } from "@/server/vietqr"

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
 * payment page survives a reload and can poll its status without putting the
 * token in the page URL (a saved tracking link exchanges its token back into
 * this cookie and redirects cleanly, DOS/Give#50). `__Host-` on deployed
 * hosts stops a sibling subdomain from planting one (it requires Path=/).
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

/**
 * The client's network address for the donation rate limit, from
 * x-real-ip, else the first x-forwarded-for entry. These are only as good as
 * the proxy that sets them: Vercel overwrites both, but Next.js alone keeps
 * whatever the client sent, so requestClientKeys reads them only on Vercel
 * deployments. A CDN in front of Vercel would make every visitor look like
 * the CDN.
 *
 * An IPv6 address counts as its /64 network, since one connection usually
 * holds a whole /64 (a wider prefix would put many mobile subscribers in one
 * bucket); an IPv4-mapped IPv6 address counts as its IPv4 address. Null when
 * neither header holds an address.
 */
export function clientAddress(headers: { get(name: string): string | null }): string | null {
  for (const raw of [headers.get("x-real-ip"), headers.get("x-forwarded-for")?.split(",")[0]]) {
    const address = normalizeAddress(raw?.trim().replace(/%.*$/, "") ?? "")
    if (address) return address
  }
  return null
}

function normalizeAddress(ip: string): string | null {
  if (isIP(ip) === 4) return ip
  if (isIP(ip) !== 6) return null
  const groups = ipv6Groups(ip)
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join(".")
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`
}

/** The eight 16-bit groups of a valid IPv6 address (isIP has checked it). */
function ipv6Groups(ip: string): number[] {
  const parts = (s: string) =>
    s === ""
      ? []
      : s.split(":").flatMap((p) => {
          if (!p.includes(".")) return [parseInt(p, 16)]
          const [a, b, c, d] = p.split(".").map(Number)
          return [(a << 8) | b, (c << 8) | d]
        })
  const [head, tail] = ip.split("::")
  const left = parts(head)
  if (tail === undefined) return left
  const right = parts(tail)
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right]
}

/**
 * The wider network give.create_donation also counts a guest under: the /48
 * of an IPv6 /64, which one site or tunnel commonly holds whole, so rotating
 * through its 65,536 /64 networks does not multiply the limit. Null for IPv4.
 */
export function clientNetwork(address: string | null): string | null {
  const match = /^([0-9a-f]+:[0-9a-f]+:[0-9a-f]+):[0-9a-f]+::\/64$/.exec(address ?? "")
  return match ? `${match[1]}::/48` : null
}

/**
 * The key give.create_donation counts a guest's donations under: an
 * HMAC-SHA256 of the address under a server secret, so the database never
 * sees the address and, without the secret, nobody can turn a key back into
 * one by trying every IPv4 address. Null when the address or the secret is
 * missing; the database then counts the guest in one shared bucket per
 * campaign.
 */
export function donationClientKey(address: string | null, secret: string | undefined): string | null {
  if (!address || !secret) return null
  return createHmac("sha256", secret).update(`give:donation-rate:${address}`).digest("hex")
}

export interface DonationClientKeys {
  clientKey: string | null
  networkKey: string | null
}

/**
 * The rate-limit keys for this request. Only Vercel production and preview
 * deployments get keys: elsewhere (`next start`, or `vercel env pull` output,
 * which sets VERCEL=1 but VERCEL_ENV=development) the address headers are the
 * client's own. The secret is GIVE_RATE_LIMIT_SECRET; previews may fall back to
 * the service-role key, Production may not, since every service on the shared
 * project holds that key. Rotating the secret only restarts the counts.
 */
export function requestClientKeys(headers: { get(name: string): string | null }): DonationClientKeys {
  const deployment = process.env.VERCEL_ENV
  if (deployment !== "production" && deployment !== "preview") return { clientKey: null, networkKey: null }
  const secret =
    process.env.GIVE_RATE_LIMIT_SECRET || (deployment === "preview" ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined)
  const address = clientAddress(headers)
  const keys = {
    clientKey: donationClientKey(address, secret),
    networkKey: donationClientKey(clientNetwork(address), secret),
  }
  if (!keys.clientKey) {
    // Without a key every guest of a campaign shares one bucket, which one
    // visitor can fill. Say so where the logs are watched.
    console.error(
      `donation rate limit: no client key on ${deployment} (${secret ? "no address header" : "GIVE_RATE_LIMIT_SECRET is not set"})`
    )
  }
  return keys
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

export interface GuestContributionAccess {
  donation: PaymentContribution
  expiresAt: Date
}

/**
 * A guest's donation and token expiry by reference code, if the status token
 * belongs to it and has not expired. Selects payment-status columns only
 * (never donor name, email or message) and compares the token hash in
 * constant time.
 */
export async function guestContributionAccess(
  service: Db,
  code: string,
  token: string | null | undefined,
  now = new Date()
): Promise<GuestContributionAccess | null> {
  if (!isDonationCode(code) || !isStatusToken(token)) return null
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
  const expiresAt = row?.status_token_expires_at ? new Date(row.status_token_expires_at) : null
  if (!row || !stored || !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= now) return null
  if (!timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(statusTokenHash(token), "hex"))) return null
  return {
    donation: {
      id: row.id,
      campaign_id: row.campaign_id,
      intended_amount: row.intended_amount,
      received_amount: row.received_amount,
      reference_code: row.reference_code,
      status: row.status,
      created_at: row.created_at,
    },
    expiresAt,
  }
}

/** A guest's donation by reference code, if the status token belongs to it and has not expired. */
export async function guestContribution(
  service: Db,
  code: string,
  token: string | null | undefined,
  now = new Date()
): Promise<PaymentContribution | null> {
  return (await guestContributionAccess(service, code, token, now))?.donation ?? null
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
  /** Back campaigns: set while a moderator stopped the payment requests (DOS/Give#89). */
  payments_stopped_at: string | null
  payments_stopped_note: string | null
}

export async function paymentCampaign(service: Db, campaignId: string): Promise<PaymentCampaign | null> {
  const { data, error } = await service
    .from("campaigns")
    .select("id, slug, title, type, status, starts_at, ends_at, payments_stopped_at, payments_stopped_note")
    .eq("id", campaignId)
    .maybeSingle()
  if (error) throw error
  return data as PaymentCampaign | null
}

/**
 * A live give campaign inside its dates, as give.create_donation checks it.
 * Pages use it for wording (closed or not ready yet) and to skip the account
 * lookup; it can only hide payment details, never show more than
 * give.payment_account() in paymentAccount() allows.
 */
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

interface PaymentAccountRow {
  channel: string
  bank_bin: string | null
  account_number: string | null
  account_name: string | null
}

/**
 * The bank account a donor pays into. give.payment_account() returns the
 * account give.create_donation accepts a donation for right now (a live give
 * campaign inside its dates, an active binding to a verified account, the
 * organizer verified, a bank account still in the organizer's legal name),
 * so the rule lives in the database only. Give shows bank transfers only, so
 * a wallet counts as no payment details. When there are none Give shows no
 * payment details at all, also for donations created earlier.
 */
export async function paymentAccount(service: Db, campaignId: string): Promise<PaymentAccount | null> {
  const { data, error } = await service
    .rpc("payment_account", { p_campaign_id: campaignId })
    .select("channel, bank_bin, account_number, account_name")
    .maybeSingle()
  if (error) throw error
  const a = data as PaymentAccountRow | null
  if (!a || a.channel === "crypto" || !a.bank_bin || !a.account_number) return null
  return { bank_bin: a.bank_bin, account_number: a.account_number, account_name: a.account_name ?? "" }
}
