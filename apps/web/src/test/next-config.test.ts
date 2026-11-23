import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match"
import { describe, expect, it } from "vitest"

import nextConfig from "../../next.config"

/** A glob as Next's localPatterns use it ("**" spans segments, "*" one segment). */
function globToRegExp(glob: string): RegExp {
  const source = glob
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*")
    )
    .join(".*")
  return new RegExp(`^${source}$`)
}

const patterns = (nextConfig.images?.localPatterns ?? []).map((p) => globToRegExp(p.pathname ?? "**"))
const optimizable = (path: string) => patterns.some((re) => re.test(path))

/** Resolves all headers Next.js applies to `pathname` in rule order (later matching rules override by key). */
async function resolveHeadersForPath(pathname: string): Promise<Map<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? []
  const resolved = new Map<string, string>()
  for (const rule of rules) {
    const matcher = getPathMatch(rule.source)
    if (matcher(pathname)) {
      for (const header of rule.headers) {
        resolved.set(header.key.toLowerCase(), header.value)
      }
    }
  }
  return resolved
}

describe("image optimizer allow-list", () => {
  it("optimizes public covers only, never evidence (its cache would outlive a staff hide, DOS/Give#58)", () => {
    const uuid = "22222222-2222-4222-8222-222222222222"
    expect(optimizable(`/media/public/campaigns/${uuid}/${uuid}.webp`)).toBe(true)
    expect(optimizable(`/media/public/evidence/${uuid}/${uuid}/${uuid}.webp`)).toBe(false)
    expect(optimizable(`/media/evidence/${uuid}/${uuid}/${uuid}.webp`)).toBe(false)
    expect(optimizable(`/media/private/campaigns/${uuid}/${uuid}.webp`)).toBe(false)
  })
})

describe("response headers", () => {
  it("keeps X-Frame-Options: DENY on all non-embed routes while excluding /embed and /embed/* (DOS/Give#335)", async () => {
    const rules = (await nextConfig.headers?.()) ?? []
    const globalIdx = rules.findIndex((r) => r.source === "/((?!embed(?:/|$)).*)")
    const embedIdx = rules.findIndex((r) => r.source === "/embed/:path*")
    expect(globalIdx).toBeGreaterThanOrEqual(0)
    expect(embedIdx).toBeGreaterThan(globalIdx)

    for (const path of ["/", "/campaigns/abc", "/me", "/admin", "/donations/GV123", "/invites/tok123", "/embedded"]) {
      const headers = await resolveHeadersForPath(path)
      expect(headers.get("x-frame-options"), path).toBe("DENY")
      expect(headers.get("x-content-type-options"), path).toBe("nosniff")
      expect(headers.get("content-security-policy"), path).toBeUndefined()
    }

    for (const embedPath of ["/embed", "/embed/", "/embed/abc", "/embed/abc/nested"]) {
      const headers = await resolveHeadersForPath(embedPath)
      expect(headers.get("x-frame-options"), embedPath).toBeUndefined()
      expect(headers.get("content-security-policy"), embedPath).toBe("frame-ancestors *")
      expect(headers.get("x-content-type-options"), embedPath).toBe("nosniff")
      expect(headers.get("referrer-policy"), embedPath).toBe("strict-origin-when-cross-origin")
    }
  })

  it("strips Referer and disables caching on /donations/* after the site-wide defaults (DOS/Give#50)", async () => {
    const rules = (await nextConfig.headers?.()) ?? []
    const globalIdx = rules.findIndex((r) => r.source === "/((?!embed(?:/|$)).*)")
    const donationsIdx = rules.findIndex((r) => r.source === "/donations/:path*")
    expect(globalIdx).toBeGreaterThanOrEqual(0)
    expect(donationsIdx).toBeGreaterThan(globalIdx)
    expect(rules[donationsIdx]?.headers).toEqual(
      expect.arrayContaining([
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "private, no-store" },
      ])
    )
    const resolved = await resolveHeadersForPath("/donations/GV123")
    expect(resolved.get("x-frame-options")).toBe("DENY")
    expect(resolved.get("referrer-policy")).toBe("no-referrer")
    expect(resolved.get("cache-control")).toBe("private, no-store")
  })

  it("strips Referer, disables caching, and sets noindex on /invites/* after the site-wide defaults (DOS/Give#253)", async () => {
    const rules = (await nextConfig.headers?.()) ?? []
    const globalIdx = rules.findIndex((r) => r.source === "/((?!embed(?:/|$)).*)")
    const invitesIdx = rules.findIndex((r) => r.source === "/invites/:path*")
    expect(globalIdx).toBeGreaterThanOrEqual(0)
    expect(invitesIdx).toBeGreaterThan(globalIdx)
    expect(rules[invitesIdx]?.headers).toEqual(
      expect.arrayContaining([
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "private, no-store" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ])
    )
    const resolved = await resolveHeadersForPath("/invites/tok123")
    expect(resolved.get("x-frame-options")).toBe("DENY")
    expect(resolved.get("x-robots-tag")).toBe("noindex, nofollow")
  })
})
