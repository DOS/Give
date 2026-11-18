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

  it("ranks trending by exact progress ratio (including sub-percent and >100%) and breaks ties by raised amount", () => {
    // Featured takes g-hero (highest give raised = 1_000_000).
    // Remaining candidates:
    // - b-over-250: 250 / 100 = 2.50 (progressPercent would cap at 100)
    // - b-over-120: 120 / 100 = 1.20 (progressPercent would also cap at 100)
    // - g-999:      999 / 1_000 = 0.999 (progressPercent would floor to 99)
    // - g-990:      990 / 1_000 = 0.990 (progressPercent would also floor to 99)
    // - b-half-big: 500_000 / 1_000_000 = 0.50 (tie on ratio, higher raised wins)
    // - b-half-sm:  500 / 1_000 = 0.50
    const list = [
      campaign("g-hero", "give", 10_000_000),
      campaign("b-half-sm", "back", 1_000),
      campaign("g-990", "give", 1_000),
      campaign("b-over-120", "back", 100),
      campaign("b-half-big", "back", 1_000_000),
      campaign("g-999", "give", 1_000),
      campaign("b-over-250", "back", 100),
    ]
    const map = new Map([
      totals("g-hero", "give", 1_000_000),
      totals("b-half-sm", "back", 500),
      totals("g-990", "give", 990),
      totals("b-over-120", "back", 120),
      totals("b-half-big", "back", 500_000),
      totals("g-999", "give", 999),
      totals("b-over-250", "back", 250),
    ])

    const { featured, trending, newest } = homeSections(list, map, 6)
    expect(featured?.id).toBe("g-hero")
    expect(trending.map((c) => c.id)).toEqual(["b-over-250", "b-over-120", "g-999", "g-990", "b-half-big", "b-half-sm"])
    expect(newest).toEqual([])
  })

  it("treats non-positive goal_amount as 0 progress and clamps non-positive trendingCount to 0", () => {
    const list = [
      campaign("g-hero", "give", 1_000),
      campaign("b-zero-goal", "back", 0),
      campaign("b-normal", "back", 100),
      campaign("b-second", "back", 100),
    ]
    const map = new Map([
      totals("g-hero", "give", 500),
      totals("b-zero-goal", "back", 900),
      totals("b-normal", "back", 10),
      totals("b-second", "back", 80),
    ])

    // Positive progress (0.8, 0.1) ranks ahead of goal_amount === 0 (ratio 0).
    expect(homeSections(list, map, 3).trending.map((c) => c.id)).toEqual(["b-second", "b-normal", "b-zero-goal"])

    // Negative or zero trendingCount never slices from the end (.slice(0, -1) bug).
    for (const badCount of [0, -1, -5]) {
      const sections = homeSections(list, map, badCount)
      expect(sections.featured?.id).toBe("g-hero")
      expect(sections.trending).toEqual([])
      expect(sections.newest.map((c) => c.id)).toEqual(["b-zero-goal", "b-normal", "b-second"])
    }
  })
})
