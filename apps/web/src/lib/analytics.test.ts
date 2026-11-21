import { describe, expect, it } from "vitest"

import {
  analyticsTabHref,
  formatAnalyticsDate,
  formatAnalyticsShortDate,
  formatConversionRate,
  formatCount,
  getCampaignAnalytics,
  isBotUserAgent,
  parseAnalyticsDays,
  parseCampaignAnalytics,
  parseCampaignManageTab,
  referrerLabel,
  sanitizeReferrer,
  vietnamDateString,
} from "./analytics"
import { fakeDb, type Call } from "@/test/fake-db"

describe("isBotUserAgent", () => {
  it.each([
    ["missing", undefined],
    ["null", null],
    ["blank", "   "],
    ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
    ["Bingbot", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"],
    ["Facebook link preview", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"],
    ["Zalo link preview", "Zalo-Link-Preview/1.0"],
    ["GPTBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.0"],
    ["ClaudeBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)"],
    ["HeadlessChrome", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0.0.0"],
    ["Playwright", "Mozilla/5.0 Playwright/1.48"],
    ["curl", "curl/8.7.1"],
    ["python-requests", "python-requests/2.32.3"],
    ["Go http client", "Go-http-client/2.0"],
    ["Lighthouse", "Mozilla/5.0 (Linux; Android 11; moto g power) Chrome-Lighthouse"],
  ])("blocks bot or non-browser UA: %s", (_label, ua) => {
    expect(isBotUserAgent(ua)).toBe(true)
  })

  it.each([
    [
      "Chrome desktop",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    ],
    [
      "Safari iOS",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    ],
    ["Firefox desktop", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0"],
    [
      "Zalo iOS in-app browser",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ZaloTheme/light ZaloLanguage/vn",
    ],
    [
      "Zalo Android in-app browser",
      "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36 Zalo/24.01.01",
    ],
    [
      "Facebook in-app browser",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E219 [FBAN/FBIOS;FBAV/458.0.0.48.109;]",
    ],
    [
      "Coc Coc desktop",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) coc_coc_browser/122.0.180 Chrome/116.0.5845.180 Safari/537.36",
    ],
  ])("allows real browser UA: %s", (_label, ua) => {
    expect(isBotUserAgent(ua)).toBe(false)
  })
})

describe("sanitizeReferrer", () => {
  it("normalizes same-origin and give.vn referrers to null (direct)", () => {
    expect(sanitizeReferrer("https://give.vn/campaigns/xay-cau?utm_source=home")).toBeNull()
    expect(sanitizeReferrer("https://www.give.vn/campaigns")).toBeNull()
    expect(sanitizeReferrer("https://beta.give.vn/campaigns/xay-cau")).toBeNull()
    expect(sanitizeReferrer("give.vn")).toBeNull()
    expect(sanitizeReferrer("beta.give.vn:443")).toBeNull()
    expect(sanitizeReferrer("direct")).toBeNull()
    expect(sanitizeReferrer("https://give-preview.vercel.app/campaigns", ["give-preview.vercel.app"])).toBeNull()
    expect(sanitizeReferrer("http://localhost:3000/campaigns", ["localhost"])).toBeNull()
  })

  it("strips paths, query strings, and fragments from external URLs so zero PII leaks", () => {
    expect(sanitizeReferrer("https://l.facebook.com/l.php?u=https%3A%2F%2Fgive.vn&fbclid=secret-token")).toBe(
      "l.facebook.com"
    )
    expect(sanitizeReferrer("https://www.google.com/search?q=personal+name#top")).toBe("www.google.com")
    expect(sanitizeReferrer("https://chat.zalo.me/room/12345")).toBe("chat.zalo.me")
    expect(sanitizeReferrer("android-app://com.zing.zalo/chat/999?token=abc")).toBe("android-app://com.zing.zalo")
  })

  it("accepts bare hostnames and bucket labels, and rejects malformed or unsafe schemes", () => {
    expect(sanitizeReferrer("m.facebook.com:443")).toBe("m.facebook.com")
    expect(sanitizeReferrer("zalo")).toBe("zalo")
    expect(sanitizeReferrer("google")).toBe("google")
    expect(sanitizeReferrer("javascript:alert(1)")).toBeNull()
    expect(sanitizeReferrer("data:text/html,hi")).toBeNull()
    expect(sanitizeReferrer("")).toBeNull()
    expect(sanitizeReferrer("   ")).toBeNull()
    expect(sanitizeReferrer("a".repeat(3000))).toBeNull()
  })
})

describe("analytics formatting and query helpers", () => {
  it("parses tabs, periods, and builds hrefs", () => {
    expect(parseCampaignManageTab(undefined)).toBe("manage")
    expect(parseCampaignManageTab("edit")).toBe("manage")
    expect(parseCampaignManageTab("analytics")).toBe("analytics")
    expect(parseCampaignManageTab(["analytics", "manage"])).toBe("analytics")

    expect(parseAnalyticsDays(undefined)).toBe(30)
    expect(parseAnalyticsDays("7")).toBe(7)
    expect(parseAnalyticsDays("30")).toBe(30)
    expect(parseAnalyticsDays("90")).toBe(90)
    expect(parseAnalyticsDays("14")).toBe(30)
    expect(parseAnalyticsDays("invalid")).toBe(30)

    expect(analyticsTabHref("abc", 30)).toBe("/me/campaigns/abc?tab=analytics")
    expect(analyticsTabHref("abc", 7)).toBe("/me/campaigns/abc?tab=analytics&days=7")
    expect(analyticsTabHref("abc", 90)).toBe("/me/campaigns/abc?tab=analytics&days=90")
  })

  it("computes Vietnam dates across UTC midnight boundaries", () => {
    // 2026-11-21 17:30 UTC is already 2026-11-22 00:30 in Asia/Ho_Chi_Minh (UTC+7).
    expect(vietnamDateString(new Date("2026-11-21T17:30:00.000Z"))).toBe("2026-11-22")
    expect(vietnamDateString(new Date("2026-11-21T16:59:59.000Z"))).toBe("2026-11-21")
  })

  it("formats counts, dates, conversion rates, and referrer labels", () => {
    expect(formatCount(1240)).toBe("1.240")
    expect(formatAnalyticsDate("2026-11-22")).toBe("22/11/2026")
    expect(formatAnalyticsShortDate("2026-11-22")).toBe("22/11")

    expect(formatConversionRate(0, 0)).toBe("—")
    expect(formatConversionRate(0, 100)).toBe("0%")
    expect(formatConversionRate(0.0004, 2500)).toBe("< 0,1%")
    expect(formatConversionRate(0.0325, 400)).toBe("3,3%")

    expect(referrerLabel("direct")).toBe("Truy cập trực tiếp")
    expect(referrerLabel("facebook.com")).toBe("Facebook")
    expect(referrerLabel("zalo")).toBe("Zalo")
    expect(referrerLabel("google")).toBe("Google")
    expect(referrerLabel("other")).toBe("Nguồn khác")
    expect(referrerLabel("unknown-bucket")).toBe("Nguồn khác")
  })

  it("parses and fetches campaign analytics payload via get_campaign_analytics RPC", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: {
          campaign_id: "22222222-2222-4222-8222-222222222222",
          campaign_type: "give",
          days: 7,
          start_date: "2026-11-16",
          end_date: "2026-11-22",
          totals: {
            views: "120",
            share_clicks: "15",
            contributions_count: 6,
            contributions_amount: "3500000",
            conversion_rate: 0.05,
          },
          daily: [
            {
              date: "2026-11-22",
              views: 40,
              share_clicks: 5,
              contributions_count: 2,
              contributions_amount: 1_000_000,
            },
          ],
          referrers: [
            { bucket: "facebook.com", views: 80 },
            { bucket: "direct", views: 40 },
          ],
        },
      }),
      calls
    )

    const result = await getCampaignAnalytics(db as never, "22222222-2222-4222-8222-222222222222", 7)
    expect(calls[0]).toEqual({
      target: "rpc:get_campaign_analytics",
      ops: [["args", { p_campaign_id: "22222222-2222-4222-8222-222222222222", p_days: 7 }]],
    })
    expect(result.totals).toEqual({
      views: 120,
      share_clicks: 15,
      contributions_count: 6,
      contributions_amount: 3_500_000,
      conversion_rate: 0.05,
    })
    expect(result.referrers).toEqual([
      { bucket: "facebook.com", views: 80 },
      { bucket: "direct", views: 40 },
    ])
    expect(parseCampaignAnalytics(null)).toBeNull()
  })
})
