"use server"

import { revalidatePath } from "next/cache"

import { SWAP_PUBLIC_NOTE_MAX, SWAP_REASON_MAX } from "@/lib/account-swaps"
import { getSession } from "@/lib/auth/session"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * Finance decision on an account swap (DOS/Give#55). give.decide_account_swap
 * runs as the service role with the reviewer's id as an argument; it checks
 * the finance/admin role, blocks a decision on the reviewer's own campaign,
 * repeats every check under its locks and, on approval, ends the old binding
 * and starts the new one in one transaction. Because it trusts the id, the
 * role check below runs with the reviewer's own token first: PostgREST
 * verifies that token, so a forged session cookie fails here.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

const DECISIONS = ["approved", "rejected"] as const
type Decision = (typeof DECISIONS)[number]

const DONE_MESSAGES: Record<Decision, string> = {
  approved:
    "Đã đổi tài khoản nhận: tài khoản cũ đã ngừng và bị khóa, tài khoản mới nhận tiền từ bây giờ. Trang chiến dịch và sao kê hiện thông báo đổi tài khoản khi chiến dịch đang công khai.",
  rejected: "Đã từ chối yêu cầu đổi tài khoản.",
}

const DECIDE_MESSAGES: Record<string, string> = {
  GIVE_NOT_ADMIN: "Chỉ nhân viên tài chính hoặc quản trị viên được duyệt đổi tài khoản nhận.",
  GIVE_SELF_REVIEW: "Không thể duyệt yêu cầu của chiến dịch do chính bạn tổ chức; một nhân viên khác cần xử lý.",
  GIVE_ACCOUNT_NOT_VERIFIED:
    "Tài khoản mới không còn dùng được (chưa xác minh, hoặc hồ sơ người tổ chức chưa xác minh hay đã đổi tên pháp lý). Hãy từ chối yêu cầu này.",
  GIVE_SWAP_USE_RELEASE:
    "Tài khoản cũ chưa nhận giao dịch nào: người tổ chức tự nhả và gắn tài khoản khác được, không cần đổi. Hãy từ chối yêu cầu này.",
  GIVE_ACCOUNT_ALREADY_BOUND:
    "Tài khoản mới đã được gắn với một chiến dịch khác từ khi yêu cầu được gửi. Hãy từ chối yêu cầu này.",
}

export async function decideAccountSwap(
  requestId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(requestId)) return fail(dbErrorMessage({ message: "GIVE_SWAP_NOT_FOUND" }))
  const decision = String(form.get("decision") ?? "") as Decision
  if (!DECISIONS.includes(decision)) return fail("Thao tác không hợp lệ.")
  const note = String(form.get("note") ?? "").trim()
  const publicNote = decision === "approved" ? String(form.get("public_note") ?? "").trim() : ""
  if (!note) {
    return fail(
      decision === "approved"
        ? "Ghi căn cứ duyệt (ví dụ: đã thấy thư ngân hàng báo đóng tài khoản cũ). Ghi chú này cũng là lý do khóa tài khoản cũ."
        : "Ghi lý do từ chối; người tổ chức sẽ thấy."
    )
  }
  if (note.length > SWAP_REASON_MAX) return fail(`Ghi chú tối đa ${SWAP_REASON_MAX} ký tự.`)
  if (publicNote.length > SWAP_PUBLIC_NOTE_MAX) return fail(`Ghi chú công khai tối đa ${SWAP_PUBLIC_NOTE_MAX} ký tự.`)

  const db = dbAs(session.accessToken)
  const role = await db.rpc("is_admin", { p_roles: FINANCE_ROLES })
  if (role.error) return fail(dbErrorMessage(role.error))
  if (role.data !== true) return fail(DECIDE_MESSAGES.GIVE_NOT_ADMIN)

  const { error } = await dbService().rpc("decide_account_swap", {
    p_request_id: requestId,
    p_decision: decision,
    p_reviewer_id: session.user.id,
    p_note: note,
    p_public_note: publicNote || null,
  })
  if (error) return fail(dbErrorMessage(error, DECIDE_MESSAGES))

  revalidatePath("/admin/account-swaps")
  revalidatePath("/admin/accounts")
  // The organizer's editor, the campaign page and its statement show the
  // change; their paths need the campaign id or slug, which a revalidation of
  // the layout covers without another read.
  revalidatePath("/me/campaigns/[id]", "page")
  revalidatePath("/campaigns/[slug]", "page")
  revalidatePath("/campaigns/[slug]/statement", "page")
  return done(DONE_MESSAGES[decision])
}
