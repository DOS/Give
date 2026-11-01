"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { FINANCE_ROLES, type AccountStatus } from "@/lib/receiving-accounts"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * Finance review of receiving accounts. give.review_receiving_account runs as
 * the service role with the reviewer's id as an argument; it checks the
 * finance/admin role, blocks self-review, enforces the allowed transitions
 * and writes the audit row. Because it trusts the id, the role check below
 * runs with the reviewer's own token first: PostgREST verifies that token, so
 * a forged session cookie fails here.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

const DECISIONS: readonly AccountStatus[] = ["verified", "rejected", "disabled", "pending"]

const DONE_MESSAGES: Record<AccountStatus, string> = {
  verified: "Đã xác minh tài khoản nhận.",
  rejected: "Đã từ chối tài khoản nhận.",
  disabled: "Đã khóa tài khoản nhận.",
  pending: "Đã mở lại để xác minh với mã mới.",
}

const REVIEW_MESSAGES: Record<string, string> = {
  GIVE_TRANSITION_NOT_ALLOWED:
    "Không thể đổi tài khoản sang trạng thái này. Tài khoản từng gắn với chiến dịch không thể bị từ chối, chỉ có thể khóa.",
  GIVE_NOT_ADMIN: "Chỉ nhân viên tài chính hoặc quản trị viên được xác minh tài khoản nhận.",
}

export async function reviewAccount(accountId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(accountId)) return fail(dbErrorMessage({ message: "GIVE_ACCOUNT_NOT_FOUND" }))
  const decision = String(form.get("decision") ?? "") as AccountStatus
  if (!DECISIONS.includes(decision)) return fail("Thao tác không hợp lệ.")
  const evidence =
    String(form.get("evidence") ?? "")
      .trim()
      .slice(0, 500) || null
  const reason =
    String(form.get("reason") ?? "")
      .trim()
      .slice(0, 1000) || null
  if (decision === "verified" && !evidence) return fail(dbErrorMessage({ message: "GIVE_EVIDENCE_REQUIRED" }))
  if ((decision === "rejected" || decision === "disabled") && !reason) {
    return fail(dbErrorMessage({ message: "GIVE_REASON_REQUIRED" }))
  }

  if (!(await isStaff(dbAs(session.accessToken), FINANCE_ROLES))) {
    return fail(REVIEW_MESSAGES.GIVE_NOT_ADMIN)
  }

  const { error } = await dbService().rpc("review_receiving_account", {
    p_receiving_account_id: accountId,
    p_decision: decision,
    p_reviewer_id: session.user.id,
    p_evidence: decision === "verified" ? evidence : null,
    p_reason: decision === "rejected" || decision === "disabled" ? reason : null,
    // The code the reviewer checked the transfer against; a reopened account
    // has a new one, and the database refuses a stale review.
    p_expected_code: decision === "verified" ? String(form.get("expected_code") ?? "") : null,
  })
  if (error) return fail(dbErrorMessage(error, REVIEW_MESSAGES))

  revalidatePath("/admin/accounts")
  revalidatePath("/me/accounts")
  return done(DONE_MESSAGES[decision])
}
