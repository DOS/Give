"use server"

import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"

import { getSession, type Session } from "@/lib/auth/session"
import { getCampaignById, type CampaignWithRefs } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { detectImageType, reencodeCover } from "@/lib/media"
import {
  evidencePath,
  explainSchema,
  getOutgoing,
  getRefundable,
  isEvidenceKind,
  listDisbursements,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_FILES,
  type EvidenceKind,
  type OutgoingTransaction,
} from "@/lib/statement"
import { dbAs, dbService, MEDIA_BUCKET } from "@/lib/supabase"
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

type Loaded = { campaign: CampaignWithRefs; tx: OutgoingTransaction; explained: boolean }

/** The organizer's own campaign and one of its outgoing transactions, read under RLS. */
async function load(session: Session, campaignId: string, transactionId: string): Promise<Loaded | string> {
  if (!isUuid(campaignId)) return dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" })
  if (!isUuid(transactionId)) return TX_NOT_FOUND
  const db = dbAs(session.accessToken)
  try {
    const [campaign, tx, explanations] = await Promise.all([
      getCampaignById(db, campaignId),
      getOutgoing(db, campaignId, transactionId),
      listDisbursements(db, [transactionId]),
    ])
    // Finance staff can read every campaign; explaining is the organizer's.
    if (!campaign || campaign.organizer_id !== session.user.id) {
      return dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" })
    }
    if (!tx) return TX_NOT_FOUND
    return { campaign, tx, explained: explanations.length > 0 }
  } catch (error) {
    return dbErrorMessage(error as DbErrorLike)
  }
}

/** Evidence images from the form, checked and stripped of metadata (GPS, device). */
async function readEvidence(form: FormData): Promise<Uint8Array[] | string> {
  const files = form.getAll("evidence").filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > MAX_EVIDENCE_FILES) return `Mỗi lần tải tối đa ${MAX_EVIDENCE_FILES} ảnh.`
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_EVIDENCE_BYTES) return "Tổng dung lượng ảnh mỗi lần tối đa 4 MB."
  const images: Uint8Array[] = []
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!detectImageType(bytes)) return "Chứng từ chỉ nhận ảnh JPEG, PNG hoặc WebP."
    try {
      images.push(await reencodeCover(bytes))
    } catch {
      return `Không đọc được ảnh "${file.name}". Hãy thử ảnh khác.`
    }
  }
  return images
}

/**
 * Stores the images under the transaction's prefix. Returns the evidence
 * entries for the RPC plus a cleanup that removes what was stored, or an
 * error message (after removing any partial upload).
 */
async function storeEvidence(
  campaignId: string,
  transactionId: string,
  images: Uint8Array[],
  kind: EvidenceKind
): Promise<{ evidence: { storage_path: string; kind: EvidenceKind }[]; cleanup: () => Promise<void> } | string> {
  const storage = dbService().storage.from(MEDIA_BUCKET)
  const paths: string[] = []
  const cleanup = async () => {
    if (paths.length) await storage.remove(paths)
  }
  for (const image of images) {
    const path = evidencePath(campaignId, transactionId, randomUUID())
    const uploaded = await storage.upload(path, image, { contentType: "image/webp", upsert: false })
    if (uploaded.error) {
      await cleanup()
      return "Không tải được ảnh chứng từ lên. Hãy thử lại."
    }
    paths.push(path)
  }
  return { evidence: paths.map((storage_path) => ({ storage_path, kind })), cleanup }
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
    formFields(form, ["purpose", "category", "recipient", "refund_contribution_id", "evidence_kind"])
  )
  if (!parsed.success) return fail(firstError(parsed.error))
  const input = parsed.data

  const loaded = await load(session, campaignId, transactionId)
  if (typeof loaded === "string") return fail(loaded)
  const { campaign, tx } = loaded
  if (loaded.explained) return fail(dbErrorMessage({ message: "GIVE_DISBURSEMENT_ALREADY_EXPLAINED" }))

  if (input.refund_contribution_id) {
    let contribution
    try {
      contribution = await getRefundable(dbAs(session.accessToken), campaign.id, input.refund_contribution_id)
    } catch (error) {
      return fail(dbErrorMessage(error as DbErrorLike))
    }
    if (!contribution) return fail(dbErrorMessage({ message: "GIVE_REFUND_CONTRIBUTION_INVALID" }))
    if (tx.amount > contribution.received_amount) {
      return fail(
        `Khoản hoàn ${formatVnd(tx.amount)} lớn hơn số lượt ủng hộ ${contribution.reference_code} đã chuyển vào (${formatVnd(contribution.received_amount)}).`
      )
    }
  }

  const images = await readEvidence(form)
  if (typeof images === "string") return fail(images)
  const stored = await storeEvidence(campaign.id, tx.id, images, input.evidence_kind)
  if (typeof stored === "string") return fail(stored)

  const { error } = await dbService().rpc("record_disbursement", {
    p_bank_transaction_id: tx.id,
    p_actor_id: session.user.id,
    p_purpose: input.purpose,
    p_category: input.category,
    p_recipient: input.recipient,
    p_is_refund: input.is_refund,
    p_refund_contribution_id: input.refund_contribution_id,
    p_evidence: stored.evidence,
  })
  if (error) {
    await stored.cleanup()
    return fail(dbErrorMessage(error))
  }

  refresh(campaign)
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
  const stored = await storeEvidence(campaign.id, tx.id, images, kind)
  if (typeof stored === "string") return fail(stored)

  const { error } = await dbService().rpc("add_disbursement_evidence", {
    p_bank_transaction_id: tx.id,
    p_actor_id: session.user.id,
    p_evidence: stored.evidence,
  })
  if (error) {
    await stored.cleanup()
    return fail(dbErrorMessage(error))
  }

  refresh(campaign)
  return done(`Đã thêm ${images.length} ảnh chứng từ.`)
}
