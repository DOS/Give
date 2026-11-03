import { describe, expect, it } from "vitest"

import { formatVnd } from "./format"
import {
  acceptsPledges,
  awaitsPayment,
  deliveryMonth,
  fulfillmentLabel,
  isSoldOut,
  NO_REWARD,
  overpaid,
  paymentWindowClosed,
  pledgeErrorMessage,
  pledgeSchema,
  pledgeStatusLabel,
  readShippingAddress,
  shippingAddressSchema,
  withoutReplacedPledges,
} from "./pledges"

const TIER = "44444444-4444-4444-8444-444444444444"

function input(values: Record<string, string> = {}) {
  return { tier: TIER, amount: "300.000", anonymous: "", public_name: "Lan", message: "", ...values }
}

describe("pledgeSchema", () => {
  it("reads a tier, the amount in đồng and the display choices", () => {
    expect(pledgeSchema.parse(input({ tier: TIER.toUpperCase(), message: "  Cố lên  " }))).toEqual({
      tier: TIER,
      amount: 300_000,
      anonymous: false,
      public_name: "Lan",
      message: "Cố lên",
    })
  })

  it("reads 'no reward' as no tier", () => {
    expect(pledgeSchema.parse(input({ tier: NO_REWARD })).tier).toBeNull()
  })

  it("stores no name for an anonymous backer and requires one otherwise", () => {
    expect(pledgeSchema.parse(input({ anonymous: "on" })).public_name).toBeNull()
    const missing = pledgeSchema.safeParse(input({ public_name: " " }))
    expect(missing.success).toBe(false)
    expect(missing.error?.issues[0]?.message).toBe("Nhập tên hiển thị, hoặc chọn ủng hộ ẩn danh")
  })

  it.each([
    ["no tier chosen", { tier: "" }, "Hãy chọn một phần quà"],
    ["a tier that is not an id", { tier: "1; drop" }, "Hãy chọn một phần quà"],
    ["a decimal amount", { amount: "1,5" }, "Số tiền không hợp lệ"],
    ["a zero amount", { amount: "0" }, "Số tiền không hợp lệ"],
    ["an amount past 13 digits", { amount: "10000000000000" }, "Số tiền không hợp lệ"],
    ["a long message", { message: "x".repeat(501) }, "Lời nhắn tối đa 500 ký tự"],
  ])("refuses %s", (_name, values, message) => {
    const parsed = pledgeSchema.safeParse(input(values))
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toBe(message)
  })
})

describe("shipping address", () => {
  const address = { recipient: "Nguyễn Lan", phone: "0901 234 567", address: "12 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội" }

  it("accepts a name, a phone number and an address", () => {
    expect(shippingAddressSchema.parse({ ...address, recipient: " Nguyễn Lan " })).toEqual(address)
    expect(shippingAddressSchema.safeParse({ ...address, phone: "+84 90 123 4567" }).success).toBe(true)
  })

  it.each([
    ["a missing name", { recipient: "" }],
    ["letters in the phone", { phone: "090abc4567" }],
    ["a short phone", { phone: "0901" }],
    ["a short address", { address: "Hà Nội" }],
    ["a long address", { address: "x".repeat(301) }],
  ])("refuses %s", (_name, values) => {
    expect(shippingAddressSchema.safeParse({ ...address, ...values }).success).toBe(false)
  })

  it("reads back only an address of the shape the form writes", () => {
    expect(readShippingAddress(address)).toEqual(address)
    expect(readShippingAddress({ line: "x" })).toBeNull()
    expect(readShippingAddress(null)).toBeNull()
  })
})

describe("acceptsPledges", () => {
  const now = new Date("2026-11-03T00:00:00Z")
  const live = { type: "back", status: "live", starts_at: "2026-11-01T00:00:00Z", ends_at: "2026-11-10T00:00:00Z" }

  it("accepts a live back campaign inside its dates", () => {
    expect(acceptsPledges(live, now)).toBe(true)
    expect(acceptsPledges({ ...live, starts_at: null }, now)).toBe(true)
  })

  it.each([
    ["a give campaign", { type: "give" }],
    ["a campaign that is not live", { status: "succeeded" }],
    ["a campaign that has not started", { starts_at: "2026-11-04T00:00:00Z" }],
    ["a campaign past ends_at", { ends_at: "2026-11-03T00:00:00Z" }],
    ["a campaign with no end", { ends_at: null }],
  ])("refuses %s", (_name, values) => {
    expect(acceptsPledges({ ...live, ...values }, now)).toBe(false)
  })
})

describe("labels", () => {
  it("names every pledge status and passes unknown ones through", () => {
    expect(pledgeStatusLabel("payment_due")).toBe("Chờ thanh toán")
    expect(pledgeStatusLabel("refund_due")).toBe("Chờ hoàn tiền")
    expect(pledgeStatusLabel("new_status")).toBe("new_status")
    expect(awaitsPayment("partially_paid")).toBe(true)
    expect(awaitsPayment("paid")).toBe(false)
  })

  it("names fulfillment and delivery months", () => {
    expect(fulfillmentLabel("shipped")).toBe("Đã gửi đi")
    expect(fulfillmentLabel(null)).toBe("Chưa cập nhật")
    expect(deliveryMonth("2027-03-01")).toBe("Tháng 3/2027")
    expect(deliveryMonth(null)).toBeNull()
    expect(isSoldOut({ quantity_remaining: 0 })).toBe(true)
    expect(isSoldOut({ quantity_remaining: null })).toBe(false)
  })
})

describe("payment helpers", () => {
  it("counts what a paid pledge received beyond its amount", () => {
    expect(overpaid({ status: "paid", intended_amount: 200_000, received_amount: 250_000 })).toBe(50_000)
    expect(overpaid({ status: "paid", intended_amount: 200_000, received_amount: 200_000 })).toBe(0)
    expect(overpaid({ status: "refund_due", intended_amount: 200_000, received_amount: 250_000 })).toBe(0)
  })

  it("closes the payment window at payment_due_at, before the lapse job runs", () => {
    const now = new Date("2026-11-10T00:00:00Z")
    expect(paymentWindowClosed({ status: "payment_due", payment_due_at: "2026-11-09T23:00:00Z" }, now)).toBe(true)
    expect(paymentWindowClosed({ status: "partially_paid", payment_due_at: "2026-11-10T01:00:00Z" }, now)).toBe(false)
    expect(paymentWindowClosed({ status: "paid", payment_due_at: "2026-11-09T23:00:00Z" }, now)).toBe(false)
  })
})

describe("pledgeErrorMessage", () => {
  it("names the minimum the database gives", () => {
    expect(pledgeErrorMessage({ message: "GIVE_AMOUNT_BELOW_MINIMUM: 250000" })).toBe(
      `Số tiền tối thiểu cho lựa chọn này là ${formatVnd(250_000)}.`
    )
  })

  it("turns the rate limit wait into minutes", () => {
    expect(pledgeErrorMessage({ code: "PT429", message: "GIVE_RATE_LIMITED: 61" })).toContain("khoảng 2 phút")
    expect(pledgeErrorMessage({ message: "GIVE_RATE_LIMITED" })).toContain("khoảng 10 phút")
  })

  it("words the pledge codes and leaves the rest to dbErrorMessage", () => {
    expect(pledgeErrorMessage({ message: "GIVE_REWARD_TIER_SOLD_OUT" })).toContain("hết suất")
    expect(pledgeErrorMessage({ message: "GIVE_OWN_CAMPAIGN" })).toBe("Bạn không thể ủng hộ dự án của chính mình.")
    expect(pledgeErrorMessage({ message: "GIVE_PLEDGE_NOT_CHANGEABLE: payment_due" })).toContain("không còn đổi được")
    expect(pledgeErrorMessage({ code: "57014", message: "timeout" })).toBeNull()
  })
})

describe("withoutReplacedPledges", () => {
  const row = (id: string, kind: string, campaign_id: string, status: string) => ({
    id,
    kind,
    campaign_id,
    status,
    created_at: "2026-11-03T00:00:00Z",
  })

  it("hides a cancelled pledge that a newer pledge on the same campaign replaced", () => {
    const rows = [
      row("new", "pledge", "a", "pledged"),
      row("old", "pledge", "a", "cancelled"),
      row("older", "pledge", "a", "cancelled"),
      row("alone", "pledge", "b", "cancelled"),
      row("donation", "donation", "c", "expired"),
    ]
    expect(withoutReplacedPledges(rows).map((r) => r.id)).toEqual(["new", "alone", "donation"])
  })

  it("keeps the newest cancelled pledge of a campaign and hides older ones before a new pledge", () => {
    const rows = [row("again", "pledge", "a", "pledged"), row("self", "pledge", "a", "cancelled")]
    expect(withoutReplacedPledges(rows).map((r) => r.id)).toEqual(["again"])
    expect(withoutReplacedPledges([row("self", "pledge", "a", "cancelled")]).map((r) => r.id)).toEqual(["self"])
  })
})
