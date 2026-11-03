import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import type { CampaignStatus } from "./campaigns"
import {
  acceptsPledges,
  canEditTiers,
  canRetireTier,
  deliveryMonthInput,
  deliveryMonthLabel,
  isSoldOut,
  listPublicTiers,
  minAmountLabel,
  moveTier,
  pledgeHref,
  previewTiers,
  quantityLabel,
  remainingSlots,
  sortTiers,
  type RewardTier,
} from "./reward-tiers"
import { rewardTierSchema } from "./validation"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

function tier(fields: Partial<RewardTier> = {}): RewardTier {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    campaign_id: CAMPAIGN,
    title: "Áo thun",
    description: null,
    min_amount: 200_000,
    quantity_limit: null,
    quantity_claimed: 0,
    estimated_delivery: null,
    requires_shipping: false,
    shipping_note: null,
    status: "active",
    sort_order: 1,
    retired_at: null,
    ...fields,
  }
}

const ALL: CampaignStatus[] = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "live",
  "settling",
  "succeeded",
  "failed",
  "closed",
  "suspended",
  "cancelled",
]

describe("editor rules", () => {
  it("edits tiers only while draft or changes_requested", () => {
    expect(ALL.filter(canEditTiers)).toEqual(["draft", "changes_requested"])
  })

  it("retires an unclaimed active tier only after approval and before the end", () => {
    expect(ALL.filter((s) => canRetireTier(s, tier()))).toEqual(["approved", "live", "suspended"])
  })

  it("never retires a tier a pledge holds, or one already retired", () => {
    expect(canRetireTier("live", tier({ quantity_claimed: 1, quantity_limit: 5 }))).toBe(false)
    expect(canRetireTier("live", tier({ status: "retired", retired_at: "2026-11-01T00:00:00Z" }))).toBe(false)
  })

  it("moves a tier one place and refuses moves off either end", () => {
    expect(moveTier(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"])
    expect(moveTier(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"])
    expect(moveTier(["a", "b", "c"], "a", "up")).toBeNull()
    expect(moveTier(["a", "b", "c"], "c", "down")).toBeNull()
    expect(moveTier(["a", "b"], "x", "up")).toBeNull()
  })

  it("orders tiers by sort_order, then id", () => {
    const a = tier({ id: "b", sort_order: 2 })
    const b = tier({ id: "a", sort_order: 2 })
    const c = tier({ id: "c", sort_order: 1 })
    expect(sortTiers([a, b, c]).map((t) => t.id)).toEqual(["c", "a", "b"])
  })
})

describe("tier display", () => {
  it("labels slots left, sold out and unlimited", () => {
    expect(quantityLabel(tier({ quantity_limit: 10, quantity_claimed: 7 }))).toBe("Còn 3/10 suất")
    expect(quantityLabel(tier({ quantity_limit: 10, quantity_claimed: 10 }))).toBe("Hết suất")
    expect(quantityLabel(tier())).toBe("Không giới hạn số suất")
    expect(remainingSlots(tier())).toBeNull()
    expect(isSoldOut(tier({ quantity_limit: 1, quantity_claimed: 1 }))).toBe(true)
    expect(isSoldOut(tier())).toBe(false)
  })

  it("shows the delivery month and round-trips it through the month input", () => {
    expect(deliveryMonthLabel("2027-03-01")).toBe("Tháng 3/2027")
    expect(deliveryMonthLabel(null)).toBeNull()
    expect(deliveryMonthInput("2027-03-01")).toBe("2027-03")
    expect(deliveryMonthInput(null)).toBe("")
  })

  it("formats the minimum and links the pledge flow with the tier", () => {
    expect(minAmountLabel(200_000)).toMatch(/^Từ 200\.000/)
    expect(pledgeHref("ao-thun-abcde", "a0000000-0000-4000-8000-000000000001")).toBe(
      "/campaigns/ao-thun-abcde/pledge?tier=a0000000-0000-4000-8000-000000000001"
    )
  })

  it("takes pledges only on a live back campaign before its end", () => {
    const now = new Date("2026-11-10T00:00:00Z")
    const live = { type: "back", status: "live" as const, ends_at: "2026-12-01T00:00:00Z" }
    expect(acceptsPledges(live, now)).toBe(true)
    expect(acceptsPledges({ ...live, ends_at: "2026-11-09T00:00:00Z" }, now)).toBe(false)
    expect(acceptsPledges({ ...live, status: "succeeded" }, now)).toBe(false)
    expect(acceptsPledges({ ...live, type: "give" }, now)).toBe(false)
  })
})

describe("public tier list", () => {
  it("reads active tiers of one campaign from the public view, in order", async () => {
    const calls: Call[] = []
    const rows = [{ id: "t1", quantity_remaining: 3 }]
    const db = fakeDb(() => ({ data: rows }), calls)
    expect(await listPublicTiers(db as never, CAMPAIGN)).toEqual(rows)
    expect(calls[0].target).toBe("public_reward_tiers")
    expect(op(calls[0], "eq")).toEqual(["campaign_id", CAMPAIGN])
    expect(op(calls[0], "select")?.[0]).toContain("quantity_remaining")
    expect(calls[0].ops.filter(([n]) => n === "order").map(([, c]) => c)).toEqual(["sort_order", "id"])
  })

  it("throws a failed read so the page can hide the tiers", async () => {
    const db = fakeDb(() => ({ error: { message: "boom" } }))
    await expect(listPublicTiers(db as never, CAMPAIGN)).rejects.toEqual({ message: "boom" })
  })

  it("previews only active tiers, ordered, with the slots left", () => {
    const preview = previewTiers([
      tier({ id: "b", sort_order: 2, quantity_limit: 5, quantity_claimed: 2 }),
      tier({ id: "r", sort_order: 0, status: "retired", retired_at: "2026-11-01T00:00:00Z" }),
      tier({ id: "a", sort_order: 1 }),
    ])
    expect(preview.map((t) => [t.id, t.quantity_remaining])).toEqual([
      ["a", null],
      ["b", 3],
    ])
    expect(preview[0]).not.toHaveProperty("status")
  })
})

describe("rewardTierSchema", () => {
  const base = {
    title: " Áo thun ",
    min_amount: "200.000",
    description: "",
    quantity_limit: "",
    estimated_delivery: "",
    requires_shipping: "",
    shipping_note: "",
  }

  it("reads an unlimited tier without delivery or shipping", () => {
    expect(rewardTierSchema.parse(base)).toEqual({
      title: "Áo thun",
      min_amount: 200_000,
      description: null,
      quantity_limit: null,
      estimated_delivery: null,
      requires_shipping: false,
      shipping_note: null,
    })
  })

  it("keeps the month as its first day, a slot limit and shipping", () => {
    expect(
      rewardTierSchema.parse({
        ...base,
        quantity_limit: "1.000",
        estimated_delivery: "2027-03",
        requires_shipping: "on",
        shipping_note: "Chỉ giao trong Việt Nam",
      })
    ).toMatchObject({
      quantity_limit: 1000,
      estimated_delivery: "2027-03-01",
      requires_shipping: true,
      shipping_note: "Chỉ giao trong Việt Nam",
    })
  })

  it.each([
    ["a one-letter title", { title: "A" }, "Tên phần thưởng"],
    ["a bad amount", { min_amount: "1,5" }, "Số tiền"],
    ["zero slots", { quantity_limit: "0" }, "Số suất"],
    ["too many slots", { quantity_limit: "1000001" }, "Số suất"],
    ["a fractional slot count", { quantity_limit: "2.5" }, "Số suất"],
    ["month 13", { estimated_delivery: "2027-13" }, "Tháng giao quà"],
    ["a full date", { estimated_delivery: "2027-03-15" }, "Tháng giao quà"],
  ])("refuses %s", (_label, fields, message) => {
    const result = rewardTierSchema.safeParse({ ...base, ...fields })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain(message)
  })
})
