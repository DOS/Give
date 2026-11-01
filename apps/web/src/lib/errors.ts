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
  // Receiving accounts and bindings (money core part 1).
  GIVE_CHANNEL_NOT_AVAILABLE: "Kênh nhận tiền này chưa được hỗ trợ.",
  GIVE_ACCOUNT_NAME_MISMATCH:
    "Tên chủ tài khoản phải trùng với tên pháp lý trong hồ sơ người tổ chức (không phân biệt dấu và hoa thường).",
  GIVE_ACCOUNT_ALREADY_REGISTERED: "Tài khoản ngân hàng này đã được khai báo trên Give.",
  GIVE_TOO_MANY_PENDING_ACCOUNTS:
    "Bạn đang có 3 tài khoản chờ xác minh. Hãy hoàn tất xác minh các tài khoản đó trước khi khai báo thêm.",
  // Raised for both account verification codes and donation reference codes.
  GIVE_CODE_GENERATION_FAILED: "Chưa tạo được mã. Hãy thử lại.",
  GIVE_ACCOUNT_NOT_FOUND: "Không tìm thấy tài khoản nhận, hoặc bạn không có quyền với tài khoản này.",
  GIVE_SELF_REVIEW: "Không thể tự xác minh tài khoản nhận của chính mình.",
  GIVE_ORGANIZER_NOT_VERIFIED: "Người tổ chức chưa được xác minh danh tính, nên chưa thể xác minh tài khoản nhận.",
  GIVE_EVIDENCE_REQUIRED: "Ghi bằng chứng của giao dịch chuyển khoản thử (mã giao dịch ngân hàng và ngày).",
  GIVE_SENDER_NAME_REQUIRED: "Ghi tên người chuyển đọc được trên giao dịch xác minh.",
  GIVE_SENDER_NAME_MISMATCH:
    "Tên người chuyển trên giao dịch xác minh không trùng tên pháp lý của người tổ chức. Không xác minh tài khoản này.",
  GIVE_VERIFICATION_CHANGED_SINCE_REVIEW:
    "Mã xác minh của tài khoản đã đổi từ khi trang này tải. Hãy tải lại trang và đối chiếu lại.",
  GIVE_CAMPAIGN_NOT_BINDABLE:
    "Chỉ gắn được tài khoản nhận khi chiến dịch là bản nháp, đang chờ duyệt, cần chỉnh sửa, đã duyệt hoặc đang gây quỹ.",
  GIVE_ACCOUNT_NOT_VERIFIED:
    "Tài khoản nhận chưa được xác minh, hoặc hồ sơ người tổ chức chưa được xác minh hay đã đổi tên pháp lý.",
  GIVE_ACCOUNT_ALREADY_BOUND:
    "Tài khoản này đang gắn với một chiến dịch khác. Tài khoản chỉ được nhả khi chiến dịch đó đã xong hẳn phần tiền.",
  GIVE_CAMPAIGN_ALREADY_BOUND: "Chiến dịch này đã có tài khoản nhận khác.",
  // Donations.
  GIVE_CAMPAIGN_NOT_ACCEPTING: "Chiến dịch này hiện không nhận ủng hộ.",
  GIVE_AMOUNT_BELOW_MINIMUM: "Số tiền thấp hơn mức ủng hộ tối thiểu của chiến dịch.",
  GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT: "Chiến dịch chưa sẵn sàng nhận chuyển khoản. Hãy quay lại sau.",
  GIVE_CONTRIBUTION_TYPE_MISMATCH: "Chiến dịch này không nhận ủng hộ trực tiếp.",
  // Staff roles.
  GIVE_ADMIN_REQUIRED: "Chỉ quản trị viên mới được cấp hoặc thu quyền.",
  GIVE_ROLE_INVALID: "Quyền không hợp lệ.",
  GIVE_ROLE_UNCHANGED: "Người này đã có quyền này rồi.",
  GIVE_USER_NOT_FOUND: "Không tìm thấy tài khoản DOS.Me với email hoặc mã này.",
  GIVE_USER_INELIGIBLE:
    "Tài khoản này đã bị khóa, đã xóa hoặc chưa xác nhận email nên không thể nhận quyền. Nếu chỉ là chưa xác nhận email, hãy nhập mã người dùng thay cho email.",
  GIVE_USER_AMBIGUOUS: "Có nhiều tài khoản dùng email này. Hãy nhập mã người dùng thay cho email.",
  GIVE_ADMIN_NOT_FOUND: "Người này không còn quyền nào để thu.",
  GIVE_LAST_ADMIN: "Không thể thu hoặc hạ quyền quản trị viên cuối cùng. Hãy cấp quyền quản trị cho người khác trước.",
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

/**
 * `overrides` words a shared code for the caller's context, e.g.
 * GIVE_TRANSITION_NOT_ALLOWED for an account review instead of a campaign.
 */
export function dbErrorMessage(error: DbErrorLike | null | undefined, overrides: Record<string, string> = {}): string {
  const code = giveErrorCode(error)
  if (code && Object.hasOwn(overrides, code)) return overrides[code]
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
