import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  canUpdateFulfillment,
  countByStatus,
  fulfillmentHref,
  fulfillmentLabel,
  listFulfillmentPledges,
  parseFulfillmentFilters,
  shippingLines,
} from "./fulfillment"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TIER = "a0000000-0000-4000-8000-000000000001"

describe("fulfillment rules", () => {
  it("only a succeeded back campaign reports delivery", () => {
    expect(canUpdateFulfillment({ type: "back", status: "succeeded" })).toBe(true)
    expect(canUpdateFulfillment({ type: "back", status: "live" })).toBe(false)
    expect(canUpdateFulfillment({ type: "give", status: "succeeded" })).toBe(false)
  })

  it("labels every status and the unreported one", () => {
    expect(fulfillmentLabel("shipped")).toBe("Đã gửi đi")
    expect(fulfillmentLabel("issue")).toBe("Có vấn đề")
    expect(fulfillmentLabel(null)).toBe("Chưa cập nhật")
    expect(fulfillmentLabel("weird")).toBe("Chưa cập nhật")
  })

  it("keeps only known filters and parses 1-based page numbers", () => {
    expect(parseFulfillmentFilters({ tier: TIER, status: "delivered" })).toEqual({
      tier: TIER,
      status: "delivered",
      page: 1,
    })
    expect(parseFulfillmentFilters({ tier: "none", status: "none", page: "2" })).toEqual({
      tier: "none",
      status: "none",
      page: 2,
    })
    expect(parseFulfillmentFilters({ page: ["3", "5"] })).toEqual({ tier: null, status: null, page: 3 })
    expect(parseFulfillmentFilters({ tier: "x'or", status: ["lost"], page: "0" })).toEqual({
      tier: null,
      status: null,
      page: 1,
    })
    expect(parseFulfillmentFilters({ page: "-2" }).page).toBe(1)
    expect(parseFulfillmentFilters({ page: "1.5" }).page).toBe(1)
    expect(parseFulfillmentFilters({ page: "999999" }).page).toBe(10_000)
  })

  it("builds filter-preserving fulfillment URLs and omits default page 1", () => {
    expect(fulfillmentHref(CAMPAIGN)).toBe(`/me/campaigns/${CAMPAIGN}/fulfillment`)
    expect(fulfillmentHref(CAMPAIGN, { tier: null, status: null, page: 1 })).toBe(
      `/me/campaigns/${CAMPAIGN}/fulfillment`
    )
    expect(fulfillmentHref(CAMPAIGN, { page: 2 })).toBe(`/me/campaigns/${CAMPAIGN}/fulfillment?page=2`)
    expect(fulfillmentHref(CAMPAIGN, { tier: TIER, status: "shipped", page: 1 })).toBe(
      `/me/campaigns/${CAMPAIGN}/fulfillment?tier=${TIER}&status=shipped`
    )
    expect(fulfillmentHref(CAMPAIGN, { tier: TIER, status: "shipped", page: 2 })).toBe(
      `/me/campaigns/${CAMPAIGN}/fulfillment?tier=${TIER}&status=shipped&page=2`
    )
  })

  it("shows the text values of a shipping address and counts statuses", () => {
    expect(shippingLines({ name: " Lan ", phone: "0901", line: "", extra: { a: 1 }, zip: 700000 })).toEqual([
      "Số điện thoại: 0901",
      "Lan",
      "700000",
    ])
    expect(shippingLines({ address: "12 Lý Thường Kiệt", recipient: "Lê Lan", phone: "0901 234 567" })).toEqual([
      "Người nhận: Lê Lan",
      "Số điện thoại: 0901 234 567",
      "Địa chỉ: 12 Lý Thường Kiệt",
    ])
    expect(shippingLines(null)).toEqual([])
    expect(
      countByStatus([
        { fulfillment_status: null },
        { fulfillment_status: "shipped" },
        { fulfillment_status: "shipped" },
      ])
    ).toMatchObject({ none: 1, shipped: 2, delivered: 0 })
  })
})

describe("listFulfillmentPledges", () => {
  it("reads paid pledges of the campaign on page 1 using .range(0, 499)", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [{ id: "p1" }], count: 3 }), calls)
    const result = await listFulfillmentPledges(db as never, CAMPAIGN, { tier: TIER, status: "none", page: 1 })
    expect(result).toEqual({ pledges: [{ id: "p1" }], total: 3 })
    const eqs = calls[0].ops.filter(([n]) => n === "eq").map(([, ...a]) => a)
    expect(eqs).toEqual([
      ["campaign_id", CAMPAIGN],
      ["kind", "pledge"],
      ["status", "paid"],
      ["reward_tier_id", TIER],
    ])
    expect(op(calls[0], "is")).toEqual(["fulfillment_status", null])
    expect(op(calls[0], "range")).toEqual([0, 499])
    expect(op(calls[0], "limit")).toBeUndefined()
  })

  it("paginates rows beyond 500 via 1-based page .range(500, 999)", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [{ id: "p501" }], count: 620 }), calls)
    const result = await listFulfillmentPledges(db as never, CAMPAIGN, {
      tier: null,
      status: "shipped",
      page: 2,
    })
    expect(result).toEqual({ pledges: [{ id: "p501" }], total: 620 })
    expect(op(calls[0], "range")).toEqual([500, 999])
  })

  it("recovers cleanly from PostgREST PGRST103 out-of-range responses with a head count", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      (call) =>
        op(call, "range")
          ? { error: { code: "PGRST103", message: "Requested range not satisfiable" } }
          : { count: 500 },
      calls
    )
    const result = await listFulfillmentPledges(db as never, CAMPAIGN, { tier: null, status: "none", page: 2 })
    expect(result).toEqual({ pledges: [], total: 500 })
    expect(calls).toHaveLength(2)
    expect(op(calls[1], "select")).toEqual(["id", { count: "exact", head: true }])
  })

  it("filters pledges without a reward", async () => {
    const calls: Call[] = []
    await listFulfillmentPledges(fakeDb(() => ({ data: [] }), calls) as never, CAMPAIGN, {
      tier: "none",
      status: null,
      page: 1,
    })
    expect(op(calls[0], "is")).toEqual(["reward_tier_id", null])
  })
})
