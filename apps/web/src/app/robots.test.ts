import { afterEach, describe, expect, it, vi } from "vitest"

import robots from "./robots"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("robots.ts", () => {
  it("allows / and /media/public/ (overriding /me prefix) while disallowing private/transactional/embed routes, omitting sitemap when siteOrigin() is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "")

    const result = robots()

    expect(result).toStrictEqual({
      rules: {
        userAgent: "*",
        allow: ["/", "/media/public/"],
        disallow: ["/admin", "/me", "/api", "/auth", "/donations", "/plans", "/email", "/embed", "/invites", "/start"],
      },
    })
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules
    expect(rule.allow).toContain("/media/public/")
    expect(rule.disallow).toContain("/me")
    expect("sitemap" in result).toBe(false)
  })

  it("includes normalized sitemap URL when siteOrigin() is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://give.vn/ignored-path?x=1")

    const result = robots()

    expect(result.sitemap).toBe("https://give.vn/sitemap.xml")
  })

  it("omits sitemap when NEXT_PUBLIC_SITE_URL is invalid or non-http(s)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "ftp://give.vn")
    expect("sitemap" in robots()).toBe(false)

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not-a-valid-url")
    expect("sitemap" in robots()).toBe(false)
  })
})
