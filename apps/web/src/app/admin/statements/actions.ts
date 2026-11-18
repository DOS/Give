"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import {
  dbErrorMessage,
  done,
  fail,
  RESTORE_TRUST_MESSAGES,
  REVIEW_THRESHOLD_MESSAGES,
  STATEMENT_ROW_MESSAGES,
  type ActionResult,
} from "@/lib/errors"
import { formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { parseThresholdVnd } from "@/lib/statement-import"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * Finance resolution of a statement row the import could not decide (design
 * section 5.2). give.resolve_statement_import_row runs as the service role
 * with the reviewer's id as an argument; it checks the finance/admin role,
 * requires a note, refuses a second different resolution, refuses staff who
 * own the account or organize its campaign (GIVE_SELF_REVIEW; the page hides
 * the forms from them too) and writes the audit row. Because it trusts the id, the role check below runs with the
 * reviewer's own token first: PostgREST verifies that token, so a forged
 * session cookie fails here.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_FINANCE = STATEMENT_ROW_MESSAGES.GIVE_NOT_ALLOWED

const RESOLVE_MESSAGES = STATEMENT_ROW_MESSAGES

export async function resolveStatementRow(rowId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(rowId)) return fail(RESOLVE_MESSAGES.GIVE_IMPORT_ROW_NOT_FOUND)
  const resolution = String(form.get("resolution") ?? "")
  if (resolution !== "import" && resolution !== "duplicate" && resolution !== "not_a_transaction") {
    return fail(RESOLVE_MESSAGES.GIVE_RESOLUTION_INVALID)
  }
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
  const result = data as { status?: string; replayed?: boolean } | null
  // The same resolution again returns the stored outcome without writing
  // this reviewer's note or an audit row: say so, rather than report a check
  // of theirs that was not recorded.
  if (result?.replayed === true) {
    return done(
      "Dòng này đã được xử lý trước đó theo cùng cách (có thể bởi người khác); ghi chú của bạn không được lưu. Hãy tải lại trang."
    )
  }
  const status = result?.status
  if (resolution === "not_a_transaction") {
    return done("Đã đánh dấu dòng là không phải giao dịch thật; không có giao dịch nào được ghi vào sổ.")
  }
  if (resolution === "duplicate")
    return done("Đã đánh dấu dòng là giao dịch đã ghi; không có giao dịch mới nào được tạo.")
  if (status === "duplicate") {
    return done("Dòng này vừa được ghi bởi một nguồn khác với cùng mã giao dịch, nên không tạo giao dịch mới.")
  }
  return done(
    "Đã nhập dòng thành giao dịch. Tiền vào của chiến dịch mà không có mã ủng hộ hợp lệ sẽ nằm trong danh sách giao dịch chưa khớp; giao dịch ngoài thời gian tài khoản gắn với chiến dịch thì không thuộc chiến dịch nào."
  )
}

/**
 * Finance/admin staff change a finance review setting of organizer uploads
 * (DOS/Give#57): the per-row threshold, or the daily limit against split
 * amounts. As for resolutions, the role is checked with the reviewer's own
 * token first, then the RPC checks it again, requires the note and writes the
 * audit row.
 */
export async function setReviewThreshold(state: ActionResult, form: FormData): Promise<ActionResult> {
  return setReviewSetting("threshold", state, form)
}

export async function setReviewDailyLimit(state: ActionResult, form: FormData): Promise<ActionResult> {
  return setReviewSetting("daily_limit", state, form)
}

const REVIEW_SETTINGS = {
  threshold: { rpc: "set_statement_review_threshold", arg: "p_threshold_vnd", name: "Ngưỡng duyệt" },
  daily_limit: { rpc: "set_statement_review_daily_limit", arg: "p_daily_limit_vnd", name: "Giới hạn mỗi ngày" },
} as const

async function setReviewSetting(
  kind: keyof typeof REVIEW_SETTINGS,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const setting = REVIEW_SETTINGS[kind]
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  const threshold = parseThresholdVnd(String(form.get("threshold") ?? ""))
  if (threshold === null) return fail(REVIEW_THRESHOLD_MESSAGES.GIVE_THRESHOLD_INVALID)
  const note = String(form.get("note") ?? "").trim()
  if (!note) return fail(REVIEW_THRESHOLD_MESSAGES.GIVE_SETTING_NOTE_REQUIRED)
  if (note.length > 1000) return fail("Ghi chú tối đa 1.000 ký tự.")

  const role = await dbAs(session.accessToken).rpc("is_admin", { p_roles: FINANCE_ROLES })
  if (role.error) return fail(dbErrorMessage(role.error))
  if (role.data !== true) return fail(REVIEW_THRESHOLD_MESSAGES.GIVE_NOT_ALLOWED)

  const { data, error } = await dbService()
    .rpc(setting.rpc, { p_actor_id: session.user.id, [setting.arg]: threshold, p_note: note })
    .single()
  if (error) return fail(dbErrorMessage(error, REVIEW_THRESHOLD_MESSAGES))

  revalidatePath("/admin/statements")
  revalidatePath("/me/statements")
  const result = data as { replayed?: boolean } | null
  if (result?.replayed === true) return done(`${setting.name} đã là ${formatVnd(threshold)}; không có gì thay đổi.`)
  return done(
    `Đã đổi ${setting.name.toLowerCase()} thành ${formatVnd(threshold)}. Các lần tải sao kê sau của người tổ chức dùng giá trị mới; dòng đã tải giữ nguyên.`
  )
}

/**
 * Finance/admin staff restore the statement trust of a campaign that a
 * rejected row blocks (DOS/Give#57, PO decision): until then every organizer
 * upload of it waits for review. The role is checked with the user's own
 * token first; give.restore_campaign_statement_trust checks it again, refuses
 * staff who organize the campaign, requires the note and writes the audit row.
 */
export async function restoreCampaignTrust(
  campaignId: string,
  /** The rejections the staff member saw: more of them refuse the restore (GIVE_TRUST_CHANGED). */
  expectedRejected: number,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(campaignId)) return fail(RESTORE_TRUST_MESSAGES.GIVE_CAMPAIGN_NOT_FOUND)
  if (!Number.isSafeInteger(expectedRejected) || expectedRejected < 1) {
    return fail(RESTORE_TRUST_MESSAGES.GIVE_TRUST_CHANGED)
  }
  const note = String(form.get("note") ?? "").trim()
  if (!note) return fail(RESTORE_TRUST_MESSAGES.GIVE_SETTING_NOTE_REQUIRED)
  if (note.length > 1000) return fail("Ghi chú tối đa 1.000 ký tự.")

  const role = await dbAs(session.accessToken).rpc("is_admin", { p_roles: FINANCE_ROLES })
  if (role.error) return fail(dbErrorMessage(role.error))
  if (role.data !== true) return fail(RESTORE_TRUST_MESSAGES.GIVE_NOT_ALLOWED)

  const { error } = await dbService()
    .rpc("restore_campaign_statement_trust", {
      p_actor_id: session.user.id,
      p_campaign_id: campaignId,
      p_note: note,
      p_expected_rejected: expectedRejected,
    })
    .single()
  if (error) return fail(dbErrorMessage(error, RESTORE_TRUST_MESSAGES))

  revalidatePath("/admin/statements")
  return done(
    "Đã khôi phục tin cậy của chiến dịch. Nếu chiến dịch đã có lần tải được duyệt trọn vẹn, các lần tải sau của người tổ chức lại theo ngưỡng duyệt; nếu chưa, lần tải tiếp theo vẫn chờ duyệt. Một dòng bị từ chối nữa sẽ chặn lại."
  )
}
