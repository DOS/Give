"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { STOP_PUBLIC_NOTE_MAX, STOP_REASON_MAX } from "@/lib/payment-requests"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * A moderator stops or resumes the payment requests of a succeeded back
 * campaign (DOS/Give#89). give.set_payment_requests_stopped runs as the service
 * role with the moderator's id as an argument; it checks the moderator/admin
 * role, refuses the moderator's own campaign and writes the audit row and the
 * notices. Because it trusts the id, the role check below runs with the
 * moderator's own token first: PostgREST verifies that token, so a forged
 * session cookie fails here.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const MODERATOR_ROLES = ["moderator", "admin"]

const ACTIONS = ["stop", "resume"] as const
type Action = (typeof ACTIONS)[number]

const DONE_MESSAGES: Record<Action, string> = {
  stop: "Đã tạm dừng yêu cầu thanh toán: không còn nhắc thanh toán, trang thanh toán đã ẩn, người ủng hộ đang chờ thanh toán và người tạo dự án đã được báo, trang dự án hiện ghi chú công khai.",
  resume: "Đã mở lại yêu cầu thanh toán: trang thanh toán hiện lại và người ủng hộ đang chờ thanh toán đã được báo.",
}

const STOP_MESSAGES: Record<string, string> = {
  GIVE_NOT_ADMIN: "Chỉ người kiểm duyệt hoặc quản trị viên được tạm dừng yêu cầu thanh toán.",
  GIVE_SELF_REVIEW: "Không thể thao tác trên dự án do chính bạn tạo; một người kiểm duyệt khác cần xử lý.",
  GIVE_PAYMENT_REQUESTS_NOT_STOPPABLE:
    "Chỉ dừng được yêu cầu thanh toán của dự án ủng hộ đã đạt mục tiêu. Dự án đang gây quỹ thì tạm dừng dự án.",
  GIVE_REASON_REQUIRED: "Ghi lý do nội bộ (chỉ lưu vào nhật ký kiểm toán).",
  GIVE_REASON_TOO_LONG: `Lý do tối đa ${STOP_REASON_MAX} ký tự.`,
  GIVE_PUBLIC_NOTE_REQUIRED: "Ghi chú công khai là bắt buộc khi tạm dừng; người ủng hộ và trang dự án sẽ thấy.",
  GIVE_PUBLIC_NOTE_TOO_LONG: `Ghi chú công khai tối đa ${STOP_PUBLIC_NOTE_MAX} ký tự.`,
  GIVE_CAMPAIGN_NOT_FOUND: "Không tìm thấy dự án.",
}

export async function setPaymentRequestsStopped(
  campaignId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(campaignId)) return fail(STOP_MESSAGES.GIVE_CAMPAIGN_NOT_FOUND)
  const action = String(form.get("action") ?? "") as Action
  if (!ACTIONS.includes(action)) return fail("Thao tác không hợp lệ.")
  const reason = String(form.get("reason") ?? "").trim()
  const publicNote = action === "stop" ? String(form.get("public_note") ?? "").trim() : ""
  if (!reason) return fail(STOP_MESSAGES.GIVE_REASON_REQUIRED)
  if (reason.length > STOP_REASON_MAX) return fail(STOP_MESSAGES.GIVE_REASON_TOO_LONG)
  if (action === "stop" && !publicNote) return fail(STOP_MESSAGES.GIVE_PUBLIC_NOTE_REQUIRED)
  if (publicNote.length > STOP_PUBLIC_NOTE_MAX) return fail(STOP_MESSAGES.GIVE_PUBLIC_NOTE_TOO_LONG)

  const role = await dbAs(session.accessToken).rpc("is_admin", { p_roles: MODERATOR_ROLES })
  if (role.error) return fail(dbErrorMessage(role.error))
  if (role.data !== true) return fail(STOP_MESSAGES.GIVE_NOT_ADMIN)

  const { error } = await dbService().rpc("set_payment_requests_stopped", {
    p_actor_id: session.user.id,
    p_campaign_id: campaignId,
    p_stopped: action === "stop",
    p_reason: reason,
    p_public_note: publicNote || null,
  })
  if (error) return fail(dbErrorMessage(error, STOP_MESSAGES))

  revalidatePath("/admin/payment-requests")
  revalidatePath("/campaigns/[slug]", "page")
  revalidatePath("/me/pledges/[code]", "page")
  return done(DONE_MESSAGES[action])
}
