import { decodeJwt } from "jose"

export interface SessionUser {
  id: string
  email: string | null
  name: string | null
}

/**
 * Reads the user from an access token WITHOUT verifying it. Use this only to
 * decide what to render; every read and write that matters goes to Supabase
 * with the same token, and PostgREST verifies it before RLS runs.
 */
export function userFromAccessToken(token: string | undefined): SessionUser | null {
  if (!token) return null
  try {
    const claims = decodeJwt(token)
    if (typeof claims.sub !== "string") return null
    const meta = (claims.user_metadata ?? {}) as Record<string, unknown>
    const name = [meta.full_name, meta.name, meta.preferred_username].find((v) => typeof v === "string")
    return {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      name: typeof name === "string" ? name : null,
    }
  } catch {
    return null
  }
}

/** True when the token is missing, malformed, or expires within `skewSeconds`. */
export function needsRefresh(token: string | undefined, skewSeconds = 60, nowSeconds = Date.now() / 1000): boolean {
  if (!token) return true
  try {
    const { exp } = decodeJwt(token)
    return typeof exp !== "number" || exp - skewSeconds <= nowSeconds
  } catch {
    return true
  }
}
