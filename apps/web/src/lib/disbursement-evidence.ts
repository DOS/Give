import { randomUUID } from "node:crypto"

import { giveErrorCode, type DbErrorLike } from "@/lib/errors"
import { detectImageType, reencodeCover } from "@/lib/media"
import { evidencePath, MAX_EVIDENCE_BYTES, MAX_EVIDENCE_FILES, type EvidenceKind } from "@/lib/statement"
import { dbService, MEDIA_BUCKET } from "@/lib/supabase"

/**
 * Evidence images of an explanation of a transfer out, shared by the
 * organizer's form (/me/campaigns/[id]/disbursements) and finance's refund
 * form (/admin/refunds/[id], DOS/Give#203). Server only: it uploads with the
 * service role, so callers check who acts before calling it.
 */

/** Evidence images from the form, checked and stripped of metadata (GPS, device). */
export async function readEvidence(form: FormData): Promise<Uint8Array[] | string> {
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

export interface StoredEvidence {
  evidence: { storage_path: string; kind: EvidenceKind }[]
  /** Removes what was stored. */
  cleanup: () => Promise<void>
}

/**
 * Stores the images under the transaction's prefix. Returns the evidence
 * entries for the RPC plus a cleanup that removes what was stored, or an
 * error message (after removing any partial upload).
 */
export async function storeEvidence(
  campaignId: string,
  transactionId: string,
  images: Uint8Array[],
  kind: EvidenceKind
): Promise<StoredEvidence | string> {
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
export function refusedByDatabase(error: DbErrorLike): boolean {
  return giveErrorCode(error) !== null || /^([0-9A-Z]{5}|PGRST\d+)$/.test(error.code ?? "")
}
