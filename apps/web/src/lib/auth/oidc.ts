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

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`OIDC config error: ${name} is not set`)
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

async function tokenRequest(cfg: OidcConfig, body: URLSearchParams): Promise<TokenResponse> {
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")
  const res = await fetch(`${cfg.issuer}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`oidc_token_request_failed_${res.status}`)
  }
  return (await res.json()) as TokenResponse
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

export function refreshTokens(cfg: OidcConfig, refreshToken: string) {
  return tokenRequest(cfg, new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }))
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
