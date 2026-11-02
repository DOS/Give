"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { getCampaignById, isStaff } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { getIncoming, MAX_EXPLANATION_LENGTH, paidAfterExplain, paidBreakdown } from "@/lib/reconciliation"
import { inboundExplanationLabel, isInboundExplanationKind } from "@/lib/statement"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * Explains an unmatched incoming transaction as money that is not a donation
 * (an organizer top-up, a bank fee refund or correction, interest), by finance/admin staff only
 * (DOS/Give#49). give.explain_inbound_transaction runs as the service role
 * with the actor's id as an argument and checks the role and the transaction
 * under its locks. Because it trusts the id, the staff role and the
 * transaction are first read with the actor's own token: PostgREST verifies
 * that token, so a forged session cookie fails here. Works for transactions
 * of any campaign status, cancelled and closed included, so the account can
 * be released afterwards.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_ALLOWED = "Chỉ nhân viên tài chính hoặc quản trị viên mới giải trình được tiền vào."
const TX_NOT_FOUND = dbErrorMessage({ message: "GIVE_TRANSACTION_NOT_FOUND" })

const EXPLAIN_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: NOT_ALLOWED,
  GIVE_TRANSACTION_ALREADY_MATCHED:
    "Giao dịch này đã được khớp với một lượt ủng hộ, nên không giải trình là tiền khác được.",
  GIVE_TRANSACTION_ALREADY_EXPLAINED:
    "Giao dịch này đã được giải trình với nội dung khác. Giải trình đã ghi thì không sửa được.",
  GIVE_TRANSACTION_NOT_INBOUND: "Chỉ giải trình được các khoản tiền vào ở đây; khoản chi do người tổ chức giải trình.",
  GIVE_TRANSACTION_UNATTRIBUTED:
    "Giao dịch này chưa thuộc chiến dịch nào (tài khoản không gắn với chiến dịch lúc nhận tiền), nên không cần giải trình.",
  GIVE_EXPLANATION_KIND_INVALID: "Chọn loại khoản tiền.",
  GIVE_REASON_REQUIRED: "Ghi lý do vì sao đây không phải tiền ủng hộ.",
  GIVE_EVIDENCE_REQUIRED:
    "Ghi bằng chứng đã kiểm tra (ví dụ: thư của ngân hàng, dòng sao kê, tin nhắn của người tổ chức).",
  GIVE_EXPLANATION_TOO_LONG: `Lý do và bằng chứng mỗi phần tối đa ${MAX_EXPLANATION_LENGTH} ký tự.`,
  GIVE_LEDGER_POST_MISSING: "Giao dịch chưa được ghi sổ là tiền chưa khớp. Hãy thử lại sau ít phút.",
}

export async function explainTransaction(
  transactionId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(transactionId)) return fail(TX_NOT_FOUND)
  const kind = String(form.get("kind") ?? "")
  // Browsers submit line breaks as CRLF; count and store them as one character.
  const reason = String(form.get("reason") ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
  const evidence = String(form.get("evidence") ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
  if (!isInboundExplanationKind(kind)) return fail(EXPLAIN_MESSAGES.GIVE_EXPLANATION_KIND_INVALID)
  if (!reason) return fail(EXPLAIN_MESSAGES.GIVE_REASON_REQUIRED)
  if (!evidence) return fail(EXPLAIN_MESSAGES.GIVE_EVIDENCE_REQUIRED)
  // Counted in characters (code points), as the database's char_length does.
  if ([...reason].length > MAX_EXPLANATION_LENGTH || [...evidence].length > MAX_EXPLANATION_LENGTH) {
    return fail(EXPLAIN_MESSAGES.GIVE_EXPLANATION_TOO_LONG)
  }

  const db = dbAs(session.accessToken)
  let tx, campaign, before
  try {
    if (!(await isStaff(db, FINANCE_ROLES))) return fail(NOT_ALLOWED)
    tx = await getIncoming(db, transactionId)
    if (!tx) return fail(TX_NOT_FOUND)
    if (tx.direction !== "in") return fail(EXPLAIN_MESSAGES.GIVE_TRANSACTION_NOT_INBOUND)
    if (!tx.campaign_id) return fail(EXPLAIN_MESSAGES.GIVE_TRANSACTION_UNATTRIBUTED)
    if (tx.matched_to) return fail(EXPLAIN_MESSAGES.GIVE_TRANSACTION_ALREADY_MATCHED)
    campaign = await getCampaignById(db, tx.campaign_id)
    if (!campaign) return fail(TX_NOT_FOUND)
    before = await paidBreakdown(db, campaign.id)
  } catch (error) {
    return fail(dbErrorMessage(error as DbErrorLike))
  }

  // An explanation already stored with the same values is answered as done;
  // a different one is refused by the database.
  const { error } = await dbService().rpc("explain_inbound_transaction", {
    p_bank_transaction_id: tx.id,
    p_actor_id: session.user.id,
    p_kind: kind,
    p_reason: reason,
    p_evidence: evidence,
  })
  if (error) return fail(dbErrorMessage(error, EXPLAIN_MESSAGES))

  let after = null
  try {
    after = await paidBreakdown(db, campaign.id)
  } catch {
    // The explanation is recorded; only the totals line is left out.
  }

  revalidatePath("/admin/unmatched")
  revalidatePath(`/me/campaigns/${campaign.id}/unmatched`)
  revalidatePath(`/me/campaigns/${campaign.id}`)
  revalidatePath(`/campaigns/${campaign.slug}`)
  revalidatePath(`/campaigns/${campaign.slug}/statement`)
  return done(
    `Đã giải trình giao dịch ${formatVnd(tx.amount)} là "${inboundExplanationLabel(kind)}". Giao dịch không còn chặn việc nhả tài khoản nhận.${paidAfterExplain(before, after)}`
  )
}
