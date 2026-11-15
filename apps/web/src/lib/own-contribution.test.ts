import { describe, expect, it } from "vitest"

import {
  isOwnContribution,
  normalizeEmail,
  OWN_CONTRIBUTION_MESSAGES,
  OWN_CONTRIBUTION_SCOPE,
} from "./own-contribution"

const ME = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"

describe("own contributions (DOS/Give#199)", () => {
  it("normalizes an email as the database does: trimmed of spaces, tabs and line breaks, lowercased", () => {
    expect(normalizeEmail(" \tMe@Example.VN\r\n")).toBe("me@example.vn")
    expect(normalizeEmail("  ")).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })

  it("is the viewer's when they gave it signed in, or as a guest with their email", () => {
    const viewer = { id: ME, email: "Me@Example.vn" }
    expect(isOwnContribution({ contributor_user_id: ME }, viewer)).toBe(true)
    expect(isOwnContribution({ contributor_user_id: null, guest_email: " me@EXAMPLE.vn " }, viewer)).toBe(true)
    expect(isOwnContribution({ contributor_user_id: OTHER }, viewer)).toBe(false)
    expect(isOwnContribution({ contributor_user_id: null, guest_email: "lan@example.vn" }, viewer)).toBe(false)
    // A signed-in contribution is someone's account, whatever email the viewer has.
    expect(isOwnContribution({ contributor_user_id: OTHER, guest_email: "me@example.vn" }, viewer)).toBe(false)
  })

  it("never takes a contribution for the viewer's when either email is missing", () => {
    expect(isOwnContribution({ contributor_user_id: null, guest_email: null }, { id: ME, email: null })).toBe(false)
    expect(isOwnContribution({ contributor_user_id: null, guest_email: "" }, { id: ME, email: "" })).toBe(false)
    expect(
      isOwnContribution({ contributor_user_id: null, guest_email: "me@example.vn" }, { id: ME, email: null })
    ).toBe(false)
    expect(
      isOwnContribution({ contributor_user_id: null, guest_email: null }, { id: ME, email: "me@example.vn" })
    ).toBe(false)
  })

  it("words the refusal for each action, naming guest contributions and who can still act", () => {
    for (const message of Object.values(OWN_CONTRIBUTION_MESSAGES)) {
      expect(message).toContain(OWN_CONTRIBUTION_SCOPE)
      expect(message).not.toContain("tài khoản nhận của chính mình")
    }
    expect(OWN_CONTRIBUTION_SCOPE).toContain("không đăng nhập nhưng dùng email của bạn")
    // The organizer is told how the money still gets matched.
    expect(OWN_CONTRIBUTION_MESSAGES.matchAsOrganizer).toContain("tự khớp khi nội dung chuyển khoản có đúng mã ủng hộ")
    expect(OWN_CONTRIBUTION_MESSAGES.matchAsOrganizer).toContain("nhân viên tài chính của Give")
    expect(OWN_CONTRIBUTION_MESSAGES.matchAsStaff).toContain("Nhờ một nhân viên tài chính khác")
    expect(OWN_CONTRIBUTION_MESSAGES.correction).toContain("Nhờ một quản trị viên khác")
    expect(OWN_CONTRIBUTION_MESSAGES.refund).toContain("đội ngũ Give")
    expect(OWN_CONTRIBUTION_MESSAGES.returnedRefund).toContain("lại nợ khoản hoàn đó cho bạn")
  })
})
