import type { Db } from "@/lib/campaigns"
import { parseMediaPath } from "@/lib/media"

export const PUBLIC_COVER_CACHE = "public, max-age=300, s-maxage=300"
export const PRIVATE_COVER_CACHE = "private, no-store"

function status(code: number): Response {
  return new Response(null, { status: code, headers: { "Cache-Control": "no-store" } })
}

interface ActiveCoverRow {
  id: string
  campaign?: { cover_media_id: string | null } | { cover_media_id: string | null }[] | null
}

function isActiveCover(row: ActiveCoverRow): boolean {
  if (Array.isArray(row.campaign)) {
    return row.campaign.some((c) => c?.cover_media_id === row.id)
  }
  return Boolean(row.campaign && row.campaign.cover_media_id === row.id)
}

/**
 * Serves a cover from the private give-media bucket. `viewer` runs under
 * RLS, which shows a campaign_media row and its referencing campaign only for
 * a public campaign, its organizer and staff; only when the viewer sees that
 * the row is currently the campaign's cover_media_id does the service role
 * fetch the object. Superseded draft covers and anything else are a plain 404.
 */
export async function coverResponse(
  segments: readonly string[],
  viewer: Db | null,
  service: Db | (() => Db),
  bucket: string,
  cacheControl: string
): Promise<Response> {
  const media = parseMediaPath(segments)
  if (!media || !viewer) return status(404)

  const { data, error } = await viewer
    .from("campaign_media")
    .select("id, campaign:campaigns!campaigns_cover_media_fk!inner(cover_media_id)")
    .eq("storage_path", media.path)
    .eq("kind", "image")
    .limit(1)
  // A rejected or expired token (PGRST30x) is treated like no access.
  if (error) return status(error.code?.startsWith("PGRST30") ? 404 : 502)
  const rows = (data ?? []) as unknown as ActiveCoverRow[]
  if (!rows.some(isActiveCover)) return status(404)

  const svc = typeof service === "function" ? service() : service
  const file = await svc.storage.from(bucket).download(media.path)
  if (file.error || !file.data) return status(404)
  const headers: Record<string, string> = {
    "Content-Type": media.mime,
    "Cache-Control": cacheControl,
    "Content-Security-Policy": "default-src 'none'",
    "X-Content-Type-Options": "nosniff",
  }
  if (cacheControl === PRIVATE_COVER_CACHE) {
    headers["X-Robots-Tag"] = "noindex, noimageindex"
  }
  return new Response(file.data, { headers })
}
