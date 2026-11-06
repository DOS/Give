import { afterEach, describe, expect, it, vi } from "vitest"

import { appOrigin, siteOrigin } from "./origin"

describe("appOrigin", () => {
  it("prefers the configured site URL over the request host", () => {
    expect(appOrigin("https://evil.example", "https://give.dos.me/")).toBe("https://give.dos.me")
    expect(appOrigin("http://127.0.0.1:3000", "http://localhost:3000")).toBe("http://localhost:3000")
  })

  it("falls back to the request origin when unset or unusable", () => {
    expect(appOrigin("https://preview.vercel.app", "")).toBe("https://preview.vercel.app")
    expect(appOrigin("https://preview.vercel.app", "not a url")).toBe("https://preview.vercel.app")
    expect(appOrigin("https://preview.vercel.app", "javascript:alert(1)")).toBe("https://preview.vercel.app")
  })
})

describe("siteOrigin", () => {
  it("returns the configured origin or nothing", () => {
    expect(siteOrigin("https://give.dos.me/path")).toBe("https://give.dos.me")
    expect(siteOrigin("")).toBeUndefined()
    expect(siteOrigin("give.dos.me")).toBeUndefined()
    expect(siteOrigin("javascript:alert(1)")).toBeUndefined()
  })
})

describe("appOrigin with the environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("reads NEXT_PUBLIC_SITE_URL by default", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://give.dos.me")
    expect(appOrigin("https://evil.example")).toBe("https://give.dos.me")
  })

  it("uses the request origin when the variable is empty", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "")
    expect(appOrigin("https://preview.vercel.app")).toBe("https://preview.vercel.app")
  })
})
