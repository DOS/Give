import { describe, expect, it } from "vitest"

import { donationSchema, isStatusToken, MAX_DONATION, qrExpiresAt } from "./contributions"

function parse(overrides: Partial<Record<"amount" | "anonymous" | "public_name" | "message", string>> = {}) {
  return donationSchema.safeParse({ amount: "200.000", anonymous: "", public_name: "Lan", message: "", ...overrides })
}

describe("donationSchema", () => {
  it("parses a named donation", () => {
    expect(parse({ message: "  Chúc em mau khỏe  " })).toMatchObject({
      success: true,
      data: { amount: 200000, anonymous: false, public_name: "Lan", message: "Chúc em mau khỏe" },
    })
  })

  it("drops the name of an anonymous donor", () => {
    expect(parse({ anonymous: "on" })).toMatchObject({
      success: true,
      data: { anonymous: true, public_name: null, message: null },
    })
  })

  it("needs a name or the anonymous choice", () => {
    const result = parse({ public_name: "   " })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe("Nhập tên hiển thị, hoặc chọn ủng hộ ẩn danh")
  })

  it.each(["", "0", "-5", "1,5", "abc", String(MAX_DONATION + 1)])("rejects the amount %j", (amount) => {
    expect(parse({ amount }).success).toBe(false)
  })

  it("accepts the largest amount the database and VietQR allow", () => {
    expect(parse({ amount: String(MAX_DONATION) })).toMatchObject({ success: true, data: { amount: MAX_DONATION } })
  })

  it("caps the name and the message", () => {
    expect(parse({ public_name: "a".repeat(81) }).success).toBe(false)
    expect(parse({ message: "a".repeat(501) }).success).toBe(false)
  })
})

describe("isStatusToken", () => {
  it("accepts 64 lowercase hex characters only", () => {
    expect(isStatusToken("0123456789abcdef".repeat(4))).toBe(true)
    expect(isStatusToken("0123456789ABCDEF".repeat(4))).toBe(false)
    expect(isStatusToken("a".repeat(63))).toBe(false)
    expect(isStatusToken(undefined)).toBe(false)
  })
})

describe("qrExpiresAt", () => {
  it("is 24 hours after the donation was created", () => {
    expect(qrExpiresAt("2026-11-01T00:00:00.000Z").toISOString()).toBe("2026-11-02T00:00:00.000Z")
  })
})
