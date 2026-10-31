/**
 * App URLs for campaign covers. The give-media bucket is private, so covers
 * are served by the /media routes, which check the viewer's rights first:
 *
 * - `/media/public/...` serves a cover only when an anonymous visitor could
 *   see it (its campaign is public), and lets caches keep it. Only these URLs
 *   may go through the image optimizer (next.config.ts `localPatterns`).
 * - `/media/private/...` serves the organizer and staff a cover of a campaign
 *   that is not public yet, from the signed-in session, never cached. Render
 *   it with `unoptimized` so the browser fetches it with its own cookies.
 */
export function publicCoverUrl(storagePath: string): string {
  return `/media/public/${storagePath}`
}

export function privateCoverUrl(storagePath: string): string {
  return `/media/private/${storagePath}`
}
