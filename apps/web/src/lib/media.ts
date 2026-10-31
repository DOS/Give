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
