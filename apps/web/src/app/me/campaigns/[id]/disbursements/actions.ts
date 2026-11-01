"use server"

import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"

import { getSession, type Session } from "@/lib/auth/session"
import { getCampaignById, type CampaignWithRefs } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, giveErrorCode, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { listEvidenceStates } from "@/lib/evidence-moderation"
import { formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { detectImageType, reencodeCover } from "@/lib/media"
import {
  evidencePath,
  explainSchema,
  getOutgoing,
  getRefundable,
  isEvidenceKind,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_FILES,
  MAX_EVIDENCE_PER_TRANSACTION,
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

type Loaded = { campaign: CampaignWithRefs; tx: OutgoingTransaction; explained: boolean; evidenceCount: number }

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
    const { disbursement, ...rest } = tx
    // Images staff hid do not count towards the cap, so the organizer can
    // always upload the redacted copy staff asked for.
    const evidence = disbursement?.evidence ?? []
    const states = await listEvidenceStates(
      db,
      evidence.map((e) => e.id)
    )
    const evidenceCount = evidence.filter((e) => !states.get(e.id)?.hidden).length
    return { campaign, tx: rest, explained: disbursement !== null, evidenceCount }
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

/**
 * True when the database answered the RPC with a refusal (a GIVE_* code, a
 * SQLSTATE or a PostgREST code), so nothing was written. A network error or
 * timeout may come after the commit, so the uploads are kept then.
 */
function refusedByDatabase(error: DbErrorLike): boolean {
  return giveErrorCode(error) !== null || /^([0-9A-Z]{5}|PGRST\d+)$/.test(error.code ?? "")
}

/**
 * After a successful RPC, removes uploaded images that have no evidence row.
 * That happens when a repeated submission hit record_disbursement's replay
 * path, which returns success without inserting evidence.
 */
async function dropUnrecorded(paths: string[]): Promise<number> {
  if (paths.length === 0) return 0
  const service = dbService()
  const { data, error } = await service.from("disbursement_evidence").select("storage_path").in("storage_path", paths)
  if (error) return 0
  const recorded = new Set(((data ?? []) as { storage_path: string }[]).map((row) => row.storage_path))
  const orphans = paths.filter((path) => !recorded.has(path))
  if (orphans.length) await service.storage.from(MEDIA_BUCKET).remove(orphans)
  return orphans.length
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
    if (!contribution) {
      return fail("Lượt ủng hộ này không thuộc chiến dịch, hoặc đã được hoàn hết số tiền đã chuyển vào.")
    }
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
    if (refusedByDatabase(error)) await stored.cleanup()
    return fail(dbErrorMessage(error))
  }
  const dropped = await dropUnrecorded(stored.evidence.map((e) => e.storage_path))

  refresh(campaign)
  if (dropped > 0)
    return done("Khoản chi này đã được giải trình từ trước. Ảnh vừa tải không được lưu, hãy thêm lại nếu cần.")
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
