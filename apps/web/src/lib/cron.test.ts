import { describe, expect, it } from "vitest"

import { isAuthorizedCron } from "./cron"

const SECRET = "0123456789abcdef0123"

describe("isAuthorizedCron", () => {
  it("accepts the exact bearer header", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true)
  })

  it("rejects a missing or different header", () => {
    expect(isAuthorizedCron(null, SECRET)).toBe(false)
    expect(isAuthorizedCron(SECRET, SECRET)).toBe(false)
    expect(isAuthorizedCron(`Bearer ${SECRET}x`, SECRET)).toBe(false)
    expect(isAuthorizedCron("Bearer ", SECRET)).toBe(false)
  })

  it("fails closed without a usable secret", () => {
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false)
    expect(isAuthorizedCron("Bearer ", "")).toBe(false)
    expect(isAuthorizedCron("Bearer short", "short")).toBe(false)
  })
})
