/**
 * Turns database errors into messages for people. The give schema raises
 * errors whose message starts with a stable GIVE_* code; anything else gets a
 * generic message so internals never reach the page.
 */

const GIVE_MESSAGES: Record<string, string> = {
  GIVE_CAMPAIGN_NOT_FOUND: "Không tìm thấy chiến dịch, hoặc bạn không có quyền với chiến dịch này.",
  GIVE_TRANSITION_NOT_ALLOWED: "Không thể chuyển chiến dịch sang trạng thái này lúc này.",
  GIVE_REASON_REQUIRED: "Cần ghi lý do.",
  GIVE_SUBMISSION_INCOMPLETE: "Cần chọn danh mục, viết tóm tắt và câu chuyện ít nhất 100 ký tự trước khi gửi duyệt.",
  GIVE_SUBMISSION_DATES_INVALID: "Cần đặt ngày kết thúc ở tương lai và sau ngày bắt đầu.",
  GIVE_BACK_DURATION_TOO_LONG: "Dự án có quà tặng chỉ được gây quỹ tối đa 60 ngày.",
  GIVE_BENEFICIARY_REQUIRED: "Chiến dịch từ thiện cần ghi tên người thụ hưởng.",
  GIVE_CAMPAIGN_ALREADY_ENDED: "Chiến dịch đã quá ngày kết thúc.",
  GIVE_CATEGORY_TYPE_MISMATCH: "Danh mục không phù hợp với loại chiến dịch.",
  GIVE_CAMPAIGN_NOT_EDITABLE:
    "Chiến dịch đang ở trạng thái không cho sửa mục này (mốc chỉ sửa được khi còn là bản nháp hoặc cần chỉnh sửa; không đăng cập nhật khi đã hủy hoặc tạm dừng).",
  GIVE_CAMPAIGN_TYPE_LOCKED: "Không thể đổi loại chiến dịch sau khi đã gửi duyệt.",
  GIVE_COVER_MEDIA_INVALID: "Ảnh bìa không thuộc chiến dịch này.",
  GIVE_NOT_ADMIN: "Bạn không có quyền kiểm duyệt.",
  GIVE_VERIFICATION_STATUS_INVALID: "Trạng thái xác minh không hợp lệ.",
  GIVE_SELF_VERIFICATION: "Không thể tự xác minh hồ sơ của chính mình.",
  GIVE_ORGANIZER_NOT_FOUND: "Không tìm thấy hồ sơ người tổ chức.",
  GIVE_ORGANIZER_CHANGED_SINCE_REVIEW:
    "Người tổ chức vừa đổi thông tin. Hãy tải lại trang và xem lại trước khi xác minh.",
}

const PG_MESSAGES: Record<string, string> = {
  "23505": "Dữ liệu bị trùng. Hãy thử lại.",
  "23514": "Dữ liệu không hợp lệ.",
  "42501": "Bạn không có quyền thực hiện thao tác này.",
  // PostgREST rejected the access token (invalid or expired).
  PGRST301: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
  PGRST303: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
}

export interface DbErrorLike {
  code?: string | null
  message?: string | null
}

/** The GIVE_* code at the start of a database error message, if any. */
export function giveErrorCode(error: DbErrorLike | null | undefined): string | null {
  const match = /^(GIVE_[A-Z_]+)\b/.exec(error?.message ?? "")
  return match ? match[1] : null
}

export function dbErrorMessage(error: DbErrorLike | null | undefined): string {
  const code = giveErrorCode(error)
  if (code && GIVE_MESSAGES[code]) return GIVE_MESSAGES[code]
  if (error?.code && PG_MESSAGES[error.code]) return PG_MESSAGES[error.code]
  return "Có lỗi xảy ra. Hãy thử lại sau."
}

/** Result shape that form actions return to useActionState. */
export type ActionResult = { ok: boolean; message: string } | null

export function fail(message: string): ActionResult {
  return { ok: false, message }
}

export function done(message: string): ActionResult {
  return { ok: true, message }
}
