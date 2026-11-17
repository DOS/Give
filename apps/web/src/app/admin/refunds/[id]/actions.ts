"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { getCampaignById, isStaff, type CampaignWithRefs } from "@/lib/campaigns"
import { readEvidence, refusedByDatabase, storeEvidence } from "@/lib/disbursement-evidence"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { OWN_CONTRIBUTION_MESSAGES } from "@/lib/own-contribution"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { explainSchema, getOutgoing, getRefundable } from "@/lib/statement"
import { dbAs, dbService } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * Finance or admin staff explain a campaign's transfer out as a refund to a
 * chosen contribution (DOS/Give#203): the path for a refund the organizer
 * cannot book, to their own contribution (GIVE_SELF_REVIEW, DOS/Give#199).
 * give.record_disbursement runs as the service role and takes the actor's id
 * as an argument; give.actor_manages_campaign admits finance and admin staff
 * for any campaign and the function repeats every check under its locks. The
 * session id is decoded from the cookie WITHOUT verification, so the staff
 * role, the campaign, the transaction and the contribution are first read
 * with the actor's own token: PostgREST verifies that token, so a forged
 * cookie fails here. Only refunds: other spending stays the organizer's to
 * explain. The validation, evidence upload and refusals are the organizer
 * form's (explainSchema, lib/disbursement-evidence).
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_ALLOWED = "Chỉ nhân viên tài chính hoặc quản trị viên ghi được khoản hoàn tiền cho chiến dịch."
const TX_NOT_FOUND = dbErrorMessage({ message: "GIVE_TRANSACTION_NOT_FOUND" })
const RETURNED_NOT_EXPLAINABLE =
  "Khoản chuyển này đã được ghi nhận là bị ngân hàng trả lại, nên không ghi được là hoàn tiền. Hãy tải lại trang."
const OWN_ACCOUNT_TRANSFER =
  "Khoản chuyển này đã được đánh dấu là chuyển sang tài khoản mới của chiến dịch, nên không ghi được là hoàn tiền. Hãy tải lại trang."

/** The database's refusals worded for staff. */
const STAFF_REFUND_MESSAGES: Record<string, string> = {
  GIVE_SELF_REVIEW: OWN_CONTRIBUTION_MESSAGES.refundAsStaff,
  GIVE_NOT_ALLOWED: NOT_ALLOWED,
  // The transfer was read above, so here it means the staff role ended in between (actor_manages_campaign).
  GIVE_TRANSACTION_NOT_FOUND: `${NOT_ALLOWED} Nếu bạn vẫn là nhân viên tài chính, hãy tải lại trang.`,
  GIVE_TRANSACTION_OWN_TRANSFER: OWN_ACCOUNT_TRANSFER,
}

function refresh(campaign: CampaignWithRefs) {
  revalidatePath("/admin/refunds")
  revalidatePath(`/admin/refunds/${campaign.id}`)
  revalidatePath(`/me/campaigns/${campaign.id}/disbursements`)
  revalidatePath(`/me/campaigns/${campaign.id}`)
  revalidatePath(`/campaigns/${campaign.slug}`)
  revalidatePath(`/campaigns/${campaign.slug}/statement`)
}

/** Explains one transfer out of the campaign as a refund to the chosen contribution, with evidence images. */
export async function recordStaffRefund(
  campaignId: string,
  transactionId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  // Always the refund category: the same schema then requires a contribution.
  const parsed = explainSchema.safeParse({
    ...formFields(form, ["purpose", "recipient", "refund_contribution_id", "evidence_kind"]),
    category: "refund",
  })
  if (!parsed.success) return fail(firstError(parsed.error))
  const input = parsed.data
  if (!input.refund_contribution_id) return fail("Khoản hoàn tiền cần chọn lượt ủng hộ được hoàn")
  if (!isUuid(campaignId)) return fail(dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" }))
  if (!isUuid(transactionId)) return fail(TX_NOT_FOUND)

  const db = dbAs(session.accessToken)
  let campaign: CampaignWithRefs | null
  let amount: number
  try {
    // The role first, with the actor's own token (a forged cookie fails here).
    if (!(await isStaff(db, FINANCE_ROLES))) return fail(NOT_ALLOWED)
    const [found, tx] = await Promise.all([getCampaignById(db, campaignId), getOutgoing(db, campaignId, transactionId)])
    campaign = found
    if (!campaign) return fail(dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" }))
    if (!tx) return fail(TX_NOT_FOUND)
    if (tx.disbursement) return fail(dbErrorMessage({ message: "GIVE_DISBURSEMENT_ALREADY_EXPLAINED" }))
    if (tx.returned) return fail(RETURNED_NOT_EXPLAINABLE)
    amount = tx.amount

    const contribution = await getRefundable(db, campaign.id, input.refund_contribution_id, session.user)
    if (!contribution) {
      return fail("Lượt ủng hộ này không thuộc chiến dịch, hoặc đã được hoàn hết số tiền đã chuyển vào.")
    }
    // The picker leaves the staff member's own contributions out (DOS/Give#199).
    if (contribution.own) return fail(OWN_CONTRIBUTION_MESSAGES.refundAsStaff)
    if (amount > contribution.refundable_amount) {
      return fail(
        `Khoản hoàn ${formatVnd(amount)} lớn hơn số còn hoàn được cho lượt ủng hộ ${contribution.reference_code} (${formatVnd(contribution.refundable_amount)}).`
      )
    }
  } catch (error) {
    return fail(dbErrorMessage(error as DbErrorLike))
  }

  const images = await readEvidence(form)
  if (typeof images === "string") return fail(images)
  const stored = await storeEvidence(campaign.id, transactionId, images, input.evidence_kind)
  if (typeof stored === "string") return fail(stored)

  const { data, error } = await dbService()
    .rpc("record_disbursement", {
      p_bank_transaction_id: transactionId,
      p_actor_id: session.user.id,
      p_purpose: input.purpose,
      p_category: "refund",
      p_recipient: input.recipient,
      p_is_refund: true,
      p_refund_contribution_id: input.refund_contribution_id,
      p_evidence: stored.evidence,
    })
    .single()
  if (error) {
    if (refusedByDatabase(error)) await stored.cleanup()
    return fail(dbErrorMessage(error, STAFF_REFUND_MESSAGES))
  }

  refresh(campaign)
  // A repeated submission (a double click) hit the stored explanation:
  // nothing was written, not even this call's evidence.
  if ((data as { replayed?: boolean } | null)?.replayed === true) {
    await stored.cleanup()
    return done(
      stored.evidence.length > 0
        ? "Khoản chuyển này đã được ghi là hoàn tiền từ trước. Ảnh vừa tải không được lưu."
        : "Khoản chuyển này đã được ghi là hoàn tiền từ trước."
    )
  }
  return done(
    `Đã ghi khoản ${formatVnd(amount)} là hoàn tiền. Khoản này không còn tính là chưa giải trình, và sao kê công khai đã cập nhật.`
  )
}
