"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { getCampaignById, isStaff } from "@/lib/campaigns"
import {
  CORRECT_EXPLANATION_MESSAGES,
  dbErrorMessage,
  done,
  fail,
  type ActionResult,
  type DbErrorLike,
} from "@/lib/errors"
import { formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import {
  explainersOf,
  findContribution,
  getIncoming,
  MAX_CORRECTION_REASON_LENGTH,
  MAX_EXPLANATION_LENGTH,
  paidAfterCorrect,
  paidAfterExplain,
  paidAfterReturn,
  paidBreakdown,
  UNATTRIBUTED_CAUSES,
  type ReturnOutcome,
} from "@/lib/reconciliation"
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
/** A transaction linked as returned money since the page loaded (DOS/Give#72). */
const ALREADY_LINKED_AS_RETURN =
  "Giao dịch này đã được ghi nhận là tiền bị ngân hàng trả lại, nên không giải trình được nữa. Hãy tải lại trang."

const EXPLAIN_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: NOT_ALLOWED,
  GIVE_TRANSACTION_ALREADY_MATCHED:
    "Giao dịch này đã được khớp với một lượt ủng hộ, nên không giải trình là tiền khác được.",
  GIVE_TRANSACTION_ALREADY_EXPLAINED:
    "Giao dịch này đã được giải trình với nội dung khác. Giải trình đã ghi thì không sửa được.",
  GIVE_TRANSACTION_NOT_INBOUND: "Chỉ giải trình được các khoản tiền vào ở đây; khoản chi do người tổ chức giải trình.",
  GIVE_TRANSACTION_UNATTRIBUTED: `Giao dịch này không thuộc chiến dịch nào, nên không cần giải trình. Lý do có thể là: ${UNATTRIBUTED_CAUSES}.`,
  GIVE_EXPLANATION_KIND_INVALID: "Chọn loại khoản tiền.",
  GIVE_REASON_REQUIRED: "Ghi lý do vì sao đây không phải tiền ủng hộ.",
  GIVE_EVIDENCE_REQUIRED:
    "Ghi bằng chứng đã kiểm tra (ví dụ: thư của ngân hàng, dòng sao kê, tin nhắn của người tổ chức).",
  GIVE_EXPLANATION_TOO_LONG: `Lý do và bằng chứng mỗi phần tối đa ${MAX_EXPLANATION_LENGTH} ký tự.`,
  GIVE_LEDGER_POST_MISSING:
    "Giao dịch chưa được ghi sổ là tiền chưa khớp, hoặc vừa được xử lý ở nơi khác. Hãy tải lại trang; nếu vẫn lỗi, thử lại sau ít phút.",
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
    if (tx.returned_of) return fail(ALREADY_LINKED_AS_RETURN)
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

// ---------------------------------------------------------------------------
// Money a bank returned from a transfer out (DOS/Give#72)
// ---------------------------------------------------------------------------

const RETURN_NOT_ALLOWED = "Chỉ nhân viên tài chính hoặc quản trị viên mới ghi nhận được tiền bị trả lại."

/**
 * give.link_returned_transfer's refusals, worded for this form. Codes it
 * shares with other actions are worded here; the codes only it raises have
 * their text in lib/errors.ts.
 */
const RETURN_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: RETURN_NOT_ALLOWED,
  GIVE_REASON_REQUIRED: "Ghi lý do vì sao đây là tiền bị trả lại của khoản đã chọn.",
  GIVE_EVIDENCE_REQUIRED:
    "Ghi bằng chứng đã kiểm tra (ví dụ: thông báo trả tiền của ngân hàng, dòng sao kê, mã giao dịch gốc).",
  GIVE_EXPLANATION_TOO_LONG: `Lý do và bằng chứng mỗi phần tối đa ${MAX_EXPLANATION_LENGTH} ký tự.`,
  GIVE_TRANSACTION_NOT_INBOUND: "Khoản bị trả lại phải là một khoản tiền vào.",
  GIVE_TRANSACTION_UNATTRIBUTED: `Giao dịch này không thuộc chiến dịch nào, nên không ghi nhận được là tiền bị trả lại của chiến dịch. Lý do có thể là: ${UNATTRIBUTED_CAUSES}.`,
  GIVE_TRANSACTION_NOT_OUTBOUND: "Khoản chi gốc phải là một khoản tiền ra.",
  GIVE_TRANSACTION_ALREADY_MATCHED:
    "Giao dịch này đã được khớp với một lượt ủng hộ, nên không ghi nhận được là tiền bị trả lại.",
  GIVE_TRANSACTION_ALREADY_EXPLAINED:
    "Giao dịch này đã được giải trình là không phải tiền ủng hộ, nên không ghi nhận được là tiền bị trả lại. Giải trình đã ghi thì không sửa được.",
  GIVE_TRANSACTION_OWN_TRANSFER:
    "Một trong hai giao dịch là khoản chuyển giữa các tài khoản của chiến dịch, nên không ghi nhận được là tiền bị trả lại.",
  GIVE_LEDGER_POST_MISSING:
    "Một trong hai giao dịch chưa được ghi sổ đầy đủ, hoặc khoản tiền vào đã được xử lý. Hãy tải lại trang; nếu vẫn lỗi, thử lại sau ít phút.",
}

/**
 * Links an incoming transaction still in 'unmatched_in' to the outgoing
 * transaction the bank returned it from (a bounced payment or refund), by
 * finance/admin staff only. give.link_returned_transfer runs as the service
 * role with the actor's id and checks the role, both transactions and the
 * ledger under its locks (same campaign, account and asset, an amount not
 * above the original, booked no earlier, the original explained). As for an
 * explanation, the staff role and the incoming transaction are read first
 * with the actor's own token, so a forged session cookie fails here.
 */
export async function linkReturnedTransfer(
  transactionId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(transactionId)) return fail(TX_NOT_FOUND)
  const originalId = String(form.get("original_transaction_id") ?? "")
  // Browsers submit line breaks as CRLF; count and store them as one character.
  const reason = String(form.get("reason") ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
  const evidence = String(form.get("evidence") ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
  if (!originalId) return fail("Chọn khoản chuyển đi gốc đã bị ngân hàng trả lại.")
  if (!isUuid(originalId)) return fail(dbErrorMessage({ message: "GIVE_ORIGINAL_TRANSACTION_NOT_FOUND" }))
  if (!reason) return fail(RETURN_MESSAGES.GIVE_REASON_REQUIRED)
  if (!evidence) return fail(RETURN_MESSAGES.GIVE_EVIDENCE_REQUIRED)
  // Counted in characters (code points), as the database's char_length does.
  if ([...reason].length > MAX_EXPLANATION_LENGTH || [...evidence].length > MAX_EXPLANATION_LENGTH) {
    return fail(RETURN_MESSAGES.GIVE_EXPLANATION_TOO_LONG)
  }

  const db = dbAs(session.accessToken)
  let tx, campaign, before
  try {
    if (!(await isStaff(db, FINANCE_ROLES))) return fail(RETURN_NOT_ALLOWED)
    tx = await getIncoming(db, transactionId)
    if (!tx) return fail(TX_NOT_FOUND)
    if (tx.direction !== "in") return fail(RETURN_MESSAGES.GIVE_TRANSACTION_NOT_INBOUND)
    if (!tx.campaign_id) return fail(RETURN_MESSAGES.GIVE_TRANSACTION_UNATTRIBUTED)
    if (tx.matched_to) return fail(RETURN_MESSAGES.GIVE_TRANSACTION_ALREADY_MATCHED)
    if (tx.explained_as) return fail(RETURN_MESSAGES.GIVE_TRANSACTION_ALREADY_EXPLAINED)
    campaign = await getCampaignById(db, tx.campaign_id)
    if (!campaign) return fail(TX_NOT_FOUND)
    before = await paidBreakdown(db, campaign.id)
  } catch (error) {
    return fail(dbErrorMessage(error as DbErrorLike))
  }

  // A link already stored with the same values is answered as a replay; any
  // other second link of either transaction is refused by the database.
  const { data, error } = await dbService()
    .rpc("link_returned_transfer", {
      p_bank_transaction_id: tx.id,
      p_original_transaction_id: originalId,
      p_actor_id: session.user.id,
      p_reason: reason,
      p_evidence: evidence,
    })
    .maybeSingle()
  if (error) return fail(dbErrorMessage(error, RETURN_MESSAGES))
  const result = data as { outcome: ReturnOutcome; replayed: boolean } | null

  revalidatePath("/admin/unmatched")
  revalidatePath(`/me/campaigns/${campaign.id}/unmatched`)
  revalidatePath(`/me/campaigns/${campaign.id}/disbursements`)
  revalidatePath(`/me/campaigns/${campaign.id}`)
  revalidatePath(`/campaigns/${campaign.slug}`)
  revalidatePath(`/campaigns/${campaign.slug}/statement`)

  if (result?.replayed) {
    return done(
      "Khoản tiền này đã được ghi nhận là tiền bị trả lại từ trước, với cùng khoản chuyển đi gốc, lý do và bằng chứng. Không có gì thay đổi."
    )
  }

  let after = null
  let original: number | null = null
  try {
    after = await paidBreakdown(db, campaign.id)
  } catch {
    // The link is recorded; only the totals line is left out.
  }
  if (result?.outcome === "refund_returned") {
    // The refunded total drops by the original refund, fee included (DOS/Give#195).
    try {
      const read = await db.from("bank_transactions").select("amount").eq("id", originalId).maybeSingle()
      const amount = Number((read.data as { amount?: unknown } | null)?.amount)
      if (!read.error && Number.isFinite(amount) && amount >= tx.amount) original = amount
    } catch {
      // The link is recorded; the message names no amounts for the refund.
    }
  }
  return done(returnedMessage(result?.outcome ?? null, tx.amount, original) + paidAfterReturn(before, after, tx.amount))
}

/**
 * What the link changed, in words; the refund case asks for a new refund.
 * A returned refund counts zero, fee included: the fee the bank kept is a
 * bank fee in "đã chi" that the organizer bears, and the backer is owed the
 * full refund again (DOS/Give#195). `original` is the refund's amount, null
 * when it could not be read.
 */
function returnedMessage(outcome: ReturnOutcome | null, amount: number, original: number | null = null): string {
  const head = `Đã ghi nhận ${formatVnd(amount)} là tiền bị ngân hàng trả lại`
  const statement = " Sao kê công khai hiện hai giao dịch là một khoản chuyển bị trả lại."
  if (outcome === "refund_returned") {
    const fee = original === null ? 0 : original - amount
    const notices =
      " Nếu đó là một cam kết nay còn phải được hoàn tiền, Give đã gửi thông báo cho người tổ chức (và cho người ủng hộ nếu cam kết trở lại trạng thái Chờ hoàn tiền); các trường hợp khác (như một lượt ủng hộ trực tiếp) không có thông báo tự động."
    const ask =
      "hãy báo người tổ chức hoàn lại cho người ủng hộ (kiểm tra lại số tài khoản nhận) rồi giải trình khoản hoàn mới."
    let text: string
    if (original === null) {
      text = `${head} của một khoản hoàn tiền. Tổng đã hoàn của chiến dịch giảm đúng bằng số tiền của khoản hoàn tiền gốc (kể cả phần phí nếu ngân hàng giữ lại; phần phí tính vào tổng đã chi), và lượt ủng hộ đó lại cần được hoàn đủ: ${ask}`
    } else if (fee > 0) {
      text = `${head} của khoản hoàn tiền ${formatVnd(original)}; ngân hàng giữ ${formatVnd(fee)} phí. Cả khoản hoàn không còn tính là đã hoàn: tổng đã hoàn của chiến dịch giảm ${formatVnd(original)}, phí ${formatVnd(fee)} tính vào tổng đã chi, và người ủng hộ lại cần được hoàn đủ ${formatVnd(original)} (người tổ chức chịu phí): ${ask}`
    } else {
      text = `${head} của một khoản hoàn tiền. Tổng đã hoàn của chiến dịch giảm ${formatVnd(original)}, và lượt ủng hộ đó lại cần được hoàn tiền: ${ask}`
    }
    return text + notices + statement
  }
  if (outcome === "disbursement_returned") {
    return `${head} của một khoản chi. Tổng đã chi của chiến dịch giảm ${formatVnd(amount)}.` + statement
  }
  return `${head}.` + statement
}

// ---------------------------------------------------------------------------
// Correcting a mistaken explanation (DOS/Give#71)
// ---------------------------------------------------------------------------

const ADMIN_ONLY = ["admin"] as const
const CORRECTION_SELF_REVIEW = CORRECT_EXPLANATION_MESSAGES.GIVE_SELF_REVIEW

/**
 * Corrects an explanation of incoming money as "not a donation" that was a
 * donation after all: the money is credited to a contribution of the same
 * campaign, with a required reason, by an admin only (not finance: the
 * correction undoes a finance decision), and never by the campaign's
 * organizer, the person who explained it or the contributor
 * (GIVE_SELF_REVIEW). give.correct_inbound_explanation runs as the service
 * role with the actor's id and checks all of it under its locks; as for an
 * explanation, the role, the transaction, the campaign, the contribution and
 * the explainer are first read with the actor's own token, so a forged
 * session cookie fails here. One correction per transaction; a retry with
 * the same contribution and reason is answered as a replay.
 */
export async function correctExplanation(
  transactionId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(transactionId)) return fail(TX_NOT_FOUND)
  const contributionId = String(form.get("contribution_id") ?? "")
  // Browsers submit line breaks as CRLF; count and store them as one character.
  const reason = String(form.get("reason") ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
  if (!contributionId) return fail(CORRECT_EXPLANATION_MESSAGES.GIVE_CONTRIBUTION_REQUIRED)
  if (!isUuid(contributionId)) return fail("Lượt ủng hộ không hợp lệ.")
  if (!reason) return fail(CORRECT_EXPLANATION_MESSAGES.GIVE_REASON_REQUIRED)
  // Counted in characters (code points), as the database's char_length does.
  if ([...reason].length > MAX_CORRECTION_REASON_LENGTH) return fail(CORRECT_EXPLANATION_MESSAGES.GIVE_REASON_TOO_LONG)

  const userId = session.user.id
  const db = dbAs(session.accessToken)
  let tx, campaign, contribution, before
  try {
    if (!(await isStaff(db, ADMIN_ONLY))) return fail(CORRECT_EXPLANATION_MESSAGES.GIVE_NOT_ALLOWED)
    tx = await getIncoming(db, transactionId)
    if (!tx) return fail(TX_NOT_FOUND)
    if (tx.direction !== "in") return fail(CORRECT_EXPLANATION_MESSAGES.GIVE_TRANSACTION_NOT_INBOUND)
    if (!tx.campaign_id) return fail(CORRECT_EXPLANATION_MESSAGES.GIVE_TRANSACTION_UNATTRIBUTED)
    // Corrected already: only the exact same correction is a replay, and the database decides that.
    if (tx.corrected_to && tx.corrected_to !== contributionId) {
      return fail(CORRECT_EXPLANATION_MESSAGES.GIVE_EXPLANATION_ALREADY_CORRECTED)
    }
    if (!tx.corrected_to) {
      if (tx.matched_to) return fail(CORRECT_EXPLANATION_MESSAGES.GIVE_TRANSACTION_ALREADY_MATCHED)
      if (!tx.explained_as) return fail(CORRECT_EXPLANATION_MESSAGES.GIVE_TRANSACTION_NOT_EXPLAINED)
    }
    campaign = await getCampaignById(db, tx.campaign_id)
    if (!campaign) return fail(TX_NOT_FOUND)
    if (campaign.organizer_id === userId) return fail(CORRECTION_SELF_REVIEW)
    contribution = await findContribution(db, campaign.id, { id: contributionId })
    if (!contribution) return fail(CORRECT_EXPLANATION_MESSAGES.GIVE_CONTRIBUTION_CAMPAIGN_MISMATCH)
    if (contribution.contributor_user_id === userId) return fail(CORRECTION_SELF_REVIEW)
    if ((await explainersOf(db, [tx.id])).get(tx.id) === userId) return fail(CORRECTION_SELF_REVIEW)
    before = await paidBreakdown(db, campaign.id)
  } catch (error) {
    return fail(dbErrorMessage(error as DbErrorLike, CORRECT_EXPLANATION_MESSAGES))
  }

  const { data, error } = await dbService()
    .rpc("correct_inbound_explanation", {
      p_bank_transaction_id: tx.id,
      p_actor_id: userId,
      p_contribution_id: contribution.id,
      p_reason: reason,
    })
    .maybeSingle()
  if (error) return fail(dbErrorMessage(error, CORRECT_EXPLANATION_MESSAGES))
  const result = data as { outcome: string; contribution_id: string; replayed: boolean } | null

  revalidatePath("/admin/unmatched")
  revalidatePath(`/me/campaigns/${campaign.id}/unmatched`)
  revalidatePath(`/me/campaigns/${campaign.id}`)
  revalidatePath(`/campaigns/${campaign.slug}`)
  revalidatePath(`/campaigns/${campaign.slug}/statement`)

  if (result?.replayed) {
    return done(
      `Giải trình này đã được sửa từ trước, với cùng lượt ủng hộ ${contribution.reference_code} và cùng lý do. Không có gì thay đổi.`
    )
  }

  let after = null
  try {
    after = await paidBreakdown(db, campaign.id)
  } catch {
    // The correction is recorded; only the totals line is left out.
  }
  return done(
    `Đã sửa giải trình: ${formatVnd(tx.amount)} nay là tiền của lượt ủng hộ ${contribution.reference_code}, không còn tính là "không phải tiền ủng hộ". Sao kê công khai hiện giao dịch này là tiền ủng hộ.${paidAfterCorrect(before, after)}`
  )
}
