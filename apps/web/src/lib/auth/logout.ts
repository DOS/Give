import "server-only"

import { decodeJwt } from "jose"

import { errorCode, loadOidcConfig, refreshTokens, TokenRequestError } from "./oidc"
import { needsRefresh } from "./token"

/**
 * Ends this browser's session at the DOS.Me issuer, so its refresh token
 * stops working. The Supabase OAuth server has no RFC 7009 revocation
 * endpoint, so this calls Supabase Auth's own `POST /logout?scope=local`
 * with the session's access token: that deletes the session the token's
 * `session_id` names, and its refresh tokens with it. `scope=local` keeps the
 * user signed in to other DOS apps.
 *
 * Never throws, and gives up after TIMEOUT_MS in total. Failures are logged
 * without any token, and the caller clears the cookies either way.
 */

export type RevokeResult = "revoked" | "skipped" | "failed"

const TIMEOUT_MS = 5000
// Refresh only a token that would expire before /logout verifies it.
const EXPIRY_SKEW_SECONDS = 5
const NIL_UUID = "00000000-0000-0000-0000-000000000000"
// Supabase error codes for a refresh token that can no longer be used, so
// there is nothing left to revoke. Anything else (bad client credentials, a
// misconfigured grant) is a failure worth logging.
const DEAD_REFRESH_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "session_expired",
  "user_banned",
])

export async function endIssuerSession(
  origin: string,
  tokens: { access?: string; refresh?: string }
): Promise<RevokeResult> {
  if (!tokens.access && !tokens.refresh) return "skipped"

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  let cfg: ReturnType<typeof loadOidcConfig>
  try {
    cfg = loadOidcConfig(origin)
    if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set")
  } catch (error) {
    return fail("config", error)
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS)
  let access = tokens.access
  if (needsRefresh(access, EXPIRY_SKEW_SECONDS)) {
    if (!tokens.refresh) return fail("no_access_token")
    try {
      access = (await refreshTokens(cfg, tokens.refresh, signal)).access_token
    } catch (error) {
      if (error instanceof TokenRequestError && error.code && DEAD_REFRESH_CODES.has(error.code)) return "skipped"
      const reason =
        error instanceof TokenRequestError ? `refresh_${error.status}_${error.code ?? "unknown"}` : "refresh"
      return fail(reason, error)
    }
  }

  // Without a session_id claim, Supabase's /logout falls back to signing the
  // user out of every session, every app. Never send such a token.
  if (!access || !hasSessionId(access)) return fail("no_session_id")

  try {
    const res = await fetch(`${cfg.issuer}/logout?scope=local`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, apikey: anonKey },
      cache: "no-store",
      redirect: "error",
      signal,
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

/** Logs the reason and the error's name only: messages could echo a token. */
function fail(reason: string, error?: unknown): RevokeResult {
  console.warn("auth.logout.revoke_failed", { reason, error: error instanceof Error ? error.name : undefined })
  return "failed"
}
