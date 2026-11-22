"use server"

import { revalidatePath } from "next/cache"

import { getSession, type Session } from "@/lib/auth/session"
import { getCampaignById, type CampaignWithRefs } from "@/lib/campaigns"
import { readEvidence, refusedByDatabase, storeEvidence } from "@/lib/disbursement-evidence"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { listEvidenceStates } from "@/lib/evidence-moderation"
import { formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { OWN_CONTRIBUTION_MESSAGES } from "@/lib/own-contribution"
import {
  explainSchema,
  getOutgoing,
  getRefundable,
  isEvidenceKind,
  MAX_EVIDENCE_PER_TRANSACTION,
  setDisbursementMilestoneSchema,
  type Disbursement,
  type OutgoingTransaction,
} from "@/lib/statement"
import { dbAs, dbService } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * Organizer explanations of outgoing transactions (design section 4.1 step
 * 10). give.record_disbursement and give.add_disbursement_evidence run as the
 * service role and take the acting user's id as an argument. The session
 * user id is decoded from the cookie WITHOUT verification, so each action
 * first reads the campaign and the transaction with the user's own token and
 * stops on any error: PostgREST verifies that token, which proves the id.
 * The functions re-check ownership and state under their locks.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const TX_NOT_FOUND = dbErrorMessage({ message: "GIVE_TRANSACTION_NOT_FOUND" })
/** A transfer the bank sent back never left the campaign (DOS/Give#194). */
const RETURNED_NOT_EXPLAINABLE =
  "Giao dịch này đã được ghi nhận là bị ngân hàng trả lại. Bộ phận tài chính của Give sẽ xử lý, bạn không giải trình nó như một khoản chi. Hãy tải lại trang."

/** give.record_disbursement refuses a refund to the organizer's own contribution (DOS/Give#199). */
const REFUND_MESSAGES: Record<string, string> = { GIVE_SELF_REVIEW: OWN_CONTRIBUTION_MESSAGES.refund }

type Loaded = {
  campaign: CampaignWithRefs
  tx: OutgoingTransaction
  disbursement: Disbursement | null
  explained: boolean
  /** Finance linked money the bank returned to this transfer (give.returned_transfers). */
  returned: boolean
  evidenceCount: number
}

/** The organizer's own campaign and one of its outgoing transactions, read under RLS. */
async function load(session: Session, campaignId: string, transactionId: string): Promise<Loaded | string> {
  if (!isUuid(campaignId)) return dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" })
  if (!isUuid(transactionId)) return TX_NOT_FOUND
  const db = dbAs(session.accessToken)
  try {
    const [campaign, tx] = await Promise.all([
      getCampaignById(db, campaignId),
      getOutgoing(db, campaignId, transactionId),
    ])
    // Finance staff can read every campaign; explaining is the organizer's.
    if (!campaign || campaign.organizer_id !== session.user.id) {
      return dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" })
    }
    if (!tx) return TX_NOT_FOUND
    const { disbursement, returned, ...rest } = tx
    // Images staff hid do not count towards the cap, so the organizer can
    // always upload the redacted copy staff asked for.
    const evidence = disbursement?.evidence ?? []
    const states = await listEvidenceStates(
      db,
      evidence.map((e) => e.id)
    )
    const evidenceCount = evidence.filter((e) => !states.get(e.id)?.hidden).length
    return { campaign, tx: rest, disbursement, explained: disbursement !== null, returned, evidenceCount }
  } catch (error) {
    return dbErrorMessage(error as DbErrorLike)
  }
}

function refresh(campaign: CampaignWithRefs) {
  revalidatePath(`/me/campaigns/${campaign.id}/disbursements`)
  revalidatePath(`/me/campaigns/${campaign.id}`)
  revalidatePath(`/campaigns/${campaign.slug}`)
  revalidatePath(`/campaigns/${campaign.slug}/statement`)
}

/** Explains one outgoing transaction, optionally as a refund, with evidence images. */
export async function explainDisbursement(
  campaignId: string,
  transactionId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const parsed = explainSchema.safeParse(
    formFields(form, ["purpose", "category", "recipient", "refund_contribution_id", "milestone_id", "evidence_kind"])
  )
  if (!parsed.success) return fail(firstError(parsed.error))
  const input = parsed.data

  const loaded = await load(session, campaignId, transactionId)
  if (typeof loaded === "string") return fail(loaded)
  const { campaign, tx } = loaded
  if (loaded.explained) return fail(dbErrorMessage({ message: "GIVE_DISBURSEMENT_ALREADY_EXPLAINED" }))
  // give.link_returned_transfer only links an explained original, so this
  // cannot happen today; the app still never records one as spending.
  if (loaded.returned) return fail(RETURNED_NOT_EXPLAINABLE)

  if (input.refund_contribution_id) {
    let contribution
    try {
      contribution = await getRefundable(
        dbAs(session.accessToken),
        campaign.id,
        input.refund_contribution_id,
        session.user
      )
    } catch (error) {
      return fail(dbErrorMessage(error as DbErrorLike))
    }
    if (!contribution) {
      return fail("Lượt ủng hộ này không thuộc chiến dịch, hoặc đã được hoàn hết số tiền đã chuyển vào.")
    }
    // The picker leaves the organizer's own contributions out (DOS/Give#199).
    if (contribution.own) return fail(OWN_CONTRIBUTION_MESSAGES.refund)
    if (tx.amount > contribution.refundable_amount) {
      return fail(
        `Khoản hoàn ${formatVnd(tx.amount)} lớn hơn số còn hoàn được cho lượt ủng hộ ${contribution.reference_code} (${formatVnd(contribution.refundable_amount)}).`
      )
    }
  }

  const images = await readEvidence(form)
  if (typeof images === "string") return fail(images)
  const stored = await storeEvidence(campaign.id, tx.id, images, input.evidence_kind)
  if (typeof stored === "string") return fail(stored)

  const { data, error } = await dbService()
    .rpc("record_disbursement", {
      p_bank_transaction_id: tx.id,
      p_actor_id: session.user.id,
      p_purpose: input.purpose,
      p_category: input.category,
      p_recipient: input.recipient,
      p_is_refund: input.is_refund,
      p_refund_contribution_id: input.refund_contribution_id,
      p_evidence: stored.evidence,
      ...(input.milestone_id ? { p_milestone_id: input.milestone_id } : {}),
    })
    .single()
  if (error) {
    if (refusedByDatabase(error)) await stored.cleanup()
    return fail(dbErrorMessage(error, REFUND_MESSAGES))
  }

  refresh(campaign)
  // A repeated submission (a double click) hit the stored explanation:
  // nothing was written, not even this call's evidence.
  if ((data as { replayed?: boolean } | null)?.replayed === true) {
    await stored.cleanup()
    return done(
      stored.evidence.length > 0
        ? "Khoản chi này đã được giải trình từ trước. Ảnh vừa tải không được lưu, hãy thêm lại nếu cần."
        : "Khoản chi này đã được giải trình từ trước."
    )
  }
  return done(
    input.is_refund
      ? "Đã ghi khoản hoàn tiền. Sao kê công khai đã cập nhật."
      : "Đã giải trình khoản chi. Sao kê công khai đã cập nhật."
  )
}

/** Adds evidence images to an explained transaction (receipts often come later). */
export async function addEvidence(
  campaignId: string,
  transactionId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const kind = String(form.get("evidence_kind") ?? "")
  if (!isEvidenceKind(kind)) return fail("Chọn loại chứng từ.")

  const loaded = await load(session, campaignId, transactionId)
  if (typeof loaded === "string") return fail(loaded)
  const { campaign, tx } = loaded
  if (!loaded.explained) return fail(dbErrorMessage({ message: "GIVE_DISBURSEMENT_NOT_FOUND" }))

  const images = await readEvidence(form)
  if (typeof images === "string") return fail(images)
  if (images.length === 0) return fail("Chọn ít nhất một ảnh chứng từ.")
  if (loaded.evidenceCount + images.length > MAX_EVIDENCE_PER_TRANSACTION) {
    return fail(`Mỗi khoản chi có tối đa ${MAX_EVIDENCE_PER_TRANSACTION} ảnh chứng từ (đã có ${loaded.evidenceCount}).`)
  }
  const stored = await storeEvidence(campaign.id, tx.id, images, kind)
  if (typeof stored === "string") return fail(stored)

  const { error } = await dbService().rpc("add_disbursement_evidence", {
    p_bank_transaction_id: tx.id,
    p_actor_id: session.user.id,
    p_evidence: stored.evidence,
  })
  if (error) {
    if (refusedByDatabase(error)) await stored.cleanup()
    return fail(dbErrorMessage(error))
  }

  refresh(campaign)
  return done(`Đã thêm ${images.length} ảnh chứng từ.`)
}

/**
 * Links or unlinks a same-campaign milestone on an already-explained non-refund
 * disbursement (DOS/Give#314). Strictly owner-only (#264 money boundary).
 */
export async function linkDisbursementMilestone(
  campaignId: string,
  transactionId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const parsed = setDisbursementMilestoneSchema.safeParse(formFields(form, ["milestone_id"]))
  if (!parsed.success) return fail(firstError(parsed.error))
  const milestoneId = parsed.data.milestone_id

  const loaded = await load(session, campaignId, transactionId)
  if (typeof loaded === "string") return fail(loaded)
  const { campaign, tx, disbursement } = loaded
  if (!disbursement) return fail(dbErrorMessage({ message: "GIVE_DISBURSEMENT_NOT_FOUND" }))
  if (disbursement.is_refund) {
    return fail(dbErrorMessage({ message: "GIVE_DISBURSEMENT_MILESTONE_NOT_ALLOWED" }))
  }

  const { data, error } = await dbService()
    .rpc("set_disbursement_milestone", {
      p_bank_transaction_id: tx.id,
      p_actor_id: session.user.id,
      p_milestone_id: milestoneId,
    })
    .single()
  if (error) return fail(dbErrorMessage(error))

  refresh(campaign)
  if ((data as { replayed?: boolean } | null)?.replayed === true) {
    return done("Mốc mục tiêu của khoản chi không thay đổi.")
  }
  return done(milestoneId ? "Đã gắn khoản chi vào mốc mục tiêu." : "Đã bỏ gắn mốc mục tiêu khỏi khoản chi.")
}
