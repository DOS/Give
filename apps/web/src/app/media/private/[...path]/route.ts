import { getSession } from "@/lib/auth/session"
import { coverResponse, PRIVATE_COVER_CACHE } from "@/lib/cover-route"
import { dbAs, dbService, MEDIA_BUCKET } from "@/lib/supabase"

/** A cover of an unpublished campaign: only for its organizer and staff, never cached. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const session = await getSession()
  return coverResponse(path, session ? dbAs(session.accessToken) : null, dbService(), MEDIA_BUCKET, PRIVATE_COVER_CACHE)
}
