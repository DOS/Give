import { VIA_CONTACT_EMAIL } from "./contact"
import { ORGANIZER_HANDLE_INVALID_MESSAGE, ORGANIZER_HANDLE_RESERVED_MESSAGE } from "./organizer-handle"

/**
 * Turns database errors into messages for people. The give schema raises
 * errors whose message starts with a stable GIVE_* code; anything else gets a
 * generic message so internals never reach the page.
 */

const GIVE_MESSAGES: Record<string, string> = {
  GIVE_CAMPAIGN_NOT_FOUND: "Không tìm thấy chiến dịch, hoặc bạn không có quyền với chiến dịch này.",
  GIVE_CAMPAIGN_STATUS_CHANGED: "Chiến dịch đã đổi trạng thái từ khi trang này tải. Hãy tải lại trang rồi xem lại.",
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
  GIVE_BINDING_NOT_RELEASABLE: `Chưa nhả được tài khoản: chiến dịch phải là bản nháp, được yêu cầu chỉnh sửa, hoặc đã hủy, mà tài khoản chưa nhận giao dịch nào; hoặc đã kết thúc và xong hẳn phần tiền (chiến dịch từ thiện cần kết thúc ít nhất 30 ngày). Giao dịch đã vào tài khoản là lịch sử tiền của chiến dịch nên tài khoản không nhả sớm được. Nếu tài khoản không dùng được nữa khi chiến dịch từ thiện đang gây quỹ, tạm dừng hoặc cần chỉnh sửa, hãy gửi yêu cầu đổi tài khoản ở mục Tài khoản nhận tiền của chiến dịch; với dự án có quà tặng, hãy liên hệ đội ngũ Give ${VIA_CONTACT_EMAIL}.`,
  GIVE_BINDING_HAS_OPEN_TRANSACTIONS:
    "Chưa nhả được tài khoản: còn giao dịch của chiến dịch chưa được đối chiếu hoặc chưa được giải trình.",
  GIVE_CAMPAIGN_ALREADY_BOUND: "Chiến dịch này đã có tài khoản nhận khác.",
  // Donations.
  GIVE_CAMPAIGN_NOT_ACCEPTING: "Chiến dịch này hiện không nhận ủng hộ.",
  GIVE_AMOUNT_BELOW_MINIMUM: "Số tiền thấp hơn mức ủng hộ tối thiểu của chiến dịch.",
  GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT: "Chiến dịch chưa sẵn sàng nhận chuyển khoản. Hãy quay lại sau.",
  GIVE_RATE_LIMITED: "Có nhiều lượt ủng hộ trong thời gian ngắn. Hãy thử lại sau ít phút.",
  // Evidence and campaign reports and moderation (DOS/Give#58, #98).
  GIVE_EVIDENCE_NOT_FOUND: "Không tìm thấy ảnh chứng từ này, hoặc ảnh đã bị ẩn.",
  GIVE_REPORT_REASON_INVALID: "Chọn lý do báo cáo.",
  GIVE_REPORT_REASON_TOO_LONG: "Lý do tối đa 500 ký tự.",
  GIVE_REPORT_DETAILS_REQUIRED: "Ghi chi tiết khi chọn lý do “Lý do khác”.",
  GIVE_REPORT_DETAILS_TOO_LONG: "Chi tiết báo cáo tối đa 1000 ký tự.",
  GIVE_REPORT_LIMIT: "Bạn đã gửi nhiều báo cáo trong 24 giờ qua. Hãy thử lại sau.",
  GIVE_MODERATION_REASON_REQUIRED: "Ghi lý do ẩn ảnh (ví dụ: lộ số CCCD của người nhận).",
  GIVE_MODERATION_REASON_TOO_LONG: "Lý do tối đa 500 ký tự.",
  GIVE_MODERATION_INVALID: "Thao tác không hợp lệ.",
  GIVE_PUBLIC_NOTE_REQUIRED:
    "Ghi chú công khai là bắt buộc khi tạm dừng yêu cầu thanh toán; người ủng hộ và trang dự án sẽ thấy.",
  GIVE_PUBLIC_NOTE_TOO_LONG: "Ghi chú công khai tối đa 500 ký tự.",
  GIVE_PAYMENT_REQUESTS_NOT_STOPPABLE:
    "Chỉ dừng được yêu cầu thanh toán của dự án có quà tặng đã đạt mục tiêu. Chiến dịch đang gây quỹ thì tạm dừng chiến dịch.",
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
  GIVE_ACCOUNT_OWNER_MISMATCH: `Tài khoản nhận không thuộc về người tổ chức của chiến dịch đang gắn, nên giao dịch này không xử lý được cho chiến dịch đó. Hãy báo đội ngũ Give ${VIA_CONTACT_EMAIL} để kiểm tra lại tài khoản nhận và chiến dịch.`,
  // Money a bank returned from a transfer out (DOS/Give#72): give.link_returned_transfer.
  GIVE_ORIGINAL_TRANSACTION_NOT_FOUND: "Không tìm thấy khoản chuyển đi gốc, hoặc bạn không có quyền với giao dịch đó.",
  GIVE_ORIGINAL_NOT_EXPLAINED:
    "Khoản chuyển đi gốc chưa được giải trình. Người tổ chức cần giải trình khoản đó trước (là khoản chi hay khoản hoàn tiền), rồi mới ghi nhận được tiền bị trả lại.",
  GIVE_RETURN_CAMPAIGN_MISMATCH:
    "Khoản chuyển đi gốc thuộc chiến dịch khác. Tiền bị trả lại phải cùng chiến dịch với khoản chuyển đi gốc.",
  GIVE_RETURN_ACCOUNT_MISMATCH:
    "Khoản chuyển đi gốc đi từ một tài khoản nhận khác. Ngân hàng trả tiền về đúng tài khoản đã chuyển đi.",
  GIVE_RETURN_ASSET_MISMATCH: "Khoản chuyển đi gốc dùng loại tiền khác với khoản tiền bị trả lại.",
  GIVE_RETURN_EXCEEDS_ORIGINAL:
    "Số tiền bị trả lại lớn hơn khoản chuyển đi gốc, nên không phải tiền của khoản đó. Hãy chọn đúng khoản chuyển đi gốc.",
  GIVE_RETURN_BEFORE_ORIGINAL:
    "Tiền bị trả lại được ghi trước ngày của khoản chuyển đi gốc, nên không phải tiền của khoản đó. Hãy chọn đúng khoản chuyển đi gốc.",
  GIVE_TRANSACTION_ALREADY_RETURNED:
    "Khoản tiền vào này đã được ghi nhận là tiền bị trả lại, với khoản chuyển đi gốc, lý do hoặc bằng chứng khác. Ghi nhận đã lưu thì không sửa được.",
  GIVE_ORIGINAL_ALREADY_RETURNED: "Khoản chuyển đi gốc này đã được ghi nhận là bị trả lại bởi một khoản tiền vào khác.",
  GIVE_ACCOUNT_HISTORY_OPEN:
    "Tài khoản này đã được đổi ra khỏi một chiến dịch mà phần tiền chưa xong (chiến dịch chưa kết thúc đủ 30 ngày, hoặc còn giao dịch chưa đối chiếu, chưa giải trình, hoặc còn dòng sao kê chưa ghi nhận), nên chưa dùng cho chiến dịch khác được.",
  // Transfers between a campaign's own accounts after a swap (DOS/Give#84);
  // the finance action words them for its context (OWN_TRANSFER_MESSAGES).
  GIVE_TRANSACTION_OWN_TRANSFER:
    "Giao dịch này đã được đánh dấu là tiền chuyển từ tài khoản cũ sang tài khoản mới của chính chiến dịch, nên không giải trình, khớp hay hoàn tiền trên nó được nữa.",
  GIVE_TRANSACTION_ALREADY_TRANSFERRED:
    "Một trong hai giao dịch đã nằm trong một cặp chuyển tài khoản khác. Hãy tải lại trang.",
  GIVE_OWN_TRANSFER_CAMPAIGN_MISMATCH: "Hai giao dịch thuộc hai chiến dịch khác nhau.",
  GIVE_OWN_TRANSFER_AMOUNT_MISMATCH: "Hai giao dịch phải cùng số tiền và cùng loại tiền.",
  GIVE_OWN_TRANSFER_NOT_SWAPPED: "Hai tài khoản không nối với nhau bằng một lần đổi tài khoản đã duyệt của chiến dịch.",
  // A mistaken explanation returned to unmatched (DOS/Give#196); the admin
  // action words them for its context (RETURN_TO_UNMATCHED_MESSAGES).
  GIVE_EXPLANATION_RETURNED:
    'Giải trình của khoản tiền này đã được đưa về chưa khớp. Khoản tiền chỉ còn khớp được với một lượt ủng hộ; không giải trình lại được là "không phải tiền ủng hộ" và không sửa giải trình được nữa.',
  GIVE_EXPLANATION_ALREADY_RETURNED:
    "Giải trình của khoản tiền này đã được đưa về chưa khớp từ trước, với lý do khác. Mỗi giao dịch chỉ đưa về được một lần.",
  GIVE_BINDING_RELEASED:
    "Tài khoản nhận của giao dịch này đã được nhả khỏi chiến dịch, nên khoản tiền không đưa về chưa khớp được nữa.",
  // Statement row resolution for non-transactions (DOS/Give#78).
  GIVE_RESOLUTION_NOT_FOR_REASON:
    "Chỉ đánh dấu “không phải giao dịch thật” được cho dòng thuộc lần tải sao kê đã bị đội tài chính bỏ qua.",
  GIVE_ROW_HAS_ACTIVE_DUPLICATE:
    "Một lần tải sao kê khác có dòng đã được bỏ qua vì trùng với dòng này, nên không thể đánh dấu dòng này là không phải giao dịch thật. Hãy kiểm tra lại với sao kê ngân hàng: nếu đây là giao dịch thật, hãy nhập hoặc đánh dấu là giao dịch đã ghi.",
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
  // Organizer campaign analytics (DOS/Give#252).
  GIVE_ANALYTICS_EVENT_INVALID: "Loại sự kiện thống kê không hợp lệ.",
  GIVE_ANALYTICS_DAYS_INVALID: "Khoảng thời gian thống kê không hợp lệ.",
  GIVE_SIGN_IN_REQUIRED: "Hãy đăng nhập để tiếp tục.",
  // Campaign comments, replies, reports and moderation (DOS/Give#250, #262).
  GIVE_COMMENT_NOT_FOUND: "Không tìm thấy bình luận này, hoặc bình luận đã bị xóa hay đã ẩn.",
  GIVE_REPORT_NOT_FOUND: "Không tìm thấy báo cáo bình luận này. Hãy tải lại trang.",
  GIVE_COMMENT_BODY_REQUIRED: "Hãy nhập nội dung bình luận.",
  GIVE_COMMENT_BODY_TOO_LONG: "Nội dung bình luận tối đa 2000 ký tự.",
  GIVE_COMMENT_NESTING_NOT_ALLOWED: "Chỉ hỗ trợ trả lời một cấp (không thể trả lời một phản hồi khác).",
  GIVE_COMMENT_HIDDEN: "Bình luận này đã bị ẩn (hoặc có phản hồi đã bị ẩn) nên bạn không thể sửa hoặc xóa.",
  // Organizer public profile handle (DOS/Give#251, #261).
  GIVE_HANDLE_INVALID: ORGANIZER_HANDLE_INVALID_MESSAGE,
  GIVE_HANDLE_RESERVED: ORGANIZER_HANDLE_RESERVED_MESSAGE,
  // Co-organizers / campaign editors (DOS/Give#253, #264).
  GIVE_AUTH_REQUIRED: "Hãy đăng nhập để tiếp tục.",
  GIVE_CAMPAIGN_OWNER_ONLY: "Chỉ người tổ chức chính của chiến dịch mới thực hiện được thao tác này.",
  GIVE_CAMPAIGN_NOT_INVITABLE: "Không thể mời đồng tổ chức khi chiến dịch đã hủy hoặc đang tạm dừng.",
  GIVE_INVITE_EXPIRY_INVALID: "Thời hạn lời mời phải từ 1 đến 720 giờ (tối đa 30 ngày).",
  GIVE_INVITE_NOTE_TOO_LONG: "Ghi chú lời mời tối đa 120 ký tự.",
  GIVE_CAMPAIGN_MEMBER_LIMIT: "Chiến dịch đã đạt giới hạn tối đa 20 đồng tổ chức.",
  GIVE_CAMPAIGN_INVITE_LIMIT: "Chiến dịch đã đạt giới hạn tối đa 20 lời mời đang chờ.",
  GIVE_INVITE_INVALID: "Liên kết lời mời không hợp lệ hoặc không tồn tại.",
  GIVE_INVITE_REVOKED: "Lời mời này đã bị người tổ chức thu hồi.",
  GIVE_INVITE_ALREADY_USED: "Liên kết lời mời này đã được sử dụng (mỗi liên kết chỉ dùng một lần).",
  GIVE_INVITE_ALREADY_ACCEPTED:
    "Lời mời này đã được chấp nhận nên không thể thu hồi. Hãy gỡ thành viên trong danh sách đội ngũ.",
  GIVE_INVITE_EXPIRED: "Lời mời này đã hết hạn. Hãy nhờ người tổ chức tạo liên kết mời mới.",
  GIVE_ALREADY_CAMPAIGN_OWNER: "Bạn đã là người tổ chức chính của chiến dịch này.",
  GIVE_ALREADY_CAMPAIGN_MEMBER: "Bạn đã là đồng tổ chức của chiến dịch này rồi.",
  GIVE_CAMPAIGN_MEMBER_NOT_FOUND: "Không tìm thấy đồng tổ chức này trong chiến dịch.",
}

const PG_MESSAGES: Record<string, string> = {
  "23505": "Dữ liệu bị trùng. Hãy thử lại.",
  "23514": "Dữ liệu không hợp lệ.",
  "42501": "Bạn không có quyền thực hiện thao tác này.",
  PT429: "Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.",
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
  GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT: `Chưa gửi duyệt được: chiến dịch cần một tài khoản nhận tiền đã xác minh, đứng tên bạn, gắn vào chiến dịch. Vào mục Tài khoản nhận tiền để khai báo, xác minh và gắn tài khoản; nếu tài khoản đang gắn đã bị khóa hoặc không còn dùng được, hãy nhả nó rồi gắn tài khoản khác (tài khoản đã nhận giao dịch thì không nhả được: với chiến dịch từ thiện, gửi yêu cầu đổi tài khoản trong cùng mục; với dự án có quà tặng, liên hệ đội ngũ Give ${VIA_CONTACT_EMAIL}). Nếu bạn vừa đổi tên pháp lý, hồ sơ người tổ chức cần được xác minh lại, và tài khoản nhận tiền phải đứng tên pháp lý mới.`,
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

/** The transition refusal worded for a moderator sending a suspended-before-start campaign back (DOS/Give#77). */
export const SUSPENDED_SEND_BACK_MESSAGES: Record<string, string> = {
  GIVE_TRANSITION_NOT_ALLOWED:
    "Không yêu cầu chỉnh sửa được: chỉ gửi lại chỉnh sửa cho chiến dịch tạm dừng trước ngày bắt đầu và chưa từng gây quỹ hay có lượt ủng hộ. Hãy tải lại trang.",
}

/**
 * Every refusal of give.mark_own_account_transfer (DOS/Give#84), worded for
 * finance pairing money out of a campaign's old account with the same money
 * into its new account after a swap.
 */
export const OWN_TRANSFER_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED:
    "Chỉ nhân viên tài chính hoặc quản trị viên mới đánh dấu được tiền chuyển giữa các tài khoản của chiến dịch.",
  GIVE_REASON_REQUIRED: "Ghi căn cứ đã kiểm tra (ví dụ: dòng sao kê của cả hai tài khoản, tin nhắn của người tổ chức).",
  GIVE_REASON_TOO_LONG: "Căn cứ tối đa 1000 ký tự.",
  GIVE_TRANSACTION_NOT_FOUND: "Không tìm thấy một trong hai giao dịch. Hãy tải lại trang.",
  GIVE_TRANSACTION_NOT_OUTBOUND: "Khoản ở tài khoản cũ phải là tiền ra.",
  GIVE_TRANSACTION_NOT_INBOUND: "Khoản ở tài khoản mới phải là tiền vào.",
  GIVE_TRANSACTION_UNATTRIBUTED: "Một trong hai giao dịch không thuộc chiến dịch nào, nên không đánh dấu được.",
  GIVE_OWN_TRANSFER_CAMPAIGN_MISMATCH:
    "Hai giao dịch thuộc hai chiến dịch khác nhau, nên không phải tiền chuyển nội bộ.",
  GIVE_SELF_REVIEW: "Không thể đánh dấu tiền của chiến dịch do chính bạn tổ chức; một nhân viên khác cần xử lý.",
  GIVE_TRANSACTION_ALREADY_TRANSFERRED:
    "Một trong hai giao dịch đã nằm trong một cặp chuyển tài khoản khác. Hãy tải lại trang.",
  GIVE_OWN_TRANSFER_AMOUNT_MISMATCH: "Hai giao dịch phải cùng số tiền và cùng loại tiền.",
  GIVE_OWN_TRANSFER_NOT_SWAPPED:
    "Hai tài khoản không nối với nhau bằng một lần đổi tài khoản đã duyệt của chiến dịch: khoản tiền ra phải ở tài khoản cũ đã được đổi đi, khoản tiền vào phải ở tài khoản mới được gắn từ lúc đổi trở đi.",
  GIVE_DISBURSEMENT_ALREADY_EXPLAINED:
    "Người tổ chức đã giải trình khoản tiền ra này là một khoản chi. Giải trình đã công khai thì không đổi được.",
  GIVE_TRANSACTION_ALREADY_MATCHED: "Khoản tiền vào này đã được khớp với một lượt ủng hộ.",
  GIVE_TRANSACTION_ALREADY_EXPLAINED: "Khoản tiền vào này đã được giải trình là tiền không phải ủng hộ.",
  GIVE_LEDGER_POST_MISSING:
    "Một trong hai giao dịch không còn chờ xử lý trong sổ: chưa được ghi sổ, hoặc đã được xử lý theo cách khác (ví dụ đã ghi là tiền bị trả lại). Hãy tải lại trang; nếu vẫn lỗi, báo đội ngũ kỹ thuật.",
}

/**
 * Every refusal of give.correct_inbound_explanation (DOS/Give#71), worded for
 * an admin correcting an explanation of incoming money "not a donation" that
 * was a donation after all. Codes shared with other actions are worded for
 * this one here.
 */
export const CORRECT_EXPLANATION_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: "Chỉ quản trị viên mới sửa được giải trình tiền vào.",
  GIVE_CONTRIBUTION_REQUIRED: "Chọn lượt ủng hộ mà khoản tiền này thực ra thuộc về.",
  GIVE_REASON_REQUIRED: "Ghi lý do vì sao giải trình trước là nhầm và bạn đã kiểm tra những gì.",
  GIVE_REASON_TOO_LONG: "Lý do tối đa 1000 ký tự.",
  GIVE_TRANSACTION_NOT_FOUND: "Không tìm thấy giao dịch. Hãy tải lại trang.",
  GIVE_TRANSACTION_NOT_INBOUND: "Chỉ sửa được giải trình của khoản tiền vào.",
  GIVE_TRANSACTION_UNATTRIBUTED: "Giao dịch này không thuộc chiến dịch nào, nên không có lượt ủng hộ nào để ghi nhận.",
  GIVE_SELF_REVIEW:
    "Bạn không sửa được giải trình này: bạn là người tổ chức chiến dịch, người đã giải trình khoản này, hoặc người ủng hộ của lượt đã chọn (kể cả lượt ủng hộ không đăng nhập dùng email của bạn). Nhờ một quản trị viên khác.",
  GIVE_EXPLANATION_ALREADY_CORRECTED:
    "Giải trình này đã được sửa rồi (với lượt ủng hộ hoặc lý do khác). Mỗi giải trình chỉ sửa được một lần. Hãy tải lại trang.",
  GIVE_TRANSACTION_NOT_EXPLAINED:
    "Giao dịch này chưa được giải trình là không phải tiền ủng hộ, nên không có gì để sửa.",
  GIVE_TRANSACTION_ALREADY_MATCHED: "Giao dịch này đã được khớp với một lượt ủng hộ.",
  GIVE_LEDGER_POST_MISSING:
    "Sổ của giao dịch không còn ở trạng thái đã giải trình (có thể vừa được xử lý ở nơi khác). Hãy tải lại trang; nếu vẫn lỗi, báo đội ngũ kỹ thuật.",
  GIVE_ACCOUNT_OWNER_MISMATCH:
    "Tài khoản nhận không thuộc về người tổ chức của chiến dịch, nên tiền không ghi nhận được cho lượt ủng hộ nào của chiến dịch đó. Cần sửa dữ liệu tài khoản nhận trước.",
  GIVE_CONTRIBUTION_CAMPAIGN_MISMATCH:
    "Lượt ủng hộ đã chọn thuộc chiến dịch khác. Chỉ chọn được lượt ủng hộ của cùng chiến dịch.",
  GIVE_CONTRIBUTION_NOT_MATCHABLE:
    "Lượt ủng hộ này không nhận thêm tiền được (đã hủy, đã hoàn tiền, hoặc khác loại tiền). Hãy chọn lượt khác.",
  // The explanation was returned to unmatched (DOS/Give#196): the money is matched, not corrected.
  GIVE_EXPLANATION_RETURNED:
    'Giải trình này đã được đưa về chưa khớp, nên không sửa được nữa. Khoản tiền đang ở mục "Chờ khớp": hãy khớp với lượt ủng hộ ở đó.',
}

/**
 * Every refusal of give.return_inbound_to_unmatched (DOS/Give#196, DOS-Me
 * 20261117090000), worded for an admin sending a mistaken explanation of
 * incoming money back to unmatched. Codes shared with other actions are
 * worded for this one here.
 */
export const RETURN_TO_UNMATCHED_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: "Chỉ quản trị viên mới đưa được giải trình tiền vào về chưa khớp.",
  GIVE_REASON_REQUIRED: "Ghi lý do vì sao giải trình là nhầm và bạn đã kiểm tra những gì.",
  GIVE_REASON_TOO_LONG: "Lý do tối đa 1000 ký tự.",
  GIVE_TRANSACTION_NOT_FOUND: "Không tìm thấy giao dịch. Hãy tải lại trang.",
  GIVE_TRANSACTION_NOT_INBOUND: "Chỉ đưa về chưa khớp được khoản tiền vào.",
  GIVE_TRANSACTION_UNATTRIBUTED: "Giao dịch này không thuộc chiến dịch nào, nên không đưa về chưa khớp được.",
  GIVE_SELF_REVIEW:
    "Bạn không đưa được khoản này về chưa khớp: bạn là người tổ chức chiến dịch, hoặc người đã giải trình khoản này. Nhờ một quản trị viên khác.",
  GIVE_EXPLANATION_ALREADY_RETURNED:
    "Giải trình này đã được đưa về chưa khớp từ trước, với lý do khác. Mỗi giao dịch chỉ đưa về được một lần. Hãy tải lại trang.",
  GIVE_EXPLANATION_ALREADY_CORRECTED:
    "Giải trình này đã được sửa thành tiền của một lượt ủng hộ, nên không đưa về chưa khớp được. Hãy tải lại trang.",
  GIVE_TRANSACTION_NOT_EXPLAINED:
    "Giao dịch này chưa được giải trình là không phải tiền ủng hộ, nên không có gì để đưa về.",
  GIVE_TRANSACTION_ALREADY_MATCHED: "Giao dịch này đã được khớp với một lượt ủng hộ.",
  GIVE_BINDING_RELEASED:
    'Tài khoản nhận đã được nhả khỏi chiến dịch, nên khoản này không đưa về chưa khớp được nữa. Nếu đây là tiền ủng hộ của một lượt đã biết, dùng "Sửa giải trình".',
  GIVE_LEDGER_POST_MISSING:
    "Sổ của giao dịch không còn ở trạng thái đã giải trình (có thể vừa được xử lý ở nơi khác). Hãy tải lại trang; nếu vẫn lỗi, báo đội ngũ kỹ thuật.",
  GIVE_ACCOUNT_OWNER_MISMATCH:
    "Tài khoản nhận không thuộc về người tổ chức của chiến dịch, nên sau khi đưa về sẽ không khớp được với lượt ủng hộ nào. Cần sửa dữ liệu tài khoản nhận trước.",
}

/**
 * Every refusal of give.resolve_statement_import_row (design section 5.2,
 * DOS/Give#78), worded for finance staff resolving a statement row on
 * /admin/statements: its own checks, and the recording of an imported row
 * (give.record_bank_transaction). Codes shared with other actions are worded
 * for this one here.
 */
export const STATEMENT_ROW_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: "Chỉ nhân viên tài chính hoặc quản trị viên được xử lý dòng sao kê.",
  GIVE_RESOLUTION_INVALID: "Cách xử lý không hợp lệ.",
  GIVE_RESOLUTION_NOTE_REQUIRED: "Ghi chú là bắt buộc: ghi bạn đã đối chiếu với nguồn nào.",
  GIVE_IMPORT_ROW_NOT_FOUND: "Không tìm thấy dòng sao kê này.",
  GIVE_IMPORT_ROW_NOT_AMBIGUOUS:
    "Dòng này đã được xử lý theo cách khác (có thể bởi người khác). Hãy tải lại trang để xem kết quả.",
  GIVE_SELF_REVIEW:
    "Bạn không xử lý được dòng này: tài khoản nhận là của bạn, hoặc dòng thuộc thời gian tài khoản gắn với chiến dịch do bạn tổ chức. Một nhân viên tài chính khác cần xử lý.",
  GIVE_RESOLUTION_CANDIDATE:
    "Dòng này khớp với một dòng sao kê đã tải trước. Hãy đánh dấu là giao dịch đã ghi, hoặc tích xác nhận đây là giao dịch khác rồi mới nhập.",
  GIVE_DUPLICATE_TARGET_INVALID:
    "Giao dịch đã chọn không cùng tài khoản, chiều hoặc số tiền với dòng này, hoặc một dòng khác trong cùng file đã ứng với nó.",
  GIVE_RESOLUTION_NOT_FOR_REASON:
    "Chỉ đánh dấu “không phải giao dịch thật” được cho dòng thuộc lần tải sao kê đã bị đội tài chính bỏ qua, hoặc dòng đang chờ đội tài chính duyệt.",
  GIVE_ROW_HAS_ACTIVE_DUPLICATE:
    "Một lần tải sao kê khác có dòng đã được bỏ qua vì trùng với dòng này, nên không thể đánh dấu dòng này là không phải giao dịch thật. Hãy kiểm tra lại với sao kê ngân hàng: nếu đây là giao dịch thật, hãy nhập hoặc đánh dấu là giao dịch đã ghi.",
  GIVE_TRANSACTION_CONFLICT:
    "Mã giao dịch của dòng này đã được ghi với số tiền, chiều hoặc ngày khác, nên không nhập được. Hãy đối chiếu với sao kê ngân hàng; nếu đúng là giao dịch đã ghi, hãy đánh dấu là giao dịch đã ghi.",
  GIVE_BINDING_CHANGED: "Tài khoản vừa được gắn hoặc đổi chiến dịch trong lúc nhập. Hãy tải lại trang và thử lại.",
  GIVE_ACCOUNT_OWNER_MISMATCH:
    "Tài khoản nhận không thuộc về người tổ chức của chiến dịch đang gắn, nên dòng này không nhập được cho chiến dịch đó. Hãy báo đội ngũ Give kiểm tra lại tài khoản nhận và chiến dịch.",
}

/** Refusals of give.restore_campaign_statement_trust (DOS/Give#57). */
export const RESTORE_TRUST_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: "Chỉ nhân viên tài chính hoặc quản trị viên được khôi phục tin cậy của chiến dịch.",
  GIVE_SETTING_NOTE_REQUIRED: "Ghi chú là bắt buộc: ghi vì sao chiến dịch đáng tin trở lại.",
  GIVE_SELF_REVIEW:
    "Bạn không khôi phục được chiến dịch do bạn tổ chức hoặc gắn với tài khoản của bạn. Một nhân viên tài chính khác cần làm.",
  GIVE_TRUST_NOT_REVOKED: "Chiến dịch này không bị chặn tin cậy, không có gì để khôi phục. Hãy tải lại trang.",
  GIVE_TRUST_CHANGED:
    "Dòng bị từ chối mới nhất của chiến dịch không còn là dòng bạn đã xem (vừa có dòng khác bị từ chối, hoặc người khác vừa khôi phục). Hãy tải lại trang, xem lại rồi mới khôi phục.",
  GIVE_CAMPAIGN_NOT_FOUND: "Không tìm thấy chiến dịch.",
}

/** Refusals of give.set_statement_review_threshold (DOS/Give#57). */
export const REVIEW_THRESHOLD_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: "Chỉ nhân viên tài chính hoặc quản trị viên được đổi ngưỡng duyệt và giới hạn mỗi ngày.",
  GIVE_THRESHOLD_INVALID: "Hãy nhập một số tiền VND nguyên, lớn hơn 0.",
  GIVE_SETTING_NOTE_REQUIRED: "Ghi chú là bắt buộc: ghi lý do thay đổi.",
}

/**
 * Every refusal of give.report_campaign (DOS/Give#98, DOS-Me
 * 20261120090000_give_campaign_reports.sql), worded for a signed-in visitor
 * reporting a public campaign. GIVE_NOT_ALLOWED here is a self-report.
 */
export const REPORT_CAMPAIGN_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: "Bạn không thể báo cáo chiến dịch của chính mình.",
  GIVE_REPORT_REASON_INVALID: "Chọn lý do báo cáo.",
  GIVE_REPORT_DETAILS_REQUIRED: "Ghi chi tiết khi chọn lý do “Lý do khác”.",
  GIVE_REPORT_DETAILS_TOO_LONG: "Chi tiết báo cáo tối đa 1000 ký tự.",
  GIVE_CAMPAIGN_NOT_FOUND: "Không tìm thấy chiến dịch công khai này.",
  GIVE_REPORT_LIMIT: "Bạn đã gửi nhiều báo cáo trong 24 giờ qua. Hãy thử lại sau.",
}

/**
 * Every refusal of give.moderate_campaign_reports (and
 * give.set_payment_requests_stopped when stopping payment requests from the
 * report queue; DOS/Give#98, DOS-Me 20261120090000_give_campaign_reports.sql),
 * worded for a moderator or admin on /admin/reports.
 */
export const MODERATE_CAMPAIGN_REPORTS_MESSAGES: Record<string, string> = {
  GIVE_NOT_ADMIN: "Chỉ kiểm duyệt viên hoặc quản trị viên được xử lý báo cáo chiến dịch.",
  GIVE_MODERATION_INVALID: "Thao tác không hợp lệ.",
  GIVE_REASON_REQUIRED:
    "Ghi ghi chú xử lý (câu hỏi gửi người tổ chức, lý do tạm dừng hoặc lý do lưu vào nhật ký kiểm toán).",
  GIVE_REASON_TOO_LONG: "Ghi chú quá dài (tối đa 1000 ký tự).",
  GIVE_PUBLIC_NOTE_REQUIRED:
    "Ghi chú công khai là bắt buộc khi tạm dừng yêu cầu thanh toán; người ủng hộ và trang dự án sẽ thấy.",
  GIVE_PUBLIC_NOTE_TOO_LONG: "Ghi chú công khai tối đa 500 ký tự.",
  GIVE_CAMPAIGN_NOT_FOUND: "Không tìm thấy chiến dịch. Hãy tải lại trang.",
  GIVE_SELF_REVIEW: "Không thể xử lý báo cáo về chiến dịch do chính bạn tổ chức; một kiểm duyệt viên khác cần xử lý.",
  GIVE_TRANSITION_NOT_ALLOWED:
    "Chỉ tạm dừng được chiến dịch đã duyệt hoặc đang gây quỹ. Với dự án có quà tặng đã đạt mục tiêu, dùng “Tạm dừng yêu cầu thanh toán”.",
  GIVE_PAYMENT_REQUESTS_NOT_STOPPABLE:
    "Chỉ dừng được yêu cầu thanh toán của dự án có quà tặng đã đạt mục tiêu. Chiến dịch đang gây quỹ thì tạm dừng chiến dịch.",
}

/** Result shape that form actions return to useActionState. */
export type ActionResult = { ok: boolean; message: string } | null

export function fail(message: string): ActionResult {
  return { ok: false, message }
}

export function done(message: string): ActionResult {
  return { ok: true, message }
}

/**
 * Every refusal of the monthly plan RPCs (DOS/Give#276, DOS-Me
 * 20261125120000_give_donation_plans.sql: create_donation_plan,
 * update_donation_plan, cancel_donation_plan), worded for a signed-in donor.
 */
export const PLAN_MESSAGES: Record<string, string> = {
  GIVE_SIGN_IN_REQUIRED: "Hãy đăng nhập để đăng ký ủng hộ hằng tháng.",
  GIVE_PLAN_CONSENT_REQUIRED: "Hãy đồng ý nhận lời nhắc hằng tháng để Give gửi mã ủng hộ mỗi tháng.",
  GIVE_PLAN_DAY_INVALID: "Chọn một ngày từ 1 đến 28.",
  GIVE_AMOUNT_BELOW_MINIMUM: "Số tiền mỗi tháng tối thiểu 10.000 ₫.",
  GIVE_MONTHLY_NOT_ALLOWED: "Chiến dịch này không nhận ủng hộ hằng tháng.",
  GIVE_CAMPAIGN_NOT_ACCEPTING: "Chiến dịch này hiện không nhận ủng hộ hằng tháng.",
  GIVE_PLAN_EXISTS: "Bạn đã có kế hoạch ủng hộ hằng tháng cho chiến dịch này. Xem và sửa ở mục Ủng hộ của tôi.",
  GIVE_PLAN_NOT_FOUND: "Không tìm thấy kế hoạch ủng hộ hằng tháng này.",
  GIVE_PLAN_ENDED: "Kế hoạch này đã dừng nên không sửa được. Bạn có thể đăng ký lại ở trang chiến dịch.",
  GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT: "Chiến dịch tạm thời không nhận ủng hộ. Hãy thử lại sau.",
  GIVE_RATE_LIMITED: "Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.",
}

/**
 * Refusals of give.set_campaign_monthly, worded for the organizer turning
 * monthly giving on or off.
 */
export const CAMPAIGN_MONTHLY_MESSAGES: Record<string, string> = {
  GIVE_MONTHLY_NEEDS_END_DATE: "Ủng hộ hằng tháng chỉ bật được cho chiến dịch có ngày kết thúc.",
  GIVE_CAMPAIGN_ALREADY_ENDED: "Chiến dịch đã quá ngày kết thúc.",
  GIVE_CAMPAIGN_NOT_ACCEPTING: "Chiến dịch đã kết thúc hoặc đã hủy nên không bật được ủng hộ hằng tháng.",
  GIVE_CONTRIBUTION_TYPE_MISMATCH: "Chỉ chiến dịch từ thiện mới có ủng hộ hằng tháng.",
}

/**
 * Extracts retry-after seconds from a `GIVE_RATE_LIMITED: <seconds>` error
 * message raised by campaign comment write RPCs (DOS/Give#250, #262).
 */
export function rateLimitSeconds(error: DbErrorLike | null | undefined): number | null {
  const match = /^GIVE_RATE_LIMITED:\s*(\d+)\b/.exec(error?.message ?? "")
  if (!match) return null
  const seconds = Number(match[1])
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null
}

/**
 * Maps database errors from campaign comment RPCs, preserving retry-after
 * guidance from `GIVE_RATE_LIMITED: <seconds>` when present.
 */
export function commentDbErrorMessage(
  error: DbErrorLike | null | undefined,
  overrides: Record<string, string> = {}
): string {
  if (giveErrorCode(error) === "GIVE_RATE_LIMITED") {
    const seconds = rateLimitSeconds(error)
    if (seconds !== null) {
      if (seconds >= 60) {
        return `Bạn thao tác quá nhanh. Hãy thử lại sau khoảng ${Math.ceil(seconds / 60)} phút.`
      }
      return `Bạn thao tác quá nhanh. Hãy thử lại sau ${seconds} giây.`
    }
    return overrides.GIVE_RATE_LIMITED ?? "Bạn thao tác quá nhanh. Hãy thử lại sau ít phút."
  }
  return dbErrorMessage(error, overrides)
}

/**
 * Refusals of author comment actions (`create_campaign_comment`,
 * `edit_campaign_comment`, `delete_campaign_comment`; DOS/Give#250, #262).
 */
export const COMMENT_ACTION_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: "Bạn không có quyền thực hiện thao tác này trên bình luận.",
  GIVE_CAMPAIGN_NOT_FOUND: "Không tìm thấy chiến dịch công khai này.",
  GIVE_COMMENT_NOT_FOUND: "Không tìm thấy bình luận này, hoặc bình luận đã bị xóa hay đã ẩn.",
  GIVE_COMMENT_BODY_REQUIRED: "Hãy nhập nội dung bình luận.",
  GIVE_COMMENT_BODY_TOO_LONG: "Nội dung bình luận tối đa 2000 ký tự.",
  GIVE_COMMENT_NESTING_NOT_ALLOWED: "Chỉ hỗ trợ trả lời một cấp (không thể trả lời một phản hồi khác).",
  GIVE_COMMENT_HIDDEN: "Bình luận này đã bị ẩn (hoặc có phản hồi đã bị ẩn) nên bạn không thể sửa hoặc xóa.",
  GIVE_RATE_LIMITED: "Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.",
}

/**
 * Refusals of `give.hide_campaign_comment` worded for the campaign organizer.
 */
export const COMMENT_ORGANIZER_HIDE_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: "Chỉ người tổ chức của chiến dịch mới ẩn được bình luận tại đây.",
  GIVE_CAMPAIGN_NOT_FOUND: "Không tìm thấy chiến dịch công khai này.",
  GIVE_COMMENT_NOT_FOUND: "Không tìm thấy bình luận này, hoặc bình luận đã bị xóa.",
  GIVE_REASON_TOO_LONG: "Lý do tối đa 500 ký tự.",
  GIVE_RATE_LIMITED: "Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.",
}

/**
 * Refusals of `give.report_campaign_comment` worded for a signed-in visitor.
 */
export const COMMENT_REPORT_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: "Bạn không thể báo cáo bình luận của chính mình.",
  GIVE_CAMPAIGN_NOT_FOUND: "Không tìm thấy chiến dịch công khai này.",
  GIVE_COMMENT_NOT_FOUND: "Không tìm thấy bình luận này, hoặc bình luận đã bị xóa hay đã ẩn.",
  GIVE_REPORT_REASON_INVALID: "Chọn lý do báo cáo.",
  GIVE_REPORT_DETAILS_REQUIRED: "Ghi chi tiết khi chọn lý do “Lý do khác”.",
  GIVE_REPORT_DETAILS_TOO_LONG: "Chi tiết báo cáo tối đa 1000 ký tự.",
  GIVE_REPORT_LIMIT: "Bạn đã gửi tối đa 20 báo cáo bình luận trong 24 giờ qua. Hãy thử lại sau.",
}

/**
 * Refusals of direct staff comment moderation (`moderate_campaign_comment`;
 * DOS/Give#250, #262).
 */
export const COMMENT_MODERATION_MESSAGES: Record<string, string> = {
  GIVE_NOT_ALLOWED: "Bạn không có quyền kiểm duyệt bình luận.",
  GIVE_NOT_ADMIN: "Chỉ kiểm duyệt viên hoặc quản trị viên được kiểm duyệt bình luận.",
  GIVE_SELF_REVIEW:
    "Không thể tự kiểm duyệt bình luận của chính mình hoặc trên chiến dịch do chính bạn tổ chức; một kiểm duyệt viên khác cần xử lý.",
  GIVE_COMMENT_NOT_FOUND: "Không tìm thấy bình luận (tác giả có thể đã xóa bình luận này). Hãy tải lại trang.",
  GIVE_REPORT_NOT_FOUND: "Không tìm thấy báo cáo bình luận này. Hãy tải lại trang.",
  GIVE_REASON_REQUIRED: "Cần ghi lý do xử lý để lưu vào nhật ký kiểm toán.",
  GIVE_REASON_TOO_LONG: "Lý do tối đa 500 ký tự.",
  GIVE_MODERATION_INVALID: "Thao tác kiểm duyệt không hợp lệ.",
}

/**
 * Refusals of `give.resolve_comment_report` (DOS/Give#250, #262), where
 * hiding a deleted comment fails with `GIVE_COMMENT_NOT_FOUND` and staff can
 * still dismiss the report.
 */
export const COMMENT_REPORT_RESOLVE_MESSAGES: Record<string, string> = {
  ...COMMENT_MODERATION_MESSAGES,
  GIVE_COMMENT_NOT_FOUND:
    "Không tìm thấy bình luận (tác giả có thể đã xóa bình luận này). Bạn chỉ có thể bác bỏ báo cáo.",
}

/**
 * Refusals of co-organizer invite and member RPCs (DOS/Give#253, #264).
 */
export const CAMPAIGN_MEMBER_MESSAGES: Record<string, string> = {
  GIVE_AUTH_REQUIRED: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
  GIVE_CAMPAIGN_OWNER_ONLY: "Chỉ người tổ chức chính của chiến dịch mới thực hiện được thao tác này.",
  GIVE_CAMPAIGN_NOT_INVITABLE: "Không thể mời đồng tổ chức khi chiến dịch đã hủy hoặc đang tạm dừng.",
  GIVE_INVITE_EXPIRY_INVALID: "Thời hạn lời mời phải từ 1 đến 720 giờ (tối đa 30 ngày).",
  GIVE_INVITE_NOTE_TOO_LONG: "Ghi chú lời mời tối đa 120 ký tự.",
  GIVE_CAMPAIGN_MEMBER_LIMIT: "Chiến dịch đã đạt giới hạn tối đa 20 đồng tổ chức.",
  GIVE_CAMPAIGN_INVITE_LIMIT: "Chiến dịch đã đạt giới hạn tối đa 20 lời mời đang chờ.",
  GIVE_RATE_LIMITED: "Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.",
  GIVE_INVITE_INVALID: "Liên kết lời mời không hợp lệ hoặc không tồn tại.",
  GIVE_INVITE_REVOKED: "Lời mời này đã bị người tổ chức thu hồi.",
  GIVE_INVITE_ALREADY_USED: "Liên kết lời mời này đã được sử dụng (mỗi liên kết chỉ dùng một lần).",
  GIVE_INVITE_ALREADY_ACCEPTED:
    "Lời mời này đã được chấp nhận nên không thể thu hồi. Hãy gỡ thành viên trong danh sách đội ngũ.",
  GIVE_INVITE_EXPIRED: "Lời mời này đã hết hạn. Hãy nhờ người tổ chức tạo liên kết mời mới.",
  GIVE_ALREADY_CAMPAIGN_OWNER: "Bạn đã là người tổ chức chính của chiến dịch này.",
  GIVE_ALREADY_CAMPAIGN_MEMBER: "Bạn đã là đồng tổ chức của chiến dịch này rồi.",
  GIVE_CAMPAIGN_MEMBER_NOT_FOUND: "Không tìm thấy đồng tổ chức này trong chiến dịch.",
}

/**
 * Maps database errors from co-organizer RPCs, preserving retry-after guidance
 * from `GIVE_RATE_LIMITED: <seconds>` when present.
 */
export function campaignMemberDbErrorMessage(
  error: DbErrorLike | null | undefined,
  overrides: Record<string, string> = {}
): string {
  return commentDbErrorMessage(error, { ...CAMPAIGN_MEMBER_MESSAGES, ...overrides })
}
