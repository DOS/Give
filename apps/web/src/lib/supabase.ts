import "server-only"

import { createClient } from "@supabase/supabase-js"

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const clientOptions = {
  db: { schema: "give" },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const

/**
 * A client that acts as the signed-in user (or anon when no token): every
 * query runs under RLS with the user's verified JWT.
 */
export function dbAs(accessToken?: string) {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    ...clientOptions,
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  })
}

/**
 * Service-role client. Bypasses RLS: use it only after checking ownership
 * with dbAs(), and only for what users may not do directly (media uploads,
 * cron activation).
 */
export function dbService() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), clientOptions)
}

/** Private bucket: objects are served only through the /media routes. */
export const MEDIA_BUCKET = "give-media"
