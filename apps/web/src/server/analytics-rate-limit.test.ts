import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { checkAnalyticsRateLimit, deriveAnalyticsClientKey, resetAnalyticsRateLimit } from "./analytics-rate-limit"

const CAMPAIGN_A = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN_B = "22222222-2222-4222-8222-222222222222"

beforeEach(() => {
  resetAnalyticsRateLimit()
})

describe("analytics rate limiting", () => {
  it("hashes client IP into an opaque key that never contains the raw IP", () => {
    const headers = new Headers({ "x-vercel-forwarded-for": "203.0.113.42, 10.0.0.1" })
    const key1 = deriveAnalyticsClientKey(headers)
    const key2 = deriveAnalyticsClientKey(new Headers({ "x-real-ip": "203.0.113.42" }))
    const keyOther = deriveAnalyticsClientKey(new Headers({ "x-real-ip": "198.51.100.7" }))

    expect(key1).toBe(key2)
    expect(key1).not.toBe(keyOther)
    expect(key1).not.toContain("203.0.113.42")
    expect(key1.length).toBeGreaterThan(20)
  })

  it("groups IPv6 addresses by /64 prefix, normalizes IPv4-mapped IPv6, and rejects malformed IPs", () => {
    const v6a = deriveAnalyticsClientKey(new Headers({ "x-vercel-forwarded-for": "2001:db8:abcd:1234::1" }))
    const v6b = deriveAnalyticsClientKey(new Headers({ "x-vercel-forwarded-for": "2001:db8:abcd:1234:ffff::9999" }))
    const v6OtherPrefix = deriveAnalyticsClientKey(new Headers({ "x-vercel-forwarded-for": "2001:db8:abcd:5678::1" }))
    expect(v6a).toBe(v6b)
    expect(v6a).not.toBe(v6OtherPrefix)

    const v4 = deriveAnalyticsClientKey(new Headers({ "x-real-ip": "203.0.113.42" }))
    const v4Mapped = deriveAnalyticsClientKey(new Headers({ "x-real-ip": "::ffff:203.0.113.42" }))
    expect(v4Mapped).toBe(v4)

    const malformed = deriveAnalyticsClientKey(new Headers({ "x-forwarded-for": "not-an-ip-spoof" }))
    const unknown = deriveAnalyticsClientKey(new Headers())
    expect(malformed).toBe(unknown)
  })

  it("limits repeated view events per (client, campaign) and resets after the 60s window", () => {
    const client = deriveAnalyticsClientKey(new Headers({ "x-real-ip": "203.0.113.10" }))
    const t0 = 1_700_000_000_000

    for (let i = 0; i < 10; i++) {
      expect(checkAnalyticsRateLimit(client, CAMPAIGN_A, "view", t0 + i * 100)).toEqual({ allowed: true })
    }

    const blocked = checkAnalyticsRateLimit(client, CAMPAIGN_A, "view", t0 + 1_500)
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60)
    }

    // Separate campaign still allowed for the same client until the global cap.
    expect(checkAnalyticsRateLimit(client, CAMPAIGN_B, "view", t0 + 2_000)).toEqual({ allowed: true })

    // After the 60s window elapses, CAMPAIGN_A is allowed again.
    expect(checkAnalyticsRateLimit(client, CAMPAIGN_A, "view", t0 + 60_001)).toEqual({ allowed: true })
  })

  it("enforces tighter limit on share_click and a global per-client cap across campaigns", () => {
    const client = deriveAnalyticsClientKey(new Headers({ "x-real-ip": "203.0.113.20" }))
    const t0 = 1_700_000_000_000

    for (let i = 0; i < 6; i++) {
      expect(checkAnalyticsRateLimit(client, CAMPAIGN_A, "share_click", t0)).toEqual({ allowed: true })
    }
    expect(checkAnalyticsRateLimit(client, CAMPAIGN_A, "share_click", t0).allowed).toBe(false)

    // Exhaust the remaining 24 of the 30/min global cap across distinct campaigns.
    for (let i = 0; i < 24; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
      expect(checkAnalyticsRateLimit(client, id, "view", t0)).toEqual({ allowed: true })
    }

    const globalBlocked = checkAnalyticsRateLimit(client, "99999999-9999-4999-8999-999999999999", "view", t0)
    expect(globalBlocked.allowed).toBe(false)
  })
})
