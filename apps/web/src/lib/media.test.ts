import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { campaignMediaPrefix, detectImageType, mediaPath, parseMediaPath, reencodeCover } from "./media"

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
    expect(campaignMediaPrefix("c1")).toBe("campaigns/c1")
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
    expect(parseMediaPath(["campaigns", campaign, `${object}.png`])?.mime).toBe("image/png")
  })

  it("rejects traversal, embedded slashes, other prefixes, extra segments and other types", () => {
    expect(parseMediaPath(["campaigns", campaign, "..", `${object}.webp`])).toBeNull()
    expect(parseMediaPath([`campaigns/${campaign}`, `${object}.webp`])).toBeNull()
    expect(parseMediaPath(["..", "other-bucket", `${object}.webp`])).toBeNull()
    expect(parseMediaPath(["campaigns", campaign, object, `${object}.webp`])).toBeNull()
    expect(parseMediaPath(["campaigns", campaign, `${object}.svg`])).toBeNull()
    expect(parseMediaPath(["campaigns", "ABCDEF12-2222-4222-8222-222222222222", `${object}.webp`])).toBeNull()
    expect(parseMediaPath([])).toBeNull()
  })
})

describe("reencodeCover", () => {
  it("converts to WebP, applies EXIF orientation and strips EXIF metadata", async () => {
    const jpegWithExif = await sharp({
      create: { width: 80, height: 40, channels: 3, background: "#e11d48" },
    })
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: {
          IFD0: { Copyright: "private-owner" },
          IFD3: { GPSLatitudeRef: "N" },
        },
      })
      .toBuffer()

    const out = await reencodeCover(new Uint8Array(jpegWithExif))
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe("webp")
    expect(meta.exif).toBeUndefined()
    // Orientation 6 (90° CW) rotates 80x40 pixels into 40x80.
    expect(meta.width).toBe(40)
    expect(meta.height).toBe(80)
  })

  it("caps the longer edge at 2400px while preserving aspect ratio and never enlarging small images", async () => {
    const largePng = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: "#0ea5e9" },
    })
      .png()
      .toBuffer()
    const downscaled = await sharp(await reencodeCover(new Uint8Array(largePng))).metadata()
    expect(downscaled.format).toBe("webp")
    expect(downscaled.width).toBe(2400)
    expect(downscaled.height).toBe(1200)

    const smallPng = await sharp({
      create: { width: 320, height: 180, channels: 3, background: "#10b981" },
    })
      .png()
      .toBuffer()
    const untouched = await sharp(await reencodeCover(new Uint8Array(smallPng))).metadata()
    expect(untouched.width).toBe(320)
    expect(untouched.height).toBe(180)
  })

  it("throws when the bytes are not a decodable image", async () => {
    await expect(reencodeCover(bytes(0xff, 0xd8, 0xff, 0x00, 0x01, 0x02))).rejects.toThrow()
    await expect(reencodeCover(new TextEncoder().encode("not an image"))).rejects.toThrow()
  })
})
