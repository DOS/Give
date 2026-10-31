/**
 * Cookie names and attributes for the login flow and the session.
 *
 * Deployed environments use the `__Host-` prefix, which the browser only
 * accepts when the cookie is Secure, has no Domain and has Path=/. That stops
 * a sibling subdomain from planting cookies for this host (cookie tossing).
 * localhost keeps plain names because `__Host-` requires Secure and local dev
 * runs over http.
 */

export const SESSION_ACCESS = "give_at"
export const SESSION_REFRESH = "give_rt"
export const FLOW_STATE = "give_oidc_state"
export const FLOW_NONCE = "give_oidc_nonce"
export const FLOW_VERIFIER = "give_oidc_verifier"
export const FLOW_RETURN = "give_oidc_return"

export const FLOW_TTL_SECONDS = 10 * 60
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60

export function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1"
}

export function cookieName(base: string, hostname: string): string {
  return isLocalhost(hostname) ? base : `__Host-${base}`
}

export function cookieOptions(hostname: string, maxAge: number) {
  return {
    httpOnly: true,
    secure: !isLocalhost(hostname),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  }
}
