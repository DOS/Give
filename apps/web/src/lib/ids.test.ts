import { describe, expect, it } from "vitest"

import { isUuid } from "./ids"

describe("isUuid", () => {
  it("accepts canonical UUIDs only", () => {
    expect(isUuid("2f1c4a8e-9b3d-4c2a-8e1f-0a1b2c3d4e5f")).toBe(true)
    expect(isUuid("2F1C4A8E-9B3D-4C2A-8E1F-0A1B2C3D4E5F")).toBe(true)
    for (const value of [
      "",
      "123",
      "2f1c4a8e9b3d4c2a8e1f0a1b2c3d4e5f",
      "2f1c4a8e-9b3d-4c2a-8e1f-0a1b2c3d4e5f,x",
      null,
      7,
    ]) {
      expect(isUuid(value), String(value)).toBe(false)
    }
  })
})
