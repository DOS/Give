import { getSession } from "@/lib/auth/session"
import { evidenceResponse } from "@/lib/evidence-route"
import { dbAs, dbService, MEDIA_BUCKET } from "@/lib/supabase"

/** A disbursement evidence image: only for those who may read the explanation's evidence rows. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const session = await getSession()
  return evidenceResponse(path, session ? dbAs(session.accessToken) : null, dbService(), MEDIA_BUCKET)
}
