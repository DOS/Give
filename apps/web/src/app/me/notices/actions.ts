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

/**
 * Marks every unread notice created up to `before`, the newest notice the page
 * showed, so one that arrived after the page loaded stays unread. The value is
 * passed back to the database as is: parsing it into a Date would drop the
 * microseconds and leave that newest notice unread.
 */
export async function markAllNoticesRead(_state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const before = form.get("before")
  if (typeof before !== "string" || before.length > 40 || Number.isNaN(Date.parse(before))) {
    return fail("Hãy tải lại trang rồi thử lại.")
  }

  const { error } = await dbAs(session.accessToken)
    .from("notices")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", session.user.id)
    .is("read_at", null)
    .lte("created_at", before)
  if (error) return fail(dbErrorMessage(error))
  revalidatePath("/", "layout")
  return done("Đã đánh dấu tất cả là đã đọc.")
}
