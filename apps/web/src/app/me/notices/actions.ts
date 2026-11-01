"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { dbAs } from "@/lib/supabase"

/**
 * Mark notices as read. Runs with the user's own token: RLS limits the update
 * to their notices and the database stamps read_at with its own time, so no
 * service role is needed. The user_id filter only keeps the query explicit.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

export async function markNoticeRead(noticeId: string, _state: ActionResult, _form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(noticeId)) return fail("Không tìm thấy thông báo.")

  const { error } = await dbAs(session.accessToken)
    .from("notices")
    .update({ read_at: new Date().toISOString() })
    .eq("id", noticeId)
    .eq("user_id", session.user.id)
    .is("read_at", null)
  if (error) return fail(dbErrorMessage(error))
  revalidatePath("/", "layout")
  return done("Đã đánh dấu là đã đọc.")
}

export async function markAllNoticesRead(_state: ActionResult, _form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)

  const { error } = await dbAs(session.accessToken)
    .from("notices")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", session.user.id)
    .is("read_at", null)
  if (error) return fail(dbErrorMessage(error))
  revalidatePath("/", "layout")
  return done("Đã đánh dấu tất cả là đã đọc.")
}
