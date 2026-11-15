import { describe, expect, it } from "vitest"

import {
  CORRECT_EXPLANATION_MESSAGES,
  dbErrorMessage,
  giveErrorCode,
  OPEN_MESSAGES,
  OWN_TRANSFER_MESSAGES,
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
      "Tài khoản nhận không thuộc về người tổ chức của chiến dịch đang gắn, nên giao dịch này không xử lý được cho chiến dịch đó. Hãy báo đội ngũ Give kiểm tra lại tài khoản nhận và chiến dịch."
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
