import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { createRemoteJWKSet, jwtVerify } from "jose"

import { pkceChallenge } from "./pkce"

/**
 * OAuth 2.1 Authorization Code + PKCE client for the shared DOS Supabase
 * OAuth server (DOS.Me login). Same flow as DOS.AI's app: state, nonce and
 * code_verifier live in short-lived httpOnly cookies; the code is exchanged
 * server-to-server with client_secret_basic.
 */

export interface OidcConfig {
  issuer: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in: number
  token_type: string
}

/** A required OIDC environment variable is unset. Only its name is kept, so it is safe to log. */
export class OidcConfigError extends Error {
  constructor(readonly variable: string) {
    super(`OIDC config error: ${variable} is not set`)
    this.name = "OidcConfigError"
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new OidcConfigError(name)
  return value
}

export function loadOidcConfig(origin: string): OidcConfig {
  return {
    issuer: requireEnv("OIDC_ISSUER").replace(/\/$/, ""),
    clientId: requireEnv("OIDC_CLIENT_ID"),
    clientSecret: requireEnv("OIDC_CLIENT_SECRET"),
    redirectUri: `${origin}/auth/callback`,
  }
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url")
}

export function buildAuthorizeUrl(
  cfg: OidcConfig,
  args: { state: string; nonce: string; codeVerifier: string }
): string {
  const url = new URL(`${cfg.issuer}/oauth/authorize`)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", cfg.clientId)
  url.searchParams.set("redirect_uri", cfg.redirectUri)
  url.searchParams.set("scope", "openid email profile")
  url.searchParams.set("state", args.state)
  url.searchParams.set("nonce", args.nonce)
  url.searchParams.set("code_challenge", pkceChallenge(args.codeVerifier))
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}

/** A non-2xx token response. `code` is Supabase's `error_code` or OAuth's `error`, when present. */
export class TokenRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined
  ) {
    super(`oidc_token_request_failed_${status}`)
    this.name = "TokenRequestError"
  }
}

// Error codes for a refresh token that can never be used again. The Supabase
// OAuth server answers a dead refresh token with its own codes, not OAuth's
// `invalid_grant` (`internal/tokens/service.go`, RefreshTokenGrant); both
// count. Anything else, such as `invalid_client` from a wrong or rotated
// client secret, is a fault on our side, not a session that ended.
const DEAD_REFRESH_CODES = new Set([
  "invalid_grant",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "session_expired",
  "user_banned",
])

/** True when the issuer rejected the refresh token itself, so the session is over. */
export function isDeadRefreshToken(error: unknown): boolean {
  return (
    error instanceof TokenRequestError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.code !== undefined &&
    DEAD_REFRESH_CODES.has(error.code)
  )
}

/**
 * The fields of a failed token request that are safe to log: the HTTP
 * status, the sanitized error code, a missing variable's name and the
 * error's name. Never the message, which could echo a token.
 */
export function tokenFailureLog(error: unknown) {
  return {
    status: error instanceof TokenRequestError ? error.status : undefined,
    code: error instanceof TokenRequestError ? error.code : undefined,
    ...(error instanceof OidcConfigError ? { variable: error.variable } : {}),
    error: error instanceof Error ? error.name : undefined,
  }
}

/** Deadline for a token request when the caller gives none, so a slow issuer cannot stall a request. */
export const TOKEN_TIMEOUT_MS = 5000

async function tokenRequest(
  cfg: OidcConfig,
  body: URLSearchParams,
  signal: AbortSignal = AbortSignal.timeout(TOKEN_TIMEOUT_MS)
): Promise<TokenResponse> {
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")
  const res = await fetch(`${cfg.issuer}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
    cache: "no-store",
    // A redirect would re-send the code or refresh token to another URL.
    redirect: "error",
    signal,
  })
  if (!res.ok) {
    throw new TokenRequestError(res.status, await errorCode(res))
  }
  return (await res.json()) as TokenResponse
}

/**
 * The error code of a failed response: Supabase's `x-sb-error-code` header
 * (sent by every API version), else `error_code` or OAuth's `error` in the
 * body. Only plain snake_case codes are returned, so they are safe to log.
 */
export async function errorCode(res: Response): Promise<string | undefined> {
  const safe = (code: unknown) => (typeof code === "string" && /^[a-z_]{1,64}$/.test(code) ? code : undefined)
  const header = safe(res.headers.get("x-sb-error-code"))
  if (header) return header
  try {
    const body = (await res.json()) as { error_code?: unknown; error?: unknown }
    return safe(body.error_code ?? body.error)
  } catch {
    return undefined
  }
}

export function exchangeCode(cfg: OidcConfig, code: string, codeVerifier: string) {
  return tokenRequest(
    cfg,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: codeVerifier,
    })
  )
}

export function refreshTokens(cfg: OidcConfig, refreshToken: string, signal?: AbortSignal) {
  return tokenRequest(cfg, new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }), signal)
}

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function jwks(issuer: string) {
  let set = jwksByIssuer.get(issuer)
  if (!set) {
    set = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    jwksByIssuer.set(issuer, set)
  }
  return set
}

/**
 * Verifies the id_token's signature, issuer, audience and expiry, and binds
 * it to this browser's login through the nonce. Any failure aborts the login.
 */
export async function verifyIdToken(cfg: OidcConfig, idToken: string, expectedNonce: string): Promise<void> {
  const { payload } = await jwtVerify(idToken, jwks(cfg.issuer), {
    issuer: cfg.issuer,
    audience: cfg.clientId,
    algorithms: ["ES256", "RS256"],
    clockTolerance: 5,
  })
  const nonce = payload.nonce
  if (typeof nonce !== "string" || !timingSafeEqualString(nonce, expectedNonce)) {
    throw new Error("oidc_nonce_mismatch")
  }
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return ha.equals(hb) && a.length === b.length
}
