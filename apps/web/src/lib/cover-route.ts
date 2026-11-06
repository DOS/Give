import type { Db } from "@/lib/campaigns"
import { parseMediaPath } from "@/lib/media"

export const PUBLIC_COVER_CACHE = "public, max-age=300, s-maxage=300"
export const PRIVATE_COVER_CACHE = "private, no-store"

function status(code: number): Response {
  return new Response(null, { status: code, headers: { "Cache-Control": "no-store" } })
}

/**
 * Serves a cover from the private give-media bucket. `viewer` runs under
 * RLS, which shows a campaign_media row only for a public campaign, its
 * organizer and staff; only when the viewer sees the row does the service
 * role fetch the object. Anything else is a plain 404.
 */
export async function coverResponse(
  segments: readonly string[],
  viewer: Db | null,
  service: Db,
  bucket: string,
  cacheControl: string
): Promise<Response> {
  const media = parseMediaPath(segments)
  if (!media || !viewer) return status(404)

  const { data, error } = await viewer
    .from("campaign_media")
    .select("id")
    .eq("storage_path", media.path)
    .eq("kind", "image")
    .limit(1)
  // A rejected or expired token (PGRST30x) is treated like no access.
  if (error) return status(error.code?.startsWith("PGRST30") ? 404 : 502)
  if (!data?.length) return status(404)

  const file = await service.storage.from(bucket).download(media.path)
  if (file.error || !file.data) return status(404)
  return new Response(file.data, {
    headers: {
      "Content-Type": media.mime,
      "Cache-Control": cacheControl,
      "Content-Security-Policy": "default-src 'none'",
    },
  })
}
