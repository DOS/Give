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
    "Tài khoản này đang gắn với một chiến dịch khác. Hãy nhả tài khoản khỏi chiến dịch đó trước: bản nháp, hay chiến dịch được yêu cầu chỉnh sửa mà tài khoản chưa nhận giao dịch nào, nhả được ngay; các chiến dịch khác đã gửi duyệt chỉ nhả được khi đã xong hẳn phần tiền.",
  GIVE_BINDING_NOT_FOUND: "Tài khoản này hiện không gắn với chiến dịch nào.",
  GIVE_BINDING_NOT_RELEASABLE:
    "Chưa nhả được tài khoản: chiến dịch phải là bản nháp, được yêu cầu chỉnh sửa, hoặc đã hủy, mà tài khoản chưa nhận giao dịch nào; hoặc đã kết thúc và xong hẳn phần tiền (chiến dịch từ thiện cần kết thúc ít nhất 30 ngày). Giao dịch đã vào tài khoản là lịch sử tiền của chiến dịch nên tài khoản không nhả sớm được. Nếu tài khoản không dùng được nữa khi chiến dịch từ thiện đang gây quỹ, tạm dừng hoặc cần chỉnh sửa, hãy gửi yêu cầu đổi tài khoản ở mục Tài khoản nhận tiền của chiến dịch; với dự án có quà tặng, hãy liên hệ đội ngũ Give.",
  GIVE_BINDING_HAS_OPEN_TRANSACTIONS:
    "Chưa nhả được tài khoản: còn giao dịch của chiến dịch chưa được đối chiếu hoặc chưa được giải trình.",
  GIVE_CAMPAIGN_ALREADY_BOUND: "Chiến dịch này đã có tài khoản nhận khác.",
  // Donations.
  GIVE_CAMPAIGN_NOT_ACCEPTING: "Chiến dịch này hiện không nhận ủng hộ.",
  GIVE_AMOUNT_BELOW_MINIMUM: "Số tiền thấp hơn mức ủng hộ tối thiểu của chiến dịch.",
  GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT: "Chiến dịch chưa sẵn sàng nhận chuyển khoản. Hãy quay lại sau.",
  GIVE_RATE_LIMITED: "Có nhiều lượt ủng hộ trong thời gian ngắn. Hãy thử lại sau ít phút.",
  // Evidence reports and moderation (DOS/Give#58).
  GIVE_EVIDENCE_NOT_FOUND: "Không tìm thấy ảnh chứng từ này, hoặc ảnh đã bị ẩn.",
  GIVE_REPORT_REASON_TOO_LONG: "Lý do tối đa 500 ký tự.",
  GIVE_REPORT_LIMIT: "Bạn đã gửi nhiều báo cáo trong 24 giờ qua. Hãy thử lại sau.",
  GIVE_MODERATION_REASON_REQUIRED: "Ghi lý do ẩn ảnh (ví dụ: lộ số CCCD của người nhận).",
  GIVE_MODERATION_REASON_TOO_LONG: "Lý do tối đa 500 ký tự.",
  GIVE_MODERATION_INVALID: "Thao tác không hợp lệ.",
  GIVE_CONTRIBUTION_TYPE_MISMATCH: "Chiến dịch này không nhận ủng hộ trực tiếp.",
  // Disbursement explanations (money core part 2).
  GIVE_NOT_ALLOWED: "Bạn không có quyền thực hiện thao tác này.",
  GIVE_TRANSACTION_NOT_FOUND: "Không tìm thấy giao dịch, hoặc bạn không có quyền với giao dịch này.",
  GIVE_TRANSACTION_NOT_OUTBOUND: "Chỉ giải trình được các khoản tiền ra.",
  GIVE_PURPOSE_REQUIRED: "Ghi mục đích của khoản chi.",
  GIVE_REFUND_CONTRIBUTION_REQUIRED: "Khoản hoàn tiền cần chọn lượt ủng hộ được hoàn.",
  GIVE_DISBURSEMENT_ALREADY_EXPLAINED: "Khoản chi này đã được giải trình. Giải trình đã công khai thì không sửa được.",
  GIVE_REFUND_CONTRIBUTION_INVALID: "Lượt ủng hộ được hoàn không thuộc chiến dịch này.",
  GIVE_REFUND_EXCEEDS_RECEIVED: "Tổng tiền hoàn vượt quá số tiền lượt ủng hộ này đã chuyển vào.",
  GIVE_LEDGER_POST_MISSING: "Giao dịch chi chưa được ghi sổ đầy đủ. Hãy thử lại sau ít phút.",
  GIVE_EVIDENCE_INVALID: "Chứng từ không hợp lệ.",
  GIVE_DISBURSEMENT_NOT_FOUND: "Khoản chi này chưa được giải trình, nên chưa thêm được chứng từ.",
  // Disbursement hardening (DOS/Give#56).
  GIVE_REFUND_CATEGORY_MISMATCH:
    "Loại “Hoàn tiền cho người ủng hộ” chỉ dùng cho khoản hoàn tiền, và khoản hoàn tiền phải có loại này.",
  GIVE_EVIDENCE_PATH_INVALID:
    "Ảnh chứng từ không nằm đúng thư mục của khoản chi này, hoặc đã được lưu trước đó. Hãy tải lại ảnh.",
  GIVE_EVIDENCE_LIMIT: "Mỗi khoản chi có tối đa 20 ảnh chứng từ (không tính ảnh đã bị ẩn).",
  // Account swaps of give campaigns that may hold money (DOS/Give#55).
  GIVE_SWAP_NOT_ALLOWED:
    "Chỉ đổi được tài khoản nhận của chiến dịch từ thiện đang gây quỹ, đang tạm dừng, hoặc cần chỉnh sửa mà tài khoản cũ đã nhận giao dịch.",
  GIVE_SWAP_USE_RELEASE:
    "Tài khoản đang gắn chưa nhận giao dịch nào: bạn nhả tài khoản đó rồi gắn tài khoản khác được ngay, không cần chờ tài chính duyệt.",
  GIVE_SWAP_SAME_ACCOUNT: "Hãy chọn một tài khoản khác với tài khoản đang gắn.",
  GIVE_SWAP_ALREADY_PENDING: "Chiến dịch đã có một yêu cầu đổi tài khoản đang chờ duyệt.",
  GIVE_SWAP_NOT_FOUND: "Không tìm thấy yêu cầu đổi tài khoản, hoặc bạn không có quyền với yêu cầu này.",
  GIVE_SWAP_NOT_PENDING: "Yêu cầu đổi tài khoản này đã được xử lý. Hãy tải lại trang.",
  GIVE_SWAP_STALE:
    "Tài khoản đang gắn của chiến dịch đã thay đổi từ khi yêu cầu được gửi. Hãy từ chối yêu cầu này; người tổ chức gửi yêu cầu mới nếu cần.",
  GIVE_SWAP_DECISION_INVALID: "Thao tác không hợp lệ.",
  GIVE_SWAP_REQUEST_IMMUTABLE: "Yêu cầu đã được xử lý nên không sửa được.",
  GIVE_REASON_TOO_LONG: "Lý do hoặc ghi chú quá dài (lý do tối đa 1000 ký tự, ghi chú công khai tối đa 300 ký tự).",
  // The account's owner is not the organizer of the campaign it is bound to
  // (DOS/Give#119). Only give.match_transaction raises it today, and the match
  // action words it itself (#136); this wording covers any other path, such
  // as a statement upload or a parked event, if one raises it later (#148).
  GIVE_ACCOUNT_OWNER_MISMATCH:
    "Tài khoản nhận không thuộc về người tổ chức của chiến dịch đang gắn, nên giao dịch này không xử lý được cho chiến dịch đó. Hãy báo đội ngũ Give kiểm tra lại tài khoản nhận và chiến dịch.",
  GIVE_ACCOUNT_HISTORY_OPEN:
    "Tài khoản này đã được đổi ra khỏi một chiến dịch mà phần tiền chưa xong (chiến dịch chưa kết thúc đủ 30 ngày, hoặc còn giao dịch chưa đối chiếu, chưa giải trình, hoặc còn dòng sao kê chưa ghi nhận), nên chưa dùng cho chiến dịch khác được.",
  // Reward tiers and fulfillment of back campaigns (DOS/Give#30, #83).
  GIVE_REWARD_TIERS_BACK_ONLY: "Chỉ dự án có quà tặng mới có các mức phần thưởng.",
  GIVE_REWARD_TIER_INVALID: "Thông tin phần thưởng không hợp lệ.",
  GIVE_REWARD_TIER_LIMIT: "Mỗi dự án có tối đa 50 mức phần thưởng.",
  GIVE_REWARD_TIER_NOT_FOUND: "Không tìm thấy mức phần thưởng này. Hãy tải lại trang.",
  GIVE_REWARD_TIER_IN_USE: "Mức phần thưởng này đã có người chọn nên không xóa được.",
  GIVE_REWARD_TIER_ORDER_INVALID: "Danh sách phần thưởng vừa thay đổi. Hãy tải lại trang rồi sắp xếp lại.",
  GIVE_REWARD_TIER_HAS_PLEDGES: "Mức phần thưởng này đã có người cam kết nên không ngừng nhận được.",
  GIVE_REWARD_TIER_IMMUTABLE: "Không đổi được chiến dịch của một mức phần thưởng.",
  GIVE_FULFILLMENT_STATUS_INVALID: "Chọn trạng thái giao quà.",
  GIVE_FULFILLMENT_NOTE_TOO_LONG: "Ghi chú giao quà tối đa 500 ký tự.",
  GIVE_FULFILLMENT_BATCH_INVALID: "Chọn từ 1 đến 500 lượt ủng hộ để cập nhật.",
  GIVE_CAMPAIGN_NOT_FULFILLING: "Chỉ cập nhật giao quà được khi dự án đã gây quỹ thành công.",
  GIVE_PLEDGE_NOT_FULFILLABLE:
    "Có lượt ủng hộ không còn ở trạng thái đã thanh toán (có thể vừa được hoàn tiền). Hãy tải lại trang và chọn lại.",
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

/**
 * GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT worded for the organizer submitting a
 * campaign. The database raises it when a campaign (give or back,
 * DOS/Give#85) has no active binding to a verified account in the verified
 * organizer's own name.
 */
export const SUBMIT_MESSAGES: Record<string, string> = {
  GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT:
    "Chưa gửi duyệt được: chiến dịch cần một tài khoản nhận tiền đã xác minh, đứng tên bạn, gắn vào chiến dịch. Vào mục Tài khoản nhận tiền để khai báo, xác minh và gắn tài khoản; nếu tài khoản đang gắn đã bị khóa hoặc không còn dùng được, hãy nhả nó rồi gắn tài khoản khác (tài khoản đã nhận giao dịch thì không nhả được: với chiến dịch từ thiện, gửi yêu cầu đổi tài khoản trong cùng mục; với dự án có quà tặng, liên hệ đội ngũ Give). Nếu bạn vừa đổi tên pháp lý, hồ sơ người tổ chức cần được xác minh lại, và tài khoản nhận tiền phải đứng tên pháp lý mới.",
}

/** The same code worded for a moderator approving or opening a campaign. */
export const REVIEW_MESSAGES: Record<string, string> = {
  GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT:
    "Chiến dịch chưa có tài khoản nhận tiền dùng được: cần một tài khoản đã xác minh, đứng tên người tổ chức đã xác minh, đang gắn với chiến dịch (tài khoản có thể đã bị khóa, bị nhả, hoặc người tổ chức đã đổi tên pháp lý). Hãy yêu cầu người tổ chức chỉnh sửa.",
}

/**
 * The same code when a just-approved campaign could not open: it stays
 * approved, the cron opens it once the bound account is usable again, and a
 * moderator can send it back for changes so the organizer binds another
 * account (DOS/Give#64). Re-verifying the organizer heals only a reset whose
 * legal name did not change: account names never change, so after a legal
 * name change that account stays unusable.
 */
export const OPEN_MESSAGES: Record<string, string> = {
  GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT:
    "tài khoản nhận tiền đang gắn không còn dùng được. Chiến dịch vẫn ở trạng thái đã duyệt và sẽ tự mở nếu tài khoản đó dùng được trở lại (bộ phận tài chính mở lại tài khoản, hoặc hồ sơ người tổ chức được xác minh lại khi tên pháp lý không đổi). Nếu không, hãy yêu cầu người tổ chức chỉnh sửa để gắn tài khoản khác, tại mục Chiến dịch đã duyệt chờ tài khoản nhận.",
}

/** The transition refusal worded for a moderator sending an approved campaign back. */
export const SEND_BACK_MESSAGES: Record<string, string> = {
  GIVE_TRANSITION_NOT_ALLOWED:
    "Không yêu cầu chỉnh sửa được: chiến dịch vừa đổi trạng thái (có thể đã được mở công khai). Hãy tải lại trang.",
}

/** Result shape that form actions return to useActionState. */
export type ActionResult = { ok: boolean; message: string } | null

export function fail(message: string): ActionResult {
  return { ok: false, message }
}

export function done(message: string): ActionResult {
  return { ok: true, message }
}
