"use client"

import { sanitizeReferrer, vietnamDateString, type AnalyticsEventType } from "./analytics"

const ANALYTICS_ENDPOINT = "/api/analytics/event"
const VIEW_STORAGE_KEY = "give:campaign_views"
const MAX_STORED_ENTRIES = 100

// In-memory dedup guards against React StrictMode double effects and browsers
// where localStorage is blocked (e.g. strict private browsing).
const viewedInMemory = new Set<string>()

function readTodayViews(today: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const fresh: Record<string, string> = {}
    for (const [id, day] of Object.entries(parsed as Record<string, unknown>)) {
      if (day === today) fresh[id] = today
    }
    return fresh
  } catch {
    return {}
  }
}

function markViewedInStorage(campaignId: string, today: string) {
  try {
    const map = readTodayViews(today)
    map[campaignId] = today
    const entries = Object.entries(map)
    const trimmed = entries.length > MAX_STORED_ENTRIES ? entries.slice(-MAX_STORED_ENTRIES) : entries
    window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmed)))
  } catch {
    // Storage may be unavailable or full; in-memory dedup still applies.
  }
}

/**
 * Fires a non-blocking, zero-PII analytics beacon. Prefers `navigator.sendBeacon`
 * so share clicks and quick navigations survive page unload; falls back to
 * `fetch(..., { keepalive: true, credentials: "omit" })`. Never throws.
 */
export function sendAnalyticsEvent(payload: {
  campaignId: string
  event: AnalyticsEventType
  referrer?: string | null
}): void {
  try {
    const body = JSON.stringify({
      campaignId: payload.campaignId,
      event: payload.event,
      ...(payload.event === "view" ? { referrer: payload.referrer ?? null } : {}),
    })

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" })
      if (navigator.sendBeacon(ANALYTICS_ENDPOINT, blob)) return
    }

    if (typeof fetch === "function") {
      void fetch(ANALYTICS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "omit",
      }).catch(() => {})
    }
  } catch {
    // Analytics must never interrupt the user experience.
  }
}

/**
 * Records at most one view per campaign per Vietnam calendar day per browser.
 * Extracts only the referrer hostname before sending so URL paths and query
 * parameters never leave the browser.
 */
export function trackCampaignView(campaignId: string, now = new Date()): boolean {
  if (typeof window === "undefined") return false
  const today = vietnamDateString(now)
  const memKey = `${campaignId}:${today}`
  if (viewedInMemory.has(memKey)) return false

  const stored = readTodayViews(today)
  if (stored[campaignId] === today) {
    viewedInMemory.add(memKey)
    return false
  }

  viewedInMemory.add(memKey)
  markViewedInStorage(campaignId, today)

  const ownHost = window.location?.hostname ? [window.location.hostname] : []
  const referrer = sanitizeReferrer(typeof document !== "undefined" ? document.referrer : null, ownHost)
  sendAnalyticsEvent({ campaignId, event: "view", referrer })
  return true
}

/** Records a campaign share-button click without blocking the share UI. */
export function trackShareClick(campaignId: string): void {
  sendAnalyticsEvent({ campaignId, event: "share_click" })
}

/** Resets the in-memory view cache (for tests). */
export function resetViewedMemoryCache(): void {
  viewedInMemory.clear()
}
