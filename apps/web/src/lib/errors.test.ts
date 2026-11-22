import { describe, expect, it } from "vitest"

import {
  CAMPAIGN_MEMBER_MESSAGES,
  campaignMemberDbErrorMessage,
  COMMENT_ACTION_MESSAGES,
  COMMENT_MODERATION_MESSAGES,
  COMMENT_ORGANIZER_HIDE_MESSAGES,
  COMMENT_REPORT_MESSAGES,
  COMMENT_REPORT_RESOLVE_MESSAGES,
  commentDbErrorMessage,
  CORRECT_EXPLANATION_MESSAGES,
  dbErrorMessage,
  giveErrorCode,
  MODERATE_CAMPAIGN_REPORTS_MESSAGES,
  OPEN_MESSAGES,
  OWN_TRANSFER_MESSAGES,
  rateLimitSeconds,
  REPORT_CAMPAIGN_MESSAGES,
  RETURN_TO_UNMATCHED_MESSAGES,
  REVIEW_MESSAGES,
  SUBMIT_MESSAGES,
  STATEMENT_ROW_MESSAGES,
} from "./errors"

describe("giveErrorCode", () => {
  it("reads the code at the start of the message", () => {
    expect(giveErrorCode({ message: "GIVE_TRANSITION_NOT_ALLOWED: draft -> live" })).toBe("GIVE_TRANSITION_NOT_ALLOWED")
    expect(giveErrorCode({ message: "GIVE_REASON_REQUIRED" })).toBe("GIVE_REASON_REQUIRED")
  })

  it("ignores other messages", () => {
    expect(giveErrorCode({ message: "permission denied for table campaigns" })).toBeNull()
    expect(giveErrorCode({ message: "error: GIVE_REASON_REQUIRED" })).toBeNull()
    expect(giveErrorCode(null)).toBeNull()
  })
})

describe("dbErrorMessage", () => {
  it("maps known GIVE_* codes", () => {
    expect(dbErrorMessage({ code: "23514", message: "GIVE_SUBMISSION_INCOMPLETE: category, ..." })).toContain(
      "100 ký tự"
    )
    expect(dbErrorMessage({ message: "GIVE_ORGANIZER_CHANGED_SINCE_REVIEW" })).toContain("tải lại")
    expect(dbErrorMessage({ code: "42501", message: "GIVE_CAMPAIGN_NOT_EDITABLE: in_review" })).toContain("bản nháp")
    expect(dbErrorMessage({ code: "23514", message: "GIVE_HANDLE_INVALID" })).toContain("3–40 ký tự")
    expect(dbErrorMessage({ code: "23514", message: "GIVE_HANDLE_RESERVED" })).toContain("hệ thống giữ chỗ")
  })

  it("falls back to the Postgres or PostgREST error code", () => {
    expect(dbErrorMessage({ code: "42501", message: "permission denied for table campaigns" })).toContain("quyền")
    expect(dbErrorMessage({ code: "PGRST303", message: "JWT expired" })).toContain("đăng nhập lại")
  })

  it("words the missing receiving account for donors, organizers and moderators (DOS/Give#38)", () => {
    const error = { code: "23514", message: "GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT" }
    expect(dbErrorMessage(error)).toBe("Chiến dịch chưa sẵn sàng nhận chuyển khoản. Hãy quay lại sau.")
    expect(dbErrorMessage(error, SUBMIT_MESSAGES)).toContain("Tài khoản nhận tiền")
    expect(dbErrorMessage(error, REVIEW_MESSAGES)).toContain("yêu cầu người tổ chức chỉnh sửa")
    expect(dbErrorMessage(error, OPEN_MESSAGES)).toContain("vẫn ở trạng thái đã duyệt")
    // Re-verification heals only when the legal name did not change (account names never change);
    // otherwise a moderator sends it back (DOS/Give#64).
    expect(OPEN_MESSAGES.GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT).toContain("xác minh lại khi tên pháp lý không đổi")
    expect(OPEN_MESSAGES.GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT).toContain("Chiến dịch đã duyệt chờ tài khoản nhận")
    expect(SUBMIT_MESSAGES.GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT).toContain("đứng tên pháp lý mới")
    // The overrides touch only this code.
    expect(dbErrorMessage({ message: "GIVE_REASON_REQUIRED" }, SUBMIT_MESSAGES)).toBe("Cần ghi lý do.")
  })

  it("explains that an account that received money is not released early", () => {
    expect(dbErrorMessage({ message: "GIVE_BINDING_NOT_RELEASABLE: campaign live since " })).toMatch(
      /Giao dịch đã vào tài khoản là lịch sử tiền của chiến dịch nên tài khoản không nhả sớm được. Nếu tài khoản không dùng được nữa.*yêu cầu đổi tài khoản/
    )
  })

  it("words the account owner refusal on paths other than the match action (DOS/Give#148)", () => {
    expect(dbErrorMessage({ code: "23514", message: "GIVE_ACCOUNT_OWNER_MISMATCH" })).toBe(
      "Tài khoản nhận không thuộc về người tổ chức của chiến dịch đang gắn, nên giao dịch này không xử lý được cho chiến dịch đó. Hãy báo đội ngũ Give qua email hi@give.vn để kiểm tra lại tài khoản nhận và chiến dịch."
    )
  })

  it("words non-transaction statement row resolution refusals (DOS/Give#78)", () => {
    expect(dbErrorMessage({ code: "23514", message: "GIVE_RESOLUTION_NOT_FOR_REASON: balance_break" })).toBe(
      "Chỉ đánh dấu “không phải giao dịch thật” được cho dòng thuộc lần tải sao kê đã bị đội tài chính bỏ qua."
    )
    expect(dbErrorMessage({ code: "23514", message: "GIVE_ROW_HAS_ACTIVE_DUPLICATE" })).toContain(
      "Một lần tải sao kê khác có dòng đã được bỏ qua vì trùng với dòng này"
    )
  })

  it("never echoes unknown internals", () => {
    const message = dbErrorMessage({ code: "XX000", message: "internal: relation give.secret" })
    expect(message).not.toContain("give.secret")
    expect(message).toBe("Có lỗi xảy ra. Hãy thử lại sau.")
  })
})

describe("own-account transfer refusals (DOS/Give#84)", () => {
  // Every code give.mark_own_account_transfer raises (DOS-Me 20261115120000), in its check order.
  const CODES = [
    "GIVE_NOT_ALLOWED",
    "GIVE_REASON_REQUIRED",
    "GIVE_REASON_TOO_LONG",
    "GIVE_TRANSACTION_NOT_FOUND",
    "GIVE_TRANSACTION_NOT_OUTBOUND",
    "GIVE_TRANSACTION_NOT_INBOUND",
    "GIVE_TRANSACTION_UNATTRIBUTED",
    "GIVE_OWN_TRANSFER_CAMPAIGN_MISMATCH",
    "GIVE_SELF_REVIEW",
    "GIVE_TRANSACTION_ALREADY_TRANSFERRED",
    "GIVE_OWN_TRANSFER_AMOUNT_MISMATCH",
    "GIVE_OWN_TRANSFER_NOT_SWAPPED",
    "GIVE_DISBURSEMENT_ALREADY_EXPLAINED",
    "GIVE_TRANSACTION_ALREADY_MATCHED",
    "GIVE_TRANSACTION_ALREADY_EXPLAINED",
    "GIVE_LEDGER_POST_MISSING",
  ]
  const generic = dbErrorMessage(null)

  it("words every code for finance, never the generic message", () => {
    for (const code of CODES) {
      const message = dbErrorMessage({ code: "23514", message: `${code}: detail` }, OWN_TRANSFER_MESSAGES)
      expect(message, code).not.toBe(generic)
      expect(message, code).toBe(OWN_TRANSFER_MESSAGES[code])
    }
    expect(Object.keys(OWN_TRANSFER_MESSAGES).sort()).toEqual([...CODES].sort())
  })

  it("words the pair-only codes outside the finance page too", () => {
    for (const code of [
      "GIVE_TRANSACTION_OWN_TRANSFER",
      "GIVE_TRANSACTION_ALREADY_TRANSFERRED",
      "GIVE_OWN_TRANSFER_CAMPAIGN_MISMATCH",
      "GIVE_OWN_TRANSFER_AMOUNT_MISMATCH",
      "GIVE_OWN_TRANSFER_NOT_SWAPPED",
    ]) {
      expect(dbErrorMessage({ code: "23514", message: code }), code).not.toBe(generic)
    }
    // An organizer explaining a paired outgoing leg learns why it is refused.
    expect(dbErrorMessage({ code: "23514", message: "GIVE_TRANSACTION_OWN_TRANSFER" })).toContain("tài khoản mới")
  })
})

describe("explanation correction refusals (DOS/Give#71)", () => {
  // Every code give.correct_inbound_explanation raises (DOS-Me 20261116090000).
  const CODES = [
    "GIVE_NOT_ALLOWED",
    "GIVE_CONTRIBUTION_REQUIRED",
    "GIVE_REASON_REQUIRED",
    "GIVE_REASON_TOO_LONG",
    "GIVE_TRANSACTION_NOT_FOUND",
    "GIVE_TRANSACTION_NOT_INBOUND",
    "GIVE_TRANSACTION_UNATTRIBUTED",
    "GIVE_SELF_REVIEW",
    "GIVE_EXPLANATION_ALREADY_CORRECTED",
    "GIVE_TRANSACTION_NOT_EXPLAINED",
    "GIVE_TRANSACTION_ALREADY_MATCHED",
    "GIVE_LEDGER_POST_MISSING",
    "GIVE_ACCOUNT_OWNER_MISMATCH",
    "GIVE_CONTRIBUTION_CAMPAIGN_MISMATCH",
    "GIVE_CONTRIBUTION_NOT_MATCHABLE",
    // Raised since DOS-Me 20261117090000 for a returned explanation (DOS/Give#196).
    "GIVE_EXPLANATION_RETURNED",
  ]
  const generic = dbErrorMessage(null)

  it("words every code for the admin, never the generic message", () => {
    for (const code of CODES) {
      const message = dbErrorMessage({ code: "23514", message: `${code}: detail` }, CORRECT_EXPLANATION_MESSAGES)
      expect(message, code).not.toBe(generic)
      expect(message, code).toBe(CORRECT_EXPLANATION_MESSAGES[code])
    }
    expect(Object.keys(CORRECT_EXPLANATION_MESSAGES).sort()).toEqual([...CODES].sort())
  })

  it("words self-review and the reason limit for this action, not for account verification", () => {
    expect(dbErrorMessage({ message: "GIVE_SELF_REVIEW" }, CORRECT_EXPLANATION_MESSAGES)).toContain(
      "Nhờ một quản trị viên khác"
    )
    expect(dbErrorMessage({ message: "GIVE_REASON_TOO_LONG" }, CORRECT_EXPLANATION_MESSAGES)).toBe(
      "Lý do tối đa 1000 ký tự."
    )
  })
})

describe("returns of an explanation to unmatched (DOS/Give#196)", () => {
  // Every code give.return_inbound_to_unmatched raises (DOS-Me 20261117090000).
  const CODES = [
    "GIVE_NOT_ALLOWED",
    "GIVE_REASON_REQUIRED",
    "GIVE_REASON_TOO_LONG",
    "GIVE_TRANSACTION_NOT_FOUND",
    "GIVE_TRANSACTION_NOT_INBOUND",
    "GIVE_TRANSACTION_UNATTRIBUTED",
    "GIVE_SELF_REVIEW",
    "GIVE_EXPLANATION_ALREADY_RETURNED",
    "GIVE_EXPLANATION_ALREADY_CORRECTED",
    "GIVE_TRANSACTION_NOT_EXPLAINED",
    "GIVE_TRANSACTION_ALREADY_MATCHED",
    "GIVE_BINDING_RELEASED",
    "GIVE_LEDGER_POST_MISSING",
    "GIVE_ACCOUNT_OWNER_MISMATCH",
  ]
  const generic = dbErrorMessage(null)

  it("words every code for the admin, never the generic message", () => {
    for (const code of CODES) {
      const message = dbErrorMessage({ code: "23514", message: `${code}: detail` }, RETURN_TO_UNMATCHED_MESSAGES)
      expect(message, code).not.toBe(generic)
      expect(message, code).toBe(RETURN_TO_UNMATCHED_MESSAGES[code])
    }
    expect(Object.keys(RETURN_TO_UNMATCHED_MESSAGES).sort()).toEqual([...CODES].sort())
  })

  it("words self-review for the return, not for account verification", () => {
    const message = dbErrorMessage({ message: "GIVE_SELF_REVIEW" }, RETURN_TO_UNMATCHED_MESSAGES)
    expect(message).toContain("đưa được khoản này về chưa khớp")
    expect(message).toContain("Nhờ một quản trị viên khác")
  })

  it("words the codes the changed functions raise on any other path", () => {
    for (const code of ["GIVE_EXPLANATION_RETURNED", "GIVE_EXPLANATION_ALREADY_RETURNED", "GIVE_BINDING_RELEASED"]) {
      expect(dbErrorMessage({ code: "23514", message: code }), code).not.toBe(generic)
    }
    expect(dbErrorMessage({ message: "GIVE_EXPLANATION_RETURNED" })).toContain("không phải tiền ủng hộ")
  })
})

describe("STATEMENT_ROW_MESSAGES (DOS/Give#78)", () => {
  // Every code give.resolve_statement_import_row raises (DOS/DOS.Me
  // 20261116120000), and those of recording an imported row that a stored
  // row can reach (give.record_bank_transaction).
  const CODES = [
    "GIVE_NOT_ALLOWED",
    "GIVE_RESOLUTION_INVALID",
    "GIVE_RESOLUTION_NOTE_REQUIRED",
    "GIVE_IMPORT_ROW_NOT_FOUND",
    "GIVE_IMPORT_ROW_NOT_AMBIGUOUS",
    "GIVE_SELF_REVIEW",
    "GIVE_DUPLICATE_TARGET_INVALID",
    "GIVE_RESOLUTION_CANDIDATE",
    "GIVE_RESOLUTION_NOT_FOR_REASON",
    "GIVE_ROW_HAS_ACTIVE_DUPLICATE",
    "GIVE_TRANSACTION_CONFLICT",
    "GIVE_BINDING_CHANGED",
    "GIVE_ACCOUNT_OWNER_MISMATCH",
  ]

  it("words every refusal of the resolution in Vietnamese", () => {
    for (const code of CODES) {
      const message = dbErrorMessage({ message: `${code}: detail` }, STATEMENT_ROW_MESSAGES)
      expect(message, code).toBe(STATEMENT_ROW_MESSAGES[code])
      expect(message, code).not.toBe("Có lỗi xảy ra. Hãy thử lại sau.")
      expect(message, code).not.toMatch(/GIVE_|[a-z]+_[a-z]+/)
    }
  })

  it("tells staff why their own money is refused and who can resolve it", () => {
    expect(STATEMENT_ROW_MESSAGES.GIVE_SELF_REVIEW).toContain("tài khoản nhận là của bạn")
    expect(STATEMENT_ROW_MESSAGES.GIVE_SELF_REVIEW).toContain("Một nhân viên tài chính khác cần xử lý")
  })
})

describe("campaign reports and moderator queue refusals (DOS/Give#98)", () => {
  const generic = dbErrorMessage(null)

  const REPORT_CODES = [
    "GIVE_NOT_ALLOWED",
    "GIVE_REPORT_REASON_INVALID",
    "GIVE_REPORT_DETAILS_REQUIRED",
    "GIVE_REPORT_DETAILS_TOO_LONG",
    "GIVE_CAMPAIGN_NOT_FOUND",
    "GIVE_REPORT_LIMIT",
  ]

  const MODERATE_CODES = [
    "GIVE_NOT_ADMIN",
    "GIVE_MODERATION_INVALID",
    "GIVE_REASON_REQUIRED",
    "GIVE_REASON_TOO_LONG",
    "GIVE_PUBLIC_NOTE_REQUIRED",
    "GIVE_PUBLIC_NOTE_TOO_LONG",
    "GIVE_CAMPAIGN_NOT_FOUND",
    "GIVE_SELF_REVIEW",
    "GIVE_TRANSITION_NOT_ALLOWED",
    "GIVE_PAYMENT_REQUESTS_NOT_STOPPABLE",
  ]

  it("maps all new campaign report and moderation codes in global GIVE_MESSAGES", () => {
    for (const code of [
      "GIVE_REPORT_REASON_INVALID",
      "GIVE_REPORT_DETAILS_REQUIRED",
      "GIVE_REPORT_DETAILS_TOO_LONG",
      "GIVE_REPORT_LIMIT",
      "GIVE_MODERATION_INVALID",
      "GIVE_REASON_TOO_LONG",
      "GIVE_PUBLIC_NOTE_REQUIRED",
      "GIVE_PUBLIC_NOTE_TOO_LONG",
      "GIVE_PAYMENT_REQUESTS_NOT_STOPPABLE",
    ]) {
      const msg = dbErrorMessage({ code: "23514", message: `${code}: detail` })
      expect(msg, code).not.toBe(generic)
      expect(msg, code).not.toMatch(/GIVE_/)
    }
  })

  it("words every give.report_campaign refusal, including GIVE_NOT_ALLOWED for self-report", () => {
    for (const code of REPORT_CODES) {
      const msg = dbErrorMessage({ code: "42501", message: code }, REPORT_CAMPAIGN_MESSAGES)
      expect(msg, code).toBe(REPORT_CAMPAIGN_MESSAGES[code])
      expect(msg, code).not.toBe(generic)
    }
    expect(Object.keys(REPORT_CAMPAIGN_MESSAGES).sort()).toEqual([...REPORT_CODES].sort())
    expect(dbErrorMessage({ message: "GIVE_NOT_ALLOWED" }, REPORT_CAMPAIGN_MESSAGES)).toBe(
      "Bạn không thể báo cáo chiến dịch của chính mình."
    )
  })

  it("words every give.moderate_campaign_reports refusal, including GIVE_SELF_REVIEW for self-moderation", () => {
    for (const code of MODERATE_CODES) {
      const msg = dbErrorMessage(
        { code: "42501", message: `${code}: closed -> suspended` },
        MODERATE_CAMPAIGN_REPORTS_MESSAGES
      )
      expect(msg, code).toBe(MODERATE_CAMPAIGN_REPORTS_MESSAGES[code])
      expect(msg, code).not.toBe(generic)
    }
    expect(Object.keys(MODERATE_CAMPAIGN_REPORTS_MESSAGES).sort()).toEqual([...MODERATE_CODES].sort())
    expect(dbErrorMessage({ message: "GIVE_SELF_REVIEW" }, MODERATE_CAMPAIGN_REPORTS_MESSAGES)).toContain(
      "chiến dịch do chính bạn tổ chức"
    )
    expect(dbErrorMessage({ message: "GIVE_SELF_REVIEW" }, MODERATE_CAMPAIGN_REPORTS_MESSAGES)).toContain(
      "một kiểm duyệt viên khác"
    )
  })
})

describe("campaign comments and moderation refusals (DOS/Give#250, #262)", () => {
  const generic = dbErrorMessage(null)

  const ALL_18_CODES = [
    "GIVE_NOT_ALLOWED",
    "GIVE_NOT_ADMIN",
    "GIVE_SELF_REVIEW",
    "GIVE_CAMPAIGN_NOT_FOUND",
    "GIVE_COMMENT_NOT_FOUND",
    "GIVE_REPORT_NOT_FOUND",
    "GIVE_COMMENT_BODY_REQUIRED",
    "GIVE_COMMENT_BODY_TOO_LONG",
    "GIVE_COMMENT_NESTING_NOT_ALLOWED",
    "GIVE_COMMENT_HIDDEN",
    "GIVE_REASON_REQUIRED",
    "GIVE_REASON_TOO_LONG",
    "GIVE_MODERATION_INVALID",
    "GIVE_REPORT_REASON_INVALID",
    "GIVE_REPORT_DETAILS_REQUIRED",
    "GIVE_REPORT_DETAILS_TOO_LONG",
    "GIVE_REPORT_LIMIT",
    "GIVE_RATE_LIMITED",
  ] as const

  it("maps every GIVE_* error code in DOS/Give#262 without ever falling back to the generic message", () => {
    for (const code of ALL_18_CODES) {
      const msg = dbErrorMessage({ code: "23514", message: `${code}: detail` })
      expect(msg, code).not.toBe(generic)
      expect(msg, code).not.toMatch(/GIVE_/)
    }
    expect(dbErrorMessage({ code: "PT429", message: "rate limited" })).toContain("quá nhanh")
  })

  it("parses retry-after seconds from GIVE_RATE_LIMITED: <seconds> in commentDbErrorMessage", () => {
    expect(rateLimitSeconds({ message: "GIVE_RATE_LIMITED: 42" })).toBe(42)
    expect(rateLimitSeconds({ message: "GIVE_RATE_LIMITED: 0" })).toBeNull()
    expect(rateLimitSeconds({ message: "GIVE_RATE_LIMITED" })).toBeNull()

    expect(commentDbErrorMessage({ code: "PT429", message: "GIVE_RATE_LIMITED: 35" }, COMMENT_ACTION_MESSAGES)).toBe(
      "Bạn thao tác quá nhanh. Hãy thử lại sau 35 giây."
    )
    expect(commentDbErrorMessage({ code: "PT429", message: "GIVE_RATE_LIMITED: 121" }, COMMENT_ACTION_MESSAGES)).toBe(
      "Bạn thao tác quá nhanh. Hãy thử lại sau khoảng 3 phút."
    )
    expect(commentDbErrorMessage({ code: "PT429", message: "GIVE_RATE_LIMITED" }, COMMENT_ACTION_MESSAGES)).toContain(
      "sau ít phút"
    )
  })

  it("words context-specific overrides cleanly for author actions, organizer hide, report, and staff moderation", () => {
    expect(commentDbErrorMessage({ message: "GIVE_NOT_ALLOWED" }, COMMENT_REPORT_MESSAGES)).toBe(
      "Bạn không thể báo cáo bình luận của chính mình."
    )
    expect(commentDbErrorMessage({ message: "GIVE_NOT_ALLOWED" }, COMMENT_ORGANIZER_HIDE_MESSAGES)).toContain(
      "Chỉ người tổ chức"
    )
    expect(commentDbErrorMessage({ message: "GIVE_SELF_REVIEW" }, COMMENT_MODERATION_MESSAGES)).toContain(
      "một kiểm duyệt viên khác"
    )
    expect(commentDbErrorMessage({ message: "GIVE_COMMENT_NOT_FOUND" }, COMMENT_MODERATION_MESSAGES)).toContain(
      "tác giả có thể đã xóa bình luận này"
    )
    expect(commentDbErrorMessage({ message: "GIVE_COMMENT_NOT_FOUND" }, COMMENT_MODERATION_MESSAGES)).not.toContain(
      "bác bỏ báo cáo"
    )
    expect(commentDbErrorMessage({ message: "GIVE_COMMENT_NOT_FOUND" }, COMMENT_REPORT_RESOLVE_MESSAGES)).toContain(
      "chỉ có thể bác bỏ báo cáo"
    )
  })
})

describe("co-organizer invite and member refusals (DOS/Give#253, #264)", () => {
  const generic = dbErrorMessage(null)

  const ALL_MEMBER_CODES = [
    "GIVE_AUTH_REQUIRED",
    "GIVE_CAMPAIGN_OWNER_ONLY",
    "GIVE_CAMPAIGN_NOT_INVITABLE",
    "GIVE_INVITE_EXPIRY_INVALID",
    "GIVE_INVITE_NOTE_TOO_LONG",
    "GIVE_CAMPAIGN_MEMBER_LIMIT",
    "GIVE_CAMPAIGN_INVITE_LIMIT",
    "GIVE_RATE_LIMITED",
    "GIVE_INVITE_INVALID",
    "GIVE_INVITE_REVOKED",
    "GIVE_INVITE_ALREADY_USED",
    "GIVE_INVITE_ALREADY_ACCEPTED",
    "GIVE_INVITE_EXPIRED",
    "GIVE_ALREADY_CAMPAIGN_OWNER",
    "GIVE_ALREADY_CAMPAIGN_MEMBER",
    "GIVE_CAMPAIGN_MEMBER_NOT_FOUND",
    "GIVE_CAMPAIGN_NOT_EDITABLE",
  ] as const

  it("maps every GIVE_* error code in DOS/Give#264 without falling back to the generic message", () => {
    for (const code of ALL_MEMBER_CODES) {
      const msg = dbErrorMessage({ code: "23514", message: `${code}: detail` })
      expect(msg, code).not.toBe(generic)
      expect(msg, code).not.toMatch(/GIVE_/)
    }
  })

  it("preserves retry-after guidance in campaignMemberDbErrorMessage for GIVE_RATE_LIMITED: <seconds>", () => {
    expect(campaignMemberDbErrorMessage({ code: "PT429", message: "GIVE_RATE_LIMITED: 30" })).toBe(
      "Bạn thao tác quá nhanh. Hãy thử lại sau 30 giây."
    )
    expect(campaignMemberDbErrorMessage({ code: "PT429", message: "GIVE_RATE_LIMITED: 180" })).toBe(
      "Bạn thao tác quá nhanh. Hãy thử lại sau khoảng 3 phút."
    )
    expect(campaignMemberDbErrorMessage({ code: "PT429", message: "GIVE_RATE_LIMITED" })).toBe(
      CAMPAIGN_MEMBER_MESSAGES.GIVE_RATE_LIMITED
    )
  })
})

describe("Early Bird reward tier error codes (DOS/Give#317)", () => {
  const generic = dbErrorMessage(null)

  it.each(["GIVE_REWARD_EXPIRED", "GIVE_REWARD_TIER_DATES_INVALID"] as const)(
    "maps %s cleanly to Vietnamese without leaking raw Postgres errors",
    (code) => {
      const msg = dbErrorMessage({ code: "23514", message: `${code}: internal detail` })
      expect(msg).not.toBe(generic)
      expect(msg).not.toMatch(/GIVE_|internal detail/)
      expect(msg).toContain("Early Bird")
    }
  )
})
