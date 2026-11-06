/**
 * Cover image checks. The give-media bucket accepts JPEG, PNG and WebP up to
 * 5 MB; Vercel functions take request bodies up to 4.5 MB, so covers stop at
 * 4 MB to leave room for the multipart overhead.
 */

export const MAX_COVER_BYTES = 4 * 1024 * 1024

export type ImageType = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" }

/**
 * Detects the image type from the file's first bytes. The browser-sent
 * Content-Type and file name are not trusted.
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b)
  if (startsWith([0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" }
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" }
  // RIFF....WEBP
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: "image/webp", ext: "webp" }
  }
  return null
}

/** Storage key for a campaign's media object: campaigns/<campaign id>/<object id>.<ext>. */
export function mediaPath(campaignId: string, objectId: string, ext: ImageType["ext"]): string {
  return `campaigns/${campaignId}/${objectId}.${ext}`
}

export function campaignMediaPrefix(campaignId: string): string {
  return `campaigns/${campaignId}`
}

const MEDIA_PATH =
  /^campaigns\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/

const MEDIA_TYPES: Record<ImageType["ext"], ImageType["mime"]> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

/**
 * The storage key a /media/... URL names, or null unless it has exactly the
 * shape mediaPath() produces (so no traversal or other buckets' keys).
 */
export function parseMediaPath(segments: readonly string[]): { path: string; mime: ImageType["mime"] } | null {
  const path = segments.join("/")
  const match = MEDIA_PATH.exec(path)
  return match ? { path, mime: MEDIA_TYPES[match[1] as ImageType["ext"]] } : null
}

const COVER_MAX_EDGE = 2400

/**
 * Re-encodes a cover to WebP: applies the EXIF orientation, then drops all
 * metadata (GPS position, device, owner) that the original may carry, and
 * caps the longer edge. Throws if the bytes are not a decodable image.
 */
export async function reencodeCover(bytes: Uint8Array): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp")
  const output = await sharp(bytes, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: COVER_MAX_EDGE, height: COVER_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer()
  return new Uint8Array(output)
}
