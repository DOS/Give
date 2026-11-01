"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { isStaffRole, ROLE_LABELS } from "@/lib/staff"
import { dbAs } from "@/lib/supabase"

/**
 * Staff role actions. They run with the admin's own token: the database
 * functions check the admin role, protect the last admin and write the audit
 * rows, so this file adds no authority of its own.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

function reasonOf(form: FormData): string | null {
  return (
    String(form.get("reason") ?? "")
      .trim()
      .slice(0, 500) || null
  )
}

/** Grants a role, or changes the role of someone who already has one. */
export async function grantRole(_state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const user = String(form.get("user") ?? "").trim()
  if (!user || user.length > 320) return fail("Nhập email hoặc mã người dùng DOS.Me.")
  const role = String(form.get("role") ?? "")
  if (!isStaffRole(role)) return fail(dbErrorMessage({ message: "GIVE_ROLE_INVALID" }))
  // Demoting yourself locks you out of this page at once; only the
  // confirmed change form on your own row may do it.
  const self =
    user === session.user.id || (!!session.user.email && user.toLowerCase() === session.user.email.toLowerCase())
  if (self && role !== "admin" && form.get("confirm_self") !== "yes") {
    return fail("Bạn đang hạ quyền của chính mình. Hãy dùng nút “Đổi quyền” ở dòng của bạn để xác nhận.")
  }

  const { error } = await dbAs(session.accessToken).rpc("grant_admin_role", {
    p_user: user,
    p_role: role,
    p_reason: reasonOf(form),
  })
  if (error) return fail(dbErrorMessage(error))
  revalidatePath("/admin/roles")
  return done(
    user.includes("@") ? `Đã cấp quyền ${ROLE_LABELS[role]} cho ${user}.` : `Đã cấp quyền ${ROLE_LABELS[role]}.`
  )
}

/** Removes a person's staff role. */
export async function revokeRole(userId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(userId)) return fail(dbErrorMessage({ message: "GIVE_ADMIN_NOT_FOUND" }))

  const { error } = await dbAs(session.accessToken).rpc("revoke_admin_role", {
    p_user_id: userId,
    p_reason: reasonOf(form),
  })
  if (error) return fail(dbErrorMessage(error))
  revalidatePath("/admin/roles")
  revalidatePath("/admin")
  return done("Đã thu quyền.")
}
