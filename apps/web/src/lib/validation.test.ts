import { describe, expect, it } from "vitest"

import { campaignContentSchema, formFields, newCampaignSchema, organizerSchema } from "./validation"

const content = (overrides: Record<string, string> = {}) => ({
  title: "Xây trường cho trẻ em",
  summary: "",
  story: "",
  category_id: "",
  beneficiary_name: "",
  beneficiary_relation: "",
  goal_amount: "50.000.000",
  min_contribution: "10.000",
  stretch_goal_amount: "",
  starts_at: "",
  ends_at: "",
  payment_window_days: "",
  ...overrides,
})

describe("organizerSchema", () => {
  it("normalizes the phone number and empty values", () => {
    const parsed = organizerSchema.parse({
      kind: "individual",
      legal_name: " Nguyễn Văn A ",
      display_name: "Anh A",
      phone: "090 123.45-67",
    })
    expect(parsed).toEqual({
      kind: "individual",
      legal_name: "Nguyễn Văn A",
      display_name: "Anh A",
      phone: "0901234567",
    })
    expect(organizerSchema.parse({ ...parsed, phone: "" }).phone).toBeNull()
  })

  it("rejects a malformed phone number", () => {
    expect(
      organizerSchema.safeParse({ kind: "individual", legal_name: "AB", display_name: "AB", phone: "12" }).success
    ).toBe(false)
  })
})

describe("newCampaignSchema", () => {
  it("parses the type, title and goal", () => {
    expect(newCampaignSchema.parse({ type: "back", title: "Máy in 3D mini", goal_amount: "200.000.000" })).toEqual({
      type: "back",
      title: "Máy in 3D mini",
      goal_amount: 200_000_000,
    })
  })

  it("rejects goals below the default minimum contribution", () => {
    expect(newCampaignSchema.safeParse({ type: "give", title: "Quỹ nhỏ", goal_amount: "5000" }).success).toBe(false)
  })
})

describe("campaignContentSchema", () => {
  it("turns blanks into nulls and reads Vietnam local time", () => {
    const parsed = campaignContentSchema.parse(content({ ends_at: "2026-12-01T09:00" }))
    expect(parsed.summary).toBeNull()
    expect(parsed.category_id).toBeNull()
    expect(parsed.goal_amount).toBe(50_000_000)
    expect(parsed.ends_at).toBe("2026-12-01T02:00:00.000Z")
    expect(parsed.payment_window_days).toBe(7)
  })

  it("enforces the table's cross-field checks", () => {
    expect(campaignContentSchema.safeParse(content({ min_contribution: "60.000.000" })).success).toBe(false)
    expect(campaignContentSchema.safeParse(content({ stretch_goal_amount: "40.000.000" })).success).toBe(false)
    expect(
      campaignContentSchema.safeParse(content({ starts_at: "2026-12-02T09:00", ends_at: "2026-12-01T09:00" })).success
    ).toBe(false)
  })

  it("rejects impossible dates instead of throwing or rolling over", () => {
    expect(campaignContentSchema.safeParse(content({ ends_at: "2026-13-01T09:00" })).success).toBe(false)
    expect(campaignContentSchema.safeParse(content({ ends_at: "2026-02-31T09:00" })).success).toBe(false)
    expect(campaignContentSchema.safeParse(content({ ends_at: "2026-02-28T25:00" })).success).toBe(false)
  })

  it("applies the same minimum goal as new campaigns", () => {
    expect(campaignContentSchema.safeParse(content({ goal_amount: "1.000", min_contribution: "1.000" })).success).toBe(
      false
    )
  })

  it("rejects a bad category id and payment window", () => {
    expect(campaignContentSchema.safeParse(content({ category_id: "not-a-uuid" })).success).toBe(false)
    expect(campaignContentSchema.safeParse(content({ payment_window_days: "31" })).success).toBe(false)
  })
})

describe("formFields", () => {
  it("reads the listed keys as strings, missing ones as empty", () => {
    const form = new FormData()
    form.set("title", "Hello")
    expect(formFields(form, ["title", "summary"])).toEqual({ title: "Hello", summary: "" })
  })
})
