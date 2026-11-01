import type { Db } from "@/lib/campaigns"
import { parseEvidencePath } from "@/lib/statement"

/**
 * Public evidence may sit in shared caches this long. Kept short so an image
 * staff hide (it exposed someone's personal data) stops being served soon.
 */
export const PUBLIC_EVIDENCE_CACHE = "public, max-age=60, s-maxage=60"

function status(code: number): Response {
  return new Response(null, { status: code, headers: { "Cache-Control": "no-store" } })
}

function image(body: Blob, cacheControl: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": cacheControl,
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      // Evidence may show people (recipients, volunteers): keep it out of search results.
      "X-Robots-Tag": "noindex, noimageindex",
    },
  })
}

/**
 * Serves a public disbursement evidence image (owner decision on DOS/Give#58)
 * without a session: `anon` reads give.public_disbursement_evidence, which
 * lists the evidence of public campaigns that staff have not hidden; only
 * then does the service role fetch the object. A hidden image, one of a
 * campaign that is no longer public, or any other key is a plain 404.
 */
export async function publicEvidenceResponse(segments: readonly string[], anon: Db, service: Db, bucket: string) {
  const path = parseEvidencePath(segments)
  if (!path) return status(404)

  const { data, error } = await anon.from("public_disbursement_evidence").select("id").eq("storage_path", path).limit(1)
  if (error) return status(502)
  if (!data?.length) return status(404)

  const file = await service.storage.from(bucket).download(path)
  if (file.error || !file.data) return status(404)
  return image(file.data, PUBLIC_EVIDENCE_CACHE)
}

/**
 * Serves a disbursement evidence image from the private give-media bucket to
 * a signed-in viewer, hidden ones included. `viewer` runs under RLS, which
 * shows a disbursement_evidence row only to the campaign's organizer, the
 * account owner, finance staff, and moderators for a reported or moderated
 * image; only when the viewer sees the row does the service role fetch the
 * object. It is never cached; public pages use publicEvidenceResponse.
 */
export async function evidenceResponse(segments: readonly string[], viewer: Db | null, service: Db, bucket: string) {
  const path = parseEvidencePath(segments)
  if (!path || !viewer) return status(404)

  const { data, error } = await viewer.from("disbursement_evidence").select("id").eq("storage_path", path).limit(1)
  // A rejected or expired token (PGRST30x) is treated like no access.
  if (error) return status(error.code?.startsWith("PGRST30") ? 404 : 502)
  if (!data?.length) return status(404)

  const file = await service.storage.from(bucket).download(path)
  if (file.error || !file.data) return status(404)
  return image(file.data, "private, no-store")
}
