"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { getOrganizer } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { accountNameMatches, FINANCE_ROLES, getAccount, type AccountStatus } from "@/lib/receiving-accounts"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * Finance review of receiving accounts. give.review_receiving_account runs as
 * the service role with the reviewer's id as an argument; it checks the
 * finance/admin role, blocks self-review, enforces the allowed transitions
 * and writes the audit row. Because it trusts the id, the role check below
 * runs with the reviewer's own token first: PostgREST verifies that token, so
 * a forged session cookie fails here.
 *
 * The holder name an organizer declares is only compared with their own
 * legal name, so it proves nothing about the bank. Verifying therefore also
 * takes the sender name the reviewer read on the test transfer, from a source
 * the bank issued, and refuses unless it matches the legal name.
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
    "Không thể đổi tài khoản sang trạng thái này: trạng thái có thể vừa đổi (hãy tải lại trang), hoặc tài khoản từng gắn với chiến dịch nên chỉ có thể khóa.",
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
  const senderName = String(form.get("sender_name") ?? "")
    .trim()
    .slice(0, 120)
  if (decision === "verified" && !evidence) return fail(dbErrorMessage({ message: "GIVE_EVIDENCE_REQUIRED" }))
  if (decision === "verified" && !senderName) return fail("Ghi tên người chuyển đọc được trên giao dịch xác minh.")
  if ((decision === "rejected" || decision === "disabled") && !reason) {
    return fail(dbErrorMessage({ message: "GIVE_REASON_REQUIRED" }))
  }

  const db = dbAs(session.accessToken)
  const role = await db.rpc("is_admin", { p_roles: FINANCE_ROLES })
  if (role.error) return fail(dbErrorMessage(role.error))
  if (role.data !== true) return fail(REVIEW_MESSAGES.GIVE_NOT_ADMIN)

  let recordedEvidence = evidence
  if (decision === "verified") {
    let legalName
    try {
      const account = await getAccount(db, accountId)
      if (!account) return fail(dbErrorMessage({ message: "GIVE_ACCOUNT_NOT_FOUND" }))
      legalName = (await getOrganizer(db, account.owner_user_id))?.legal_name
    } catch (error) {
      return fail(dbErrorMessage(error as { message?: string; code?: string }))
    }
    if (!accountNameMatches(senderName, legalName)) {
      return fail(
        `Tên người chuyển "${senderName}" không trùng tên pháp lý "${legalName ?? "—"}". Không xác minh tài khoản này.`
      )
    }
    recordedEvidence = `Người chuyển: ${senderName}. ${evidence}`
    // The database keeps at most 500 characters; never cut the bank reference off.
    if (recordedEvidence.length > 500) return fail("Bằng chứng quá dài. Hãy rút gọn còn khoảng 350 ký tự.")
  }

  const { error } = await dbService().rpc("review_receiving_account", {
    p_receiving_account_id: accountId,
    p_decision: decision,
    p_reviewer_id: session.user.id,
    p_evidence: decision === "verified" ? recordedEvidence : null,
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
