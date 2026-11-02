"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import type { ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { importSummary, isUploadCode, MAX_UPLOAD_BYTES, uploadErrorMessage } from "@/lib/statement-import"
import { dbAs, dbService } from "@/lib/supabase"
import { importStatementFile, isAccessRefusal, StatementImportError } from "@/server/channels/statement-import"
import { statementParsers } from "@/server/statement-parsers"

/**
 * Statement upload (design section 5.2) by the account's owner or by
 * finance/admin staff. importStatementFile reads the account with the
 * uploader's own token first (PostgREST verifies it, so a forged session
 * cookie fails there), then records, stages and imports the file as the
 * service role. Rows that come out ready are imported at once; the others
 * wait for finance staff at /admin/statements.
 */

/** What the upload form shows: the summary, and the batch to open. */
export type UploadResult = (NonNullable<ActionResult> & { batchId?: string }) | null

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

function failed(message: string): UploadResult {
  return { ok: false, message }
}

export async function uploadStatement(_state: UploadResult, form: FormData): Promise<UploadResult> {
  const session = await getSession()
  if (!session) return failed(SIGNED_OUT)
  const accountId = String(form.get("account_id") ?? "")
  const parser = String(form.get("parser") ?? "")
  const file = form.get("file")
  if (!isUuid(accountId)) return failed("Chọn tài khoản nhận của sao kê.")
  if (!parser) return failed(uploadErrorMessage("STATEMENT_PARSER_UNKNOWN"))
  if (!(file instanceof File) || file.size === 0) return failed("Chọn file sao kê.")
  if (file.size > MAX_UPLOAD_BYTES) return failed(uploadErrorMessage("STATEMENT_FILE_INVALID"))

  let result
  try {
    result = await importStatementFile(
      {
        receivingAccountId: accountId,
        actorId: session.user.id,
        parser,
        file: new Uint8Array(await file.arrayBuffer()),
      },
      { user: dbAs(session.accessToken), service: dbService(), parsers: statementParsers }
    )
  } catch (error) {
    if (error instanceof StatementImportError) return failed(uploadErrorMessage(error.code, error.row))
    return failed("Chưa tải được sao kê lên. Hãy thử lại sau ít phút.")
  }

  revalidatePath("/me/statements")
  revalidatePath("/admin/statements")
  revalidatePath("/admin/unmatched")
  const again = result.replayed ? "File này đã được tải lên trước đây; kết quả là của lần tải đó. " : ""
  // A large file is imported in parts of whole days (DOS/Give#73): say so,
  // and which part a problem is in.
  const split = result.parts > 1
  switch (result.status) {
    case "imported":
      return {
        ok: true,
        message: `${again}Đã nhập sao kê${split ? ` (chia thành ${result.parts} phần theo ngày)` : ""}: ${importSummary(result)}.`,
        batchId: result.importBatchId,
      }
    case "refused": {
      const reason = uploadErrorMessage(result.code, result.row)
      // An access refusal is about the account or the uploader, not the file.
      // A dismissal is finance staff's decision about the file, not a fault in it.
      const next =
        isAccessRefusal(result.code) || result.code === "GIVE_INBOUND_EVENT_DISMISSED"
          ? ""
          : " Hãy sửa file rồi tải lại."
      const what = split
        ? `Phần ${result.part}/${result.parts} của sao kê không nhập được (đã nhập ${result.importedParts} phần trước nó; các phần sau không được nhập).`
        : "Sao kê không nhập được."
      return failed(`${again}${what} ${reason}${reason.endsWith(".") ? "" : "."}${next}`)
    }
    case "pending": {
      // A known refusal that may pass later (the database's date lags near
      // midnight) is worth naming; timeouts and outages are not.
      const reason = isUploadCode(result.code) ? ` Lần thử vừa rồi: ${uploadErrorMessage(result.code, result.row)}` : ""
      const progress = split
        ? ` (chia thành ${result.parts} phần theo ngày, đã nhập xong ${result.importedParts} phần)`
        : ""
      return {
        ok: true,
        message: `${again}Đã nhận file${progress}, Give đang xử lý tiếp. Hãy tải lại trang sau vài phút để xem kết quả.${reason}`,
      }
    }
    case "parked":
      return failed(
        `${again}Give đã thử xử lý ${split ? `phần ${result.part}/${result.parts} của ` : ""}file này nhiều lần mà chưa được, nên đã chuyển cho đội tài chính kiểm tra. Bạn có thể tải lại đúng file này sau để Give thử thêm một lần.`
      )
  }
}
