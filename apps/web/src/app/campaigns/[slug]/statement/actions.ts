"use server"

import { getSession } from "@/lib/auth/session"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { reportSchema } from "@/lib/statement"
import { dbAs, dbService } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * A signed-in visitor reports that a public evidence image exposes someone's
 * personal data (owner decision on DOS/Give#58). give.report_evidence runs as
 * the service role with the reporter's id as an argument. The session user id
 * is decoded from the cookie WITHOUT verification, so the image is first
 * looked up with the reporter's own token: PostgREST verifies that token,
 * which proves the id, and the lookup also checks the image is still public.
 */

const SIGNED_OUT = "Hãy đăng nhập để báo cáo ảnh."
const NOT_FOUND = dbErrorMessage({ message: "GIVE_EVIDENCE_NOT_FOUND" })

export async function reportEvidence(evidenceId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(evidenceId)) return fail(NOT_FOUND)
  const parsed = reportSchema.safeParse(formFields(form, ["reason"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const visible = await dbAs(session.accessToken)
    .from("public_disbursement_evidence")
    .select("id")
    .eq("id", evidenceId)
    .limit(1)
  if (visible.error) {
    return fail(
      visible.error.code?.startsWith("PGRST30")
        ? "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
        : dbErrorMessage(visible.error)
    )
  }
  if (!visible.data?.length) return fail(NOT_FOUND)

  const { error } = await dbService().rpc("report_evidence", {
    p_evidence_id: evidenceId,
    p_actor_id: session.user.id,
    p_reason: parsed.data.reason,
  })
  if (error) return fail(dbErrorMessage(error))
  return done("Cảm ơn bạn. Give sẽ xem ảnh này và ẩn nếu ảnh lộ thông tin cá nhân.")
}
