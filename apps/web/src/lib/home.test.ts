import { describe, expect, it } from "vitest"

import type { PublicCampaign } from "@/lib/campaigns"
import { homeSections } from "@/lib/home"
import type { MoneyTotals } from "@/lib/statement"

const campaign = (id: string, type: "give" | "back", goal = 100) => ({ id, type, goal_amount: goal }) as PublicCampaign
const totals = (id: string, type: "give" | "back", amount: number) =>
  [
    id,
    { campaign_id: id, type, paid_amount: amount, other_in_amount: 0, pledged_amount: amount } as MoneyTotals,
  ] as const

describe("homeSections", () => {
  it("features the give campaign that raised most and ranks the rest by progress", () => {
    const list = [campaign("g1", "give"), campaign("b1", "back"), campaign("g2", "give"), campaign("b2", "back", 10)]
    const map = new Map([
      totals("g1", "give", 10),
      totals("g2", "give", 60),
      totals("b1", "back", 50),
      totals("b2", "back", 9),
    ])
    const { featured, trending, newest } = homeSections(list, map)
    expect(featured?.id).toBe("g2")
    expect(trending.map((c) => c.id)).toEqual(["b2", "b1", "g1"])
    expect(newest).toEqual([])
  })

  it("leaves campaigns with nothing raised out of trending, and falls back to the newest campaign", () => {
    const list = [campaign("b1", "back"), campaign("b2", "back")]
    const { featured, trending, newest } = homeSections(list, new Map())
    expect(featured?.id).toBe("b1")
    expect(trending).toEqual([])
    expect(newest.map((c) => c.id)).toEqual(["b2"])
  })

  it("handles no campaigns", () => {
    expect(homeSections([], new Map())).toEqual({ featured: null, trending: [], newest: [] })
  })
})
