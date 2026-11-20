import { describe, expect, it } from "vitest"

import {
  periodEnd,
  periodLabel,
  planDonationPayable,
  planEndedReasonLabel,
  planQrUntil,
  planSignupSchema,
  planStopOneClickPath,
  planStopPath,
  planUpdateSchema,
} from "./plans"

const live = { status: "live", ends_at: "2026-12-20T00:00:00Z" }

describe("plan periods", () => {
  it("labels a period and finds the end of its month in Vietnam time", () => {
    expect(periodLabel("2026-11-01")).toBe("11/2026")
    expect(periodEnd("2026-11-01")?.toISOString()).toBe("2026-11-30T17:00:00.000Z")
    expect(periodEnd("2026-12-01")?.toISOString()).toBe("2026-12-31T17:00:00.000Z")
    expect(periodEnd("2026-11-05")).toBeNull()
  })

  it("shows the QR only while awaiting, live, before ends_at and inside the month", () => {
    const d = { status: "awaiting_transfer", plan_period: "2026-11-01", campaign: live }
    expect(planDonationPayable(d, new Date("2026-11-30T16:59:00Z"))).toBe(true)
    // 1 December 00:00 in Vietnam: the month is over.
    expect(planDonationPayable(d, new Date("2026-11-30T17:00:00Z"))).toBe(false)
    expect(planDonationPayable({ ...d, status: "received" }, new Date("2026-11-20T00:00:00Z"))).toBe(false)
    expect(
      planDonationPayable({ ...d, campaign: { ...live, status: "suspended" } }, new Date("2026-11-20T00:00:00Z"))
    ).toBe(false)
    expect(
      planDonationPayable(
        { ...d, campaign: { ...live, ends_at: "2026-11-10T00:00:00Z" } },
        new Date("2026-11-20T00:00:00Z")
      )
    ).toBe(false)
    expect(planDonationPayable({ ...d, plan_period: null }, new Date("2026-11-20T00:00:00Z"))).toBe(false)
    // Without an account the money can reach, no QR; unknown counts as usable here (the payment page checks).
    expect(
      planDonationPayable({ ...d, campaign: { ...live, usable_account: false } }, new Date("2026-11-20T00:00:00Z"))
    ).toBe(false)
    expect(
      planDonationPayable({ ...d, campaign: { ...live, usable_account: true } }, new Date("2026-11-20T00:00:00Z"))
    ).toBe(true)
  })

  it("ends the QR at the month's end or the campaign's end, whichever is first", () => {
    expect(planQrUntil("2026-11-01", live.ends_at)?.toISOString()).toBe("2026-11-30T17:00:00.000Z")
    expect(planQrUntil("2026-12-01", live.ends_at)?.toISOString()).toBe("2026-12-20T00:00:00.000Z")
  })
})

describe("plan forms", () => {
  const signup = {
    amount: "200.000",
    day_of_month: "5",
    anonymous: "",
    public_name: " Lan ",
    message: "",
    consent: "on",
  }

  it("accepts a signup and needs consent, a day of 1-28 and the technical floor", () => {
    expect(planSignupSchema.parse(signup)).toEqual({
      amount: 200000,
      day_of_month: 5,
      anonymous: false,
      public_name: "Lan",
      message: null,
      consent: "on",
    })
    expect(planSignupSchema.safeParse({ ...signup, consent: "" }).success).toBe(false)
    expect(planSignupSchema.safeParse({ ...signup, day_of_month: "29" }).success).toBe(false)
    expect(planSignupSchema.safeParse({ ...signup, day_of_month: "0" }).success).toBe(false)
    expect(planSignupSchema.safeParse({ ...signup, amount: "9.000" }).success).toBe(false)
    expect(planSignupSchema.safeParse({ ...signup, public_name: "" }).success).toBe(false)
    expect(planSignupSchema.parse({ ...signup, anonymous: "on" }).public_name).toBeNull()
  })

  it("validates a change of amount and day", () => {
    expect(planUpdateSchema.parse({ amount: "50000", day_of_month: "28" })).toEqual({ amount: 50000, day_of_month: 28 })
    expect(planUpdateSchema.safeParse({ amount: "abc", day_of_month: "1" }).success).toBe(false)
  })
})

describe("plan labels and links", () => {
  it("words why a plan ended", () => {
    expect(planEndedReasonLabel("organizer_disabled")).toBe("Người tổ chức đã tắt ủng hộ hằng tháng")
    expect(planEndedReasonLabel("whatever")).toBe("Kế hoạch đã dừng")
  })

  it("builds the stop page and one-click paths", () => {
    expect(planStopPath("a.b")).toBe("/plans/stop?t=a.b")
    expect(planStopOneClickPath("a.b")).toBe("/api/plans/stop?t=a.b")
  })
})
