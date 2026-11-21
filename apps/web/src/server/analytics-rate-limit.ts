import "server-only"

import { createHmac, randomBytes } from "node:crypto"

import type { AnalyticsEventType } from "@/lib/analytics"
import { clientAddress } from "@/server/contributions"

const WINDOW_MS = 60_000
const MAX_BUCKETS = 10_000

const EVENT_LIMITS: Record<AnalyticsEventType, number> = {
  view: 10,
  share_click: 6,
}
const CLIENT_GLOBAL_LIMIT = 30

interface Bucket {
  count: number
  resetAt: number
}

// Per-process ephemeral secret: hashes client IP in RAM only, rotates on every
// cold start, and is never persisted or logged.
const EPHEMERAL_KEY = randomBytes(32)
const buckets = new Map<string, Bucket>()

function hashKey(parts: string[]): string {
  return createHmac("sha256", EPHEMERAL_KEY).update(parts.join("\0")).digest("base64url")
}

function pruneExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

function consumeBucket(key: string, limit: number, now: number): { allowed: boolean; retryAfterSeconds: number } {
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    // Delete expired key first so re-insertion moves it to the Map tail and
    // capacity eviction always drops genuinely oldest entries first.
    if (existing) buckets.delete(key)
    if (buckets.size >= MAX_BUCKETS) {
      pruneExpired(now)
      // If still at capacity under a distributed flood, evict oldest entries.
      if (buckets.size >= MAX_BUCKETS) {
        const excess = buckets.size - MAX_BUCKETS + 1
        let removed = 0
        for (const oldestKey of buckets.keys()) {
          buckets.delete(oldestKey)
          removed += 1
          if (removed >= excess) break
        }
      }
    }
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    return { allowed: false, retryAfterSeconds }
  }

  existing.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

/**
 * Derives a privacy-preserving, ephemeral per-client rate-limit key from
 * proxy headers. Validates and canonicalizes IPv4 / IPv6 `/64` / IPv4-mapped
 * addresses via `clientAddress` (preferring `x-vercel-forwarded-for` first),
 * then immediately HMAC-hashes the normalized address so raw IPs are never
 * stored or returned.
 */
export function deriveAnalyticsClientKey(headers: Pick<Headers, "get">): string {
  const vercelFirst = headers.get("x-vercel-forwarded-for")?.split(",")[0] ?? null
  const normalized =
    (vercelFirst ? clientAddress({ get: (name) => (name === "x-real-ip" ? vercelFirst : null) }) : null) ??
    clientAddress(headers)
  return hashKey(["client", normalized ?? "unknown"])
}

/**
 * Enforces both a per-client global cap and a per-(client, campaign, event)
 * cap in ephemeral process memory.
 */
export function checkAnalyticsRateLimit(
  clientKey: string,
  campaignId: string,
  event: AnalyticsEventType,
  now = Date.now()
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const globalKey = hashKey(["global", clientKey])
  const existingGlobal = buckets.get(globalKey)
  if (existingGlobal && existingGlobal.resetAt > now && existingGlobal.count >= CLIENT_GLOBAL_LIMIT) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existingGlobal.resetAt - now) / 1000)) }
  }

  const scopedKey = hashKey(["scoped", clientKey, campaignId, event])
  const scoped = consumeBucket(scopedKey, EVENT_LIMITS[event], now)
  if (!scoped.allowed) return { allowed: false, retryAfterSeconds: scoped.retryAfterSeconds }

  const globalResult = consumeBucket(globalKey, CLIENT_GLOBAL_LIMIT, now)
  if (!globalResult.allowed) return { allowed: false, retryAfterSeconds: globalResult.retryAfterSeconds }

  return { allowed: true }
}

/** Clears in-memory buckets (for tests). */
export function resetAnalyticsRateLimit() {
  buckets.clear()
}
