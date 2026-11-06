import { publicEvidenceResponse } from "@/lib/evidence-route"
import { dbAs, dbService, MEDIA_BUCKET } from "@/lib/supabase"

/**
 * A public disbursement evidence image. It ignores the session (the proxy
 * skips /media/public/) so a cacheable response never carries cookies.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return publicEvidenceResponse(path, dbAs(), dbService(), MEDIA_BUCKET)
}
