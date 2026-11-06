"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { MODERATION_ROLES, moderateSchema } from "@/lib/evidence-moderation"
import { isUuid } from "@/lib/ids"
import { dbAs, dbService } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * Staff hide or keep a public evidence image (owner decision on
 * DOS/Give#58). give.moderate_evidence runs as the service role with the
 * moderator's id as an argument; it checks the moderator/admin role,
 * resolves the image's open reports and audits every hide and unhide.
 * Because it trusts the id, the role check below runs with the moderator's
 * own token first: PostgREST verifies that token, so a forged session cookie
 * fails here.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_MODERATOR = "Chỉ kiểm duyệt viên hoặc quản trị viên được ẩn ảnh chứng từ."

export async function moderateEvidence(
  evidenceId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(evidenceId)) return fail(dbErrorMessage({ message: "GIVE_EVIDENCE_NOT_FOUND" }))
  const parsed = moderateSchema.safeParse(formFields(form, ["decision", "reason"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const role = await dbAs(session.accessToken).rpc("is_admin", { p_roles: MODERATION_ROLES })
  if (role.error) return fail(dbErrorMessage(role.error))
  if (role.data !== true) return fail(NOT_MODERATOR)

  const { error } = await dbService().rpc("moderate_evidence", {
    p_evidence_id: evidenceId,
    p_actor_id: session.user.id,
    p_hidden: parsed.data.hidden,
    p_reason: parsed.data.reason,
  })
  if (error) return fail(dbErrorMessage(error, { GIVE_NOT_ALLOWED: NOT_MODERATOR }))

  revalidatePath("/admin/evidence")
  return done(parsed.data.hidden ? "Đã ẩn ảnh khỏi sao kê công khai." : "Ảnh được giữ công khai.")
}
