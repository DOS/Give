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
 * The secret is GIVE_RATE_LIMIT_SECRET, else the service-role key (both are
 * server-only and set on every deployment), with a label of its own so the
 * two uses never produce the same MAC. Rotating it only invalidates the
 * stop links already sent; the donor can still stop the plan when signed in.
 */

const LABEL = "give:plan-stop:v1:"
const TOKEN = /^[0-9a-f]{64}$/
/** 16 bytes of the HMAC, base64url. */
const SIGNED = /^([0-9a-f]{64})\.([A-Za-z0-9_-]{22})$/

export function planStopSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.GIVE_RATE_LIMIT_SECRET || env.SUPABASE_SERVICE_ROLE_KEY
  return secret && secret.length >= 16 ? secret : null
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
  secret: string | null = planStopSecret()
): string | null {
  const match = SIGNED.exec(signed ?? "")
  if (!match || !secret) return null
  const given = Buffer.from(match[2], "base64url")
  const expected = mac(match[1], secret)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  return createHash("sha256").update(Buffer.from(match[1], "hex")).digest("hex")
}

/** The bytea literal PostgREST accepts for a hash. */
export function byteaHex(hex: string): string {
  return `\\x${hex}`
}
