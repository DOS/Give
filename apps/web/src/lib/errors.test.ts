import { describe, expect, it } from "vitest"

import { dbErrorMessage, giveErrorCode } from "./errors"

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

  it("never echoes unknown internals", () => {
    const message = dbErrorMessage({ code: "XX000", message: "internal: relation give.secret" })
    expect(message).not.toContain("give.secret")
    expect(message).toBe("Có lỗi xảy ra. Hãy thử lại sau.")
  })
})
