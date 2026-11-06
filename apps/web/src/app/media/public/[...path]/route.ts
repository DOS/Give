import { coverResponse, PUBLIC_COVER_CACHE } from "@/lib/cover-route"
import { dbAs, dbService, MEDIA_BUCKET } from "@/lib/supabase"

/** A cover anyone may see: looked up as an anonymous visitor, cacheable. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return coverResponse(path, dbAs(), dbService(), MEDIA_BUCKET, PUBLIC_COVER_CACHE)
}
