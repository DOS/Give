import "server-only"

import { decodeJwt } from "jose"

import { loadOidcConfig, refreshTokens } from "./oidc"
import { needsRefresh } from "./token"

/**
 * Ends this browser's session at the DOS.Me issuer, so its refresh token
 * stops working. The Supabase OAuth server has no RFC 7009 revocation
 * endpoint, so this calls Supabase Auth's own `POST /logout?scope=local`
 * with the session's access token: that deletes the session the token's
 * `session_id` names, and its refresh tokens with it. `scope=local` keeps the
 * user signed in to other DOS apps.
 *
 * Never throws. Failures are logged without any token, and the caller clears
 * the cookies either way.
 */

export type RevokeResult = "revoked" | "skipped" | "failed"

const TIMEOUT_MS = 5000
const NIL_UUID = "00000000-0000-0000-0000-000000000000"

export async function endIssuerSession(
  origin: string,
  tokens: { access?: string; refresh?: string }
): Promise<RevokeResult> {
  if (!tokens.access && !tokens.refresh) return "skipped"

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  let issuer: string
  try {
    issuer = loadOidcConfig(origin).issuer
    if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set")
  } catch (error) {
    return fail("config", error)
  }

  let access = tokens.access
  if (needsRefresh(access) && tokens.refresh) {
    try {
      access = (await refreshTokens(loadOidcConfig(origin), tokens.refresh)).access_token
    } catch (error) {
      // The issuer rejected the refresh token, so it is already unusable.
      if (error instanceof Error && /_(400|401)$/.test(error.message)) return "skipped"
      return fail("refresh", error)
    }
  }
  if (!access || needsRefresh(access, 0)) return fail("no_access_token")

  // Without a session_id claim, Supabase's /logout falls back to signing the
  // user out of every session, every app. Never send such a token.
  if (!hasSessionId(access)) return fail("no_session_id")

  try {
    const res = await fetch(`${issuer}/logout?scope=local`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.ok) return "revoked"
    // The session is already gone, so its refresh tokens are too.
    if (res.status === 403 && (await errorCode(res)) === "session_not_found") return "revoked"
    return fail(`status_${res.status}`)
  } catch (error) {
    return fail("network", error)
  }
}

function hasSessionId(token: string): boolean {
  try {
    const sid = decodeJwt(token).session_id
    return typeof sid === "string" && sid !== "" && sid !== NIL_UUID
  } catch {
    return false
  }
}

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error_code?: unknown }
    return typeof body.error_code === "string" ? body.error_code : undefined
  } catch {
    return undefined
  }
}

/** Logs the reason and the error's name only: messages could echo a token. */
function fail(reason: string, error?: unknown): RevokeResult {
  console.warn("auth.logout.revoke_failed", { reason, error: error instanceof Error ? error.name : undefined })
  return "failed"
}
