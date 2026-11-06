import { describe, expect, it } from "vitest"

import { detectImageType, mediaPath, parseMediaPath } from "./media"

const bytes = (...values: number[]) => new Uint8Array(values)

describe("detectImageType", () => {
  it("detects JPEG, PNG and WebP by signature", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({ mime: "image/jpeg", ext: "jpg" })
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({
      mime: "image/png",
      ext: "png",
    })
    const webp = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ")
    expect(detectImageType(webp)).toEqual({ mime: "image/webp", ext: "webp" })
  })

  it("rejects other files, whatever their name or Content-Type claims", () => {
    expect(detectImageType(new TextEncoder().encode("<svg xmlns="))).toBeNull()
    expect(detectImageType(new TextEncoder().encode("GIF89a"))).toBeNull()
    expect(detectImageType(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WAVE"))).toBeNull()
    expect(detectImageType(bytes())).toBeNull()
  })
})

describe("mediaPath", () => {
  it("keeps objects under the campaign's prefix", () => {
    expect(mediaPath("c1", "m1", "png")).toBe("campaigns/c1/m1.png")
  })
})

describe("parseMediaPath", () => {
  const campaign = "22222222-2222-4222-8222-222222222222"
  const object = "33333333-3333-4333-8333-333333333333"

  it("accepts keys shaped like mediaPath()", () => {
    expect(parseMediaPath(mediaPath(campaign, object, "webp").split("/"))).toEqual({
      path: `campaigns/${campaign}/${object}.webp`,
      mime: "image/webp",
    })
    expect(parseMediaPath(["campaigns", campaign, `${object}.jpg`])?.mime).toBe("image/jpeg")
  })

  it("rejects traversal, other prefixes, extra segments and other types", () => {
    expect(parseMediaPath(["campaigns", campaign, "..", `${object}.webp`])).toBeNull()
    expect(parseMediaPath(["..", "other-bucket", `${object}.webp`])).toBeNull()
    expect(parseMediaPath(["campaigns", campaign, object, `${object}.webp`])).toBeNull()
    expect(parseMediaPath(["campaigns", campaign, `${object}.svg`])).toBeNull()
    expect(parseMediaPath(["campaigns", "ABCDEF12-2222-4222-8222-222222222222", `${object}.webp`])).toBeNull()
    expect(parseMediaPath([])).toBeNull()
  })
})
