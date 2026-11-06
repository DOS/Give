import { describe, expect, it } from "vitest"

import { safeReturnPath } from "./return-path"

describe("safeReturnPath", () => {
  it("keeps same-site paths and their query", () => {
    expect(safeReturnPath("/me/campaigns")).toBe("/me/campaigns")
    expect(safeReturnPath("/campaigns?type=give")).toBe("/campaigns?type=give")
  })

  it("rejects other origins and tricks", () => {
    for (const value of [
      null,
      "",
      "https://evil.example/",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "/ok\u0000",
      "/auth/login",
      "/auth/callback?code=x",
    ]) {
      expect(safeReturnPath(value), String(value)).toBe("/")
    }
  })
})
