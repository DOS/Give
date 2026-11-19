"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * An admin sends a dead email again (DOS/Give#254): give.retry_outbox runs
 * as the service role with the actor's id, checks the admin role and that
 * the row is dead under its locks, and audits the retry. The role is first
 * read with the actor's own token, which PostgREST verifies, so a forged
 * session cookie fails here.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_ALLOWED = "Chỉ quản trị viên mới gửi lại được email."
const NOT_DEAD = "Email này không còn ở trạng thái không gửi được: có người đã gửi lại. Hãy tải lại trang."
const EXPIRED = "Email này đã quá lâu nên không gửi lại được: nội dung có thể không còn đúng."

const MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: NOT_ALLOWED,
  GIVE_OUTBOX_NOT_DEAD: NOT_DEAD,
  GIVE_OUTBOX_NOT_FOUND: NOT_DEAD,
  GIVE_OUTBOX_EXPIRED: EXPIRED,
}

export async function retryEmail(outboxId: string, _state: ActionResult, _form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(outboxId)) return fail(NOT_DEAD)
  try {
    if (!(await isStaff(dbAs(session.accessToken), ["admin"]))) return fail(NOT_ALLOWED)
  } catch (error) {
    return fail(dbErrorMessage(error as DbErrorLike))
  }
  const { error } = await dbService().rpc("retry_outbox", { p_actor_id: session.user.id, p_id: outboxId })
  if (error) return fail(dbErrorMessage(error, MESSAGES))
  revalidatePath("/admin/emails")
  return done("Đã gửi lại email. Give gửi trong lần chạy tới (mỗi phút), với lượt thử mới từ đầu.")
}
