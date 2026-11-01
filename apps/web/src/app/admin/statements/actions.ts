"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { dbErrorMessage, done, fail, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * Finance resolution of a statement row the import could not decide (design
 * section 5.2). give.resolve_statement_import_row runs as the service role
 * with the reviewer's id as an argument; it checks the finance/admin role,
 * requires a note, refuses a second different resolution and writes the
 * audit row. Because it trusts the id, the role check below runs with the
 * reviewer's own token first: PostgREST verifies that token, so a forged
 * session cookie fails here.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_FINANCE = "Chỉ nhân viên tài chính hoặc quản trị viên được xử lý dòng sao kê."

const RESOLVE_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: NOT_FINANCE,
  GIVE_RESOLUTION_INVALID: "Cách xử lý không hợp lệ.",
  GIVE_RESOLUTION_NOTE_REQUIRED: "Ghi chú là bắt buộc: ghi bạn đã đối chiếu với nguồn nào.",
  GIVE_IMPORT_ROW_NOT_FOUND: "Không tìm thấy dòng sao kê này.",
  GIVE_IMPORT_ROW_NOT_AMBIGUOUS:
    "Dòng này đã được xử lý theo cách khác (có thể bởi người khác). Hãy tải lại trang để xem kết quả.",
  GIVE_RESOLUTION_CANDIDATE:
    "Dòng này khớp với một dòng sao kê đã tải trước. Hãy đánh dấu là giao dịch đã ghi, hoặc tích xác nhận đây là giao dịch khác rồi mới nhập.",
  GIVE_DUPLICATE_TARGET_INVALID:
    "Giao dịch đã chọn không cùng tài khoản, chiều hoặc số tiền với dòng này, hoặc một dòng khác trong cùng file đã ứng với nó.",
}

export async function resolveStatementRow(rowId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(rowId)) return fail(RESOLVE_MESSAGES.GIVE_IMPORT_ROW_NOT_FOUND)
  const resolution = String(form.get("resolution") ?? "")
  if (resolution !== "import" && resolution !== "duplicate") return fail(RESOLVE_MESSAGES.GIVE_RESOLUTION_INVALID)
  const note = String(form.get("note") ?? "").trim()
  if (!note) return fail(RESOLVE_MESSAGES.GIVE_RESOLUTION_NOTE_REQUIRED)
  if (note.length > 1000) return fail("Ghi chú tối đa 1.000 ký tự.")
  const transactionId = resolution === "duplicate" ? String(form.get("bank_transaction_id") ?? "") : null
  if (resolution === "duplicate" && !isUuid(transactionId)) return fail("Chọn giao dịch đã ghi mà dòng này lặp lại.")
  const override = resolution === "import" && form.get("override_candidate") === "on"

  const role = await dbAs(session.accessToken).rpc("is_admin", { p_roles: FINANCE_ROLES })
  if (role.error) return fail(dbErrorMessage(role.error))
  if (role.data !== true) return fail(NOT_FINANCE)

  const { data, error } = await dbService()
    .rpc("resolve_statement_import_row", {
      p_row_id: rowId,
      p_actor_id: session.user.id,
      p_resolution: resolution,
      p_note: note,
      p_bank_transaction_id: transactionId,
      p_override_candidate: override,
    })
    .single()
  if (error) return fail(dbErrorMessage(error, RESOLVE_MESSAGES))

  revalidatePath("/admin/statements")
  revalidatePath("/admin/unmatched")
  revalidatePath("/me/statements", "layout")
  // The same resolution again returns the stored outcome without writing
  // this reviewer's note or an audit row: say so, rather than report a check
  // of theirs that was not recorded.
  const stored = await dbAs(session.accessToken)
    .from("statement_import_rows")
    .select("resolution_note")
    .eq("id", rowId)
    .maybeSingle()
  if (!stored.error && stored.data && (stored.data as { resolution_note: string | null }).resolution_note !== note) {
    return done(
      "Dòng này đã được xử lý trước đó theo cùng cách (có thể bởi người khác); ghi chú của bạn không được lưu. Hãy tải lại trang."
    )
  }
  const status = (data as { status?: string } | null)?.status
  if (resolution === "duplicate")
    return done("Đã đánh dấu dòng là giao dịch đã ghi; không có giao dịch mới nào được tạo.")
  if (status === "duplicate") {
    return done("Dòng này vừa được ghi bởi một nguồn khác với cùng mã giao dịch, nên không tạo giao dịch mới.")
  }
  return done(
    "Đã nhập dòng thành giao dịch. Tiền vào của chiến dịch mà không có mã ủng hộ hợp lệ sẽ nằm trong danh sách giao dịch chưa khớp; giao dịch ngoài thời gian tài khoản gắn với chiến dịch thì không thuộc chiến dịch nào."
  )
}
