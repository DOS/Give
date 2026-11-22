import type { CampaignType, Db } from "./campaigns"

export type AnalyticsEventType = "view" | "share_click"
export type ReferrerBucket = "direct" | "facebook.com" | "zalo" | "google" | "other"
export type CampaignManageTab = "manage" | "analytics" | "team"

export const ANALYTICS_PERIODS = [7, 30, 90] as const
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number]
export const DEFAULT_ANALYTICS_DAYS: AnalyticsPeriod = 30

export interface AnalyticsTotals {
  views: number
  share_clicks: number
  contributions_count: number
  contributions_amount: number
  conversion_rate: number
}

export interface AnalyticsDailyPoint {
  date: string
  views: number
  share_clicks: number
  contributions_count: number
  contributions_amount: number
}

export interface AnalyticsReferrerRow {
  bucket: ReferrerBucket
  views: number
}

export interface CampaignAnalytics {
  campaign_id: string
  campaign_type: CampaignType
  days: number
  start_date: string
  end_date: string
  totals: AnalyticsTotals
  daily: AnalyticsDailyPoint[]
  referrers: AnalyticsReferrerRow[]
}

export const REFERRER_LABELS: Record<ReferrerBucket, string> = {
  direct: "Truy cập trực tiếp",
  "facebook.com": "Facebook",
  zalo: "Zalo",
  google: "Google",
  other: "Nguồn khác",
}

const VALID_BUCKETS = new Set<string>(Object.keys(REFERRER_LABELS))
const MAX_REFERRER_LENGTH = 2048
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000

const countFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })
const percentFormat = new Intl.NumberFormat("vi-VN", {
  style: "percent",
  maximumFractionDigits: 1,
})

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function parseCampaignManageTab(raw: string | string[] | undefined): CampaignManageTab {
  const value = firstParam(raw)
  if (value === "analytics") return "analytics"
  if (value === "team") return "team"
  return "manage"
}

export function parseAnalyticsDays(raw: string | string[] | undefined): AnalyticsPeriod {
  const value = Number(firstParam(raw))
  if (value === 7 || value === 30 || value === 90) return value
  return DEFAULT_ANALYTICS_DAYS
}

export function analyticsTabHref(campaignId: string, days: AnalyticsPeriod = DEFAULT_ANALYTICS_DAYS): string {
  const params = new URLSearchParams({ tab: "analytics" })
  if (days !== DEFAULT_ANALYTICS_DAYS) params.set("days", String(days))
  return `/me/campaigns/${campaignId}?${params.toString()}`
}

/** Today's YYYY-MM-DD date in Vietnam time (Asia/Ho_Chi_Minh, UTC+7). */
export function vietnamDateString(now = new Date()): string {
  return new Date(now.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10)
}

/** Formats an integer count for Vietnamese readers, e.g. 1240 -> "1.240". */
export function formatCount(value: number): string {
  return countFormat.format(Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0)
}

/**
 * Formats conversion_rate (contributions / views, 0..N). Returns "—" when there
 * are no views yet, and "< 0,1%" for tiny non-zero ratios so real conversions
 * never round down to a misleading "0%".
 */
export function formatConversionRate(rate: number, views: number): string {
  if (!(views > 0) || !Number.isFinite(rate) || rate < 0) return "—"
  if (rate > 0 && rate < 0.001) return "< 0,1%"
  return percentFormat.format(rate)
}

/** Formats a YYYY-MM-DD Vietnam date as DD/MM/YYYY. */
export function formatAnalyticsDate(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return dateStr
  return `${match[3]}/${match[2]}/${match[1]}`
}

/** Formats a YYYY-MM-DD Vietnam date as DD/MM for compact chart axis labels. */
export function formatAnalyticsShortDate(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return dateStr
  return `${match[3]}/${match[2]}`
}

export function referrerLabel(bucket: string): string {
  if (bucket in REFERRER_LABELS) return REFERRER_LABELS[bucket as ReferrerBucket]
  return REFERRER_LABELS.other
}

/**
 * Known crawlers, link previewers, uptime monitors, headless browsers, and CLI
 * HTTP libraries. Deliberately avoids matching real mobile in-app browsers
 * common in Vietnam (Zalo, Facebook IAB, Messenger, Cốc Cốc, Safari, Chrome).
 */
const BOT_UA_PATTERN = new RegExp(
  [
    // Generic crawlers & scrapers
    "\\bbot\\b",
    "crawler",
    "spider",
    "slurp",
    "scraper",
    "archiver",
    "crawl\\b",
    // Search & AI crawlers
    "googlebot",
    "google-inspectiontool",
    "googleother",
    "adsbot-google",
    "mediapartners-google",
    "bingbot",
    "bingpreview",
    "yandex(?:bot|images|video|media|blogs|favicons|webmaster|metrika|direct|news|mobilebot)",
    "baiduspider",
    "duckduckbot",
    "sogou",
    "exabot",
    "applebot",
    "petalbot",
    "bytespider",
    "semrushbot",
    "ahrefsbot",
    "mj12bot",
    "dotbot",
    "gptbot",
    "chatgpt-user",
    "claudebot",
    "anthropic-ai",
    "perplexitybot",
    "ccbot",
    "amazonbot",
    "meta-externalagent",
    "meta-externalfetcher",
    // Social / chat link previewers (distinct from real Zalo / FB in-app browsers)
    "facebookexternalhit",
    "facebot",
    "twitterbot",
    "linkedinbot",
    "telegrambot",
    "discordbot",
    "slackbot",
    "whatsapp\\/",
    "zalo-link-preview",
    "zalobot",
    "skypeuripreview",
    "embedly",
    "quora link preview",
    "vkshare",
    "bitlybot",
    "pinterestbot",
    // Synthetic monitoring & audits
    "lighthouse",
    "pagespeed",
    "gtmetrix",
    "pingdom",
    "uptimerobot",
    "statuscake",
    "site24x7",
    "datadog",
    "newrelic",
    "healthcheck",
    // Headless & browser automation
    "headlesschrome",
    "phantomjs",
    "playwright",
    "puppeteer",
    "selenium",
    "webdriver",
    "cypress",
    // CLI & HTTP client libraries
    "\\bcurl\\/",
    "\\bwget\\/",
    "httpie\\/",
    "python-requests",
    "python-urllib",
    "\\bhttpx\\/",
    "aiohttp\\/",
    "go-http-client",
    "^java\\/",
    "apache-httpclient",
    "okhttp\\/",
    "axios\\/",
    "node-fetch",
    "\\bundici\\b",
    "libwww-perl",
    "postmanruntime",
    "insomnia\\/",
  ].join("|"),
  "i"
)

/** True when the User-Agent is missing/blank or identifies a known bot/automated client. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true
  const trimmed = userAgent.trim()
  if (trimmed.length === 0) return true
  return BOT_UA_PATTERN.test(trimmed)
}

function normalizeHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
}

function isGiveOwnHost(hostname: string, ownHosts: ReadonlySet<string>): boolean {
  if (hostname === "give.vn" || hostname.endsWith(".give.vn")) return true
  return ownHosts.has(hostname)
}

const ANDROID_APP_PATTERN = /^android-app:\/\/([a-z0-9._-]+)(?:\/.*)?$/i
const BARE_HOST_PATTERN = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)(?::\d{1,5})?$/i

/**
 * Strips any path, query string, and fragment from a referrer before sending or
 * recording it so zero PII or URL tokens leave the browser or reach the RPC.
 * Returns null for empty, invalid, or same-origin (`give.vn`, `*.give.vn`, or
 * any host in `ownHosts`) referrers so `give.record_campaign_event` buckets
 * them as `'direct'`.
 */
export function sanitizeReferrer(raw: string | null | undefined, ownHosts: readonly string[] = []): string | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > MAX_REFERRER_LENGTH) return null

  const normalizedOwn = new Set(ownHosts.map(normalizeHost).filter(Boolean))
  const lower = trimmed.toLowerCase()

  if (lower === "direct") return null
  if (lower === "facebook.com" || lower === "zalo" || lower === "google" || lower === "other") {
    return lower
  }

  const androidMatch = ANDROID_APP_PATTERN.exec(trimmed)
  if (androidMatch) {
    return `android-app://${androidMatch[1].toLowerCase()}`
  }

  if (trimmed.includes("://")) {
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
      const hostname = normalizeHost(parsed.hostname)
      if (!hostname || isGiveOwnHost(hostname, normalizedOwn)) return null
      return hostname
    } catch {
      return null
    }
  }

  const bareMatch = BARE_HOST_PATTERN.exec(trimmed)
  if (!bareMatch) return null
  const hostname = normalizeHost(bareMatch[1])
  if (!hostname || isGiveOwnHost(hostname, normalizedOwn)) return null
  return hostname
}

function toNumber(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/** Normalizes the jsonb payload returned by give.get_campaign_analytics. */
export function parseCampaignAnalytics(raw: unknown): CampaignAnalytics | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.campaign_id !== "string") return null
  const campaignType = obj.campaign_type === "back" ? "back" : obj.campaign_type === "give" ? "give" : null
  if (!campaignType) return null

  const totalsRaw = (obj.totals && typeof obj.totals === "object" ? obj.totals : {}) as Record<string, unknown>
  const dailyRaw = Array.isArray(obj.daily) ? obj.daily : []
  const referrersRaw = Array.isArray(obj.referrers) ? obj.referrers : []

  const daily: AnalyticsDailyPoint[] = dailyRaw
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({
      date: typeof row.date === "string" ? row.date : "",
      views: toNumber(row.views),
      share_clicks: toNumber(row.share_clicks),
      contributions_count: toNumber(row.contributions_count),
      contributions_amount: toNumber(row.contributions_amount),
    }))
    .filter((row) => row.date.length > 0)

  const referrers: AnalyticsReferrerRow[] = referrersRaw
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => {
      const rawBucket = typeof row.bucket === "string" ? row.bucket : "other"
      const bucket: ReferrerBucket = VALID_BUCKETS.has(rawBucket) ? (rawBucket as ReferrerBucket) : "other"
      return { bucket, views: toNumber(row.views) }
    })
    .filter((row) => row.views > 0)

  return {
    campaign_id: obj.campaign_id,
    campaign_type: campaignType,
    days: Math.max(1, Math.round(toNumber(obj.days) || DEFAULT_ANALYTICS_DAYS)),
    start_date: typeof obj.start_date === "string" ? obj.start_date : "",
    end_date: typeof obj.end_date === "string" ? obj.end_date : "",
    totals: {
      views: toNumber(totalsRaw.views),
      share_clicks: toNumber(totalsRaw.share_clicks),
      contributions_count: toNumber(totalsRaw.contributions_count),
      contributions_amount: toNumber(totalsRaw.contributions_amount),
      conversion_rate: toNumber(totalsRaw.conversion_rate),
    },
    daily,
    referrers,
  }
}

/**
 * Reads organizer campaign analytics via `give.get_campaign_analytics` under
 * the signed-in caller's JWT (RLS + RPC enforce organizer or give staff only).
 */
export async function getCampaignAnalytics(
  db: Db,
  campaignId: string,
  days: AnalyticsPeriod = DEFAULT_ANALYTICS_DAYS
): Promise<CampaignAnalytics> {
  const { data, error } = await db.rpc("get_campaign_analytics", {
    p_campaign_id: campaignId,
    p_days: days,
  })
  if (error) throw error
  const parsed = parseCampaignAnalytics(data)
  if (!parsed) throw new Error("Invalid campaign analytics payload")
  return parsed
}
