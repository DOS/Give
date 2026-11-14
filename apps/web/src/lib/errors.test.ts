import { describe, expect, it } from "vitest"

import { dbErrorMessage, giveErrorCode, OPEN_MESSAGES, REVIEW_MESSAGES, SUBMIT_MESSAGES } from "./errors"

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
