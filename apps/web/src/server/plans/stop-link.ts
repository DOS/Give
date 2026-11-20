import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"

/**
 * Stop links of monthly plan reminders (DOS/Give#276, design 4.3.4,
 * give.cancel_donation_plan_by_token). give.claim_outbox mints a random
 * 32-byte token per reminder email and keeps only its SHA-256; the email
 * carries `<token hex>.<signature>`, where the signature is an HMAC-SHA256
 * of the token under a server secret. The routes check the signature before
 * touching the database, so a guessed or mangled link is turned away
 * cheaply; the token's hash is what the database checks (single use, 60
 * days, plan still active).
 *
 * The secret is GIVE_RATE_LIMIT_SECRET, under a label of its own so the two
 * uses never produce the same MAC. Production requires it (at least 32
 * characters, as the rate limit does) and logs an error without it: every
 * service on the shared Supabase project holds the service-role key, so it
 * is never a fallback there. Elsewhere (previews, local) the service-role key
 * stands in when it is not set. To rotate it without breaking the links
 * already sent (60 days), put the old value in
 * GIVE_RATE_LIMIT_SECRET_PREVIOUS: links are signed with the current secret
 * and verified against both.
 */

const LABEL = "give:plan-stop:v1:"
const TOKEN = /^[0-9a-f]{64}$/
/** 16 bytes of the HMAC, base64url. */
const SIGNED = /^([0-9a-f]{64})\.([A-Za-z0-9_-]{22})$/

type Env = Record<string, string | undefined>

/** The secrets a link may be signed with: the current one first, then the previous one (rotation). */
export function planStopSecrets(env: Env = process.env): string[] {
  const production = env.VERCEL_ENV === "production"
  const min = production ? 32 : 16
  const usable = (value: string | undefined) => (value && value.length >= min ? value : null)
  const current = usable(env.GIVE_RATE_LIMIT_SECRET) ?? (production ? null : usable(env.SUPABASE_SERVICE_ROLE_KEY))
  if (!current) {
    if (production) console.error("plan stop links: GIVE_RATE_LIMIT_SECRET is not set or shorter than 32 characters")
    return []
  }
  const previous = usable(env.GIVE_RATE_LIMIT_SECRET_PREVIOUS)
  return previous && previous !== current ? [current, previous] : [current]
}

/** The secret new links are signed with, or null when none is configured. */
export function planStopSecret(env: Env = process.env): string | null {
  return planStopSecrets(env)[0] ?? null
}

function mac(token: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(LABEL + token)
    .digest()
    .subarray(0, 16)
}

/** `<token>.<signature>` for an email link, or null when the token or the secret is missing. */
export function signStopToken(token: string | null, secret: string | null = planStopSecret()): string | null {
  if (!token || !TOKEN.test(token) || !secret) return null
  return `${token}.${mac(token, secret).toString("base64url")}`
}

/**
 * The token of a signed link whose signature checks out, as the hex form of
 * its SHA-256 that the database stores (pass it as `\x<hex>`). Null for
 * anything else.
 */
export function verifiedStopTokenHash(
  signed: string | null | undefined,
  secrets: string | string[] | null = planStopSecrets()
): string | null {
  const match = SIGNED.exec(signed ?? "")
  const keys = secrets === null ? [] : Array.isArray(secrets) ? secrets : [secrets]
  if (!match || keys.length === 0) return null
  const given = Buffer.from(match[2], "base64url")
  const valid = keys.some((key) => {
    const expected = mac(match[1], key)
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
  if (!valid) return null
  return createHash("sha256").update(Buffer.from(match[1], "hex")).digest("hex")
}
/** The bytea literal PostgREST accepts for a hash. */
export function byteaHex(hex: string): string {
  return `\\x${hex}`
}
