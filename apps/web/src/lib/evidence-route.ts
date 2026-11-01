import type { Db } from "@/lib/campaigns"
import { parseEvidencePath } from "@/lib/statement"

function status(code: number): Response {
  return new Response(null, { status: code, headers: { "Cache-Control": "no-store" } })
}

/**
 * Serves a disbursement evidence image from the private give-media bucket.
 * `viewer` runs under RLS, which shows a disbursement_evidence row only to
 * the campaign's organizer, the account owner and finance staff; only when
 * the viewer sees the row does the service role fetch the object. Evidence
 * is not public (no public view carries it), so it is never cached.
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
  return new Response(file.data, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
