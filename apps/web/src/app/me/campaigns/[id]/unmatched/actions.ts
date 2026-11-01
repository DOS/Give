"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { getCampaignById, isStaff } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import {
  findContribution,
  getIncoming,
  MATCHABLE_STATUSES,
  normalizeReferenceCode,
  paidAfterMatch,
  paidBreakdown,
  REFERENCE_CODE,
} from "@/lib/reconciliation"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * Manual match of an 'unmatched_in' transaction to a contribution of the same
 * campaign, by its organizer or finance/admin staff (design section 2.4,
 * test 14). give.match_transaction runs as the service role with the actor's
 * id as an argument and checks the campaign, the transaction and the
 * contribution under its locks. Because it trusts the id, the transaction,
 * the campaign and the contribution are first read with the actor's own
 * token: PostgREST verifies that token, so a forged session cookie fails
 * here. Used by /me/campaigns/[id]/unmatched and /admin/unmatched.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const TX_NOT_FOUND = dbErrorMessage({ message: "GIVE_TRANSACTION_NOT_FOUND" })

const MATCH_MESSAGES: Record<string, string> = {
  GIVE_TRANSACTION_ALREADY_MATCHED:
    "Giao dịch này đã được khớp với một lượt ủng hộ khác. Mỗi giao dịch chỉ được khớp một lần.",
  GIVE_CONTRIBUTION_NOT_MATCHABLE:
    "Lượt ủng hộ này không nhận thêm tiền được (đã hủy, đã hoàn tiền hoặc không thuộc chiến dịch của giao dịch).",
  GIVE_TRANSACTION_NOT_INBOUND: "Chỉ khớp được các khoản tiền vào.",
  GIVE_TRANSACTION_UNATTRIBUTED:
    "Giao dịch này chưa thuộc chiến dịch nào (tài khoản không gắn với chiến dịch lúc nhận tiền), nên chưa khớp được.",
}

export async function matchTransaction(
  transactionId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(transactionId)) return fail(TX_NOT_FOUND)
  const picked = String(form.get("contribution_id") ?? "")
  const typed = normalizeReferenceCode(String(form.get("reference_code") ?? ""))
  if (picked && typed) return fail("Chọn lượt ủng hộ trong danh sách hoặc nhập mã ủng hộ, không cả hai.")
  if (!picked && !typed) return fail("Chọn lượt ủng hộ cần khớp, hoặc nhập mã ủng hộ.")
  if (picked && !isUuid(picked)) return fail("Lượt ủng hộ không hợp lệ.")
  if (typed && !REFERENCE_CODE.test(typed)) return fail(`"${typed}" không phải mã ủng hộ hợp lệ (dạng GV và 7 ký tự).`)

  const db = dbAs(session.accessToken)
  let tx, campaign, contribution, before
  try {
    tx = await getIncoming(db, transactionId)
    if (!tx || tx.direction !== "in") return fail(TX_NOT_FOUND)
    if (!tx.campaign_id) return fail(MATCH_MESSAGES.GIVE_TRANSACTION_UNATTRIBUTED)
    campaign = await getCampaignById(db, tx.campaign_id)
    // The account's owner may read the transaction too; matching is for the
    // campaign's organizer and finance/admin staff (give.actor_manages_campaign).
    if (!campaign || (campaign.organizer_id !== session.user.id && !(await isStaff(db, FINANCE_ROLES)))) {
      return fail(TX_NOT_FOUND)
    }
    contribution = await findContribution(db, campaign.id, picked ? { id: picked } : { referenceCode: typed })
    if (!contribution) return fail("Không tìm thấy lượt ủng hộ này trong chiến dịch của giao dịch.")
    if (tx.matched_to) {
      return tx.matched_to === contribution.id
        ? done(`Giao dịch đã được khớp với lượt ủng hộ ${contribution.reference_code} từ trước.`)
        : fail(MATCH_MESSAGES.GIVE_TRANSACTION_ALREADY_MATCHED)
    }
    if (!(MATCHABLE_STATUSES as readonly string[]).includes(contribution.status)) {
      return fail(MATCH_MESSAGES.GIVE_CONTRIBUTION_NOT_MATCHABLE)
    }
    before = await paidBreakdown(db, campaign.id)
  } catch (error) {
    return fail(dbErrorMessage(error as DbErrorLike))
  }

  const { error } = await dbService()
    .rpc("match_transaction", {
      p_bank_transaction_id: tx.id,
      p_contribution_id: contribution.id,
      p_actor_id: session.user.id,
    })
    .single()
  if (error) return fail(dbErrorMessage(error, MATCH_MESSAGES))

  let after = null
  try {
    after = await paidBreakdown(db, campaign.id)
  } catch {
    // The match is recorded; only the totals line is left out.
  }

  revalidatePath(`/me/campaigns/${campaign.id}/unmatched`)
  revalidatePath(`/me/campaigns/${campaign.id}`)
  revalidatePath("/admin/unmatched")
  revalidatePath(`/campaigns/${campaign.slug}`)
  revalidatePath(`/campaigns/${campaign.slug}/statement`)
  return done(
    `Đã khớp giao dịch ${formatVnd(tx.amount)} với lượt ủng hộ ${contribution.reference_code}.${paidAfterMatch(before, after)}`
  )
}
