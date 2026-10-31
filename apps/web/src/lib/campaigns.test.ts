import { describe, expect, it } from "vitest"

import {
  canPostUpdate,
  categoriesFor,
  discoveryHref,
  fundingModelFor,
  isEditableStatus,
  isPublicStatus,
  normalizeSearch,
  organizerCanCancel,
  parseDiscoveryFilters,
  searchFilter,
  STATUS_LABELS,
  type CampaignStatus,
  type Category,
} from "./campaigns"

const ALL_STATUSES = Object.keys(STATUS_LABELS) as CampaignStatus[]

describe("status rules", () => {
  it("matches give.is_public_status", () => {
    expect(ALL_STATUSES.filter(isPublicStatus)).toEqual(["live", "settling", "succeeded", "failed", "closed"])
  })

  it("matches give.is_editable_status", () => {
    expect(ALL_STATUSES.filter(isEditableStatus)).toEqual(["draft", "changes_requested"])
  })

  it("lets organizers cancel only before going live (transition_campaign)", () => {
    expect(ALL_STATUSES.filter(organizerCanCancel)).toEqual(["draft", "in_review", "changes_requested", "approved"])
  })

  it("blocks updates on cancelled and suspended campaigns", () => {
    expect(ALL_STATUSES.filter((s) => !canPostUpdate(s))).toEqual(["suspended", "cancelled"])
  })

  it("pairs each type with its funding model", () => {
    expect(fundingModelFor("give")).toBe("flexible")
    expect(fundingModelFor("back")).toBe("all_or_nothing")
  })
})

describe("categoriesFor", () => {
  const category = (slug: string, applies_to: Category["applies_to"]): Category => ({
    id: slug,
    slug,
    name: slug,
    description: null,
    icon: null,
    color: null,
    applies_to,
    sort_order: 0,
  })
  const categories = [category("health", "give"), category("tech", "back"), category("local", "both")]

  it("keeps the type's own categories and shared ones", () => {
    expect(categoriesFor(categories, "give").map((c) => c.slug)).toEqual(["health", "local"])
    expect(categoriesFor(categories, "back").map((c) => c.slug)).toEqual(["tech", "local"])
  })
})

describe("normalizeSearch", () => {
  it("keeps Vietnamese letters and digits", () => {
    expect(normalizeSearch("  Xây trường  2026 ")).toBe("Xây trường 2026")
  })

  it("strips PostgREST and LIKE syntax", () => {
    expect(normalizeSearch('a%b_c,d(e)f."g\\h*')).toBe("a b c d e f g h")
    expect(normalizeSearch("x),id.eq.1")).toBe("x id eq 1")
  })

  it("normalizes decomposed input to NFC", () => {
    expect(normalizeSearch("Lũ")).toBe("Lũ")
  })

  it("rejects searches with fewer than 2 characters left", () => {
    expect(normalizeSearch("")).toBeNull()
    expect(normalizeSearch("%")).toBeNull()
    expect(normalizeSearch("a")).toBeNull()
  })

  it("caps the length at 80", () => {
    expect(normalizeSearch("a".repeat(200))).toHaveLength(80)
  })
})

describe("searchFilter", () => {
  it("quotes both ilike values", () => {
    expect(searchFilter("lũ lụt")).toBe('title.ilike."%lũ lụt%",summary.ilike."%lũ lụt%"')
  })
})

describe("parseDiscoveryFilters", () => {
  it("reads valid filters", () => {
    expect(parseDiscoveryFilters({ type: "back", category: "film-video", q: "phim" })).toEqual({
      type: "back",
      category: "film-video",
      q: "phim",
    })
  })

  it("drops invalid values", () => {
    expect(parseDiscoveryFilters({ type: "equity", category: "Bad Slug!", q: "*" })).toEqual({
      type: null,
      category: null,
      q: null,
    })
  })

  it("takes the first of repeated params", () => {
    expect(parseDiscoveryFilters({ type: ["give", "back"] }).type).toBe("give")
  })
})

describe("discoveryHref", () => {
  it("omits empty filters", () => {
    expect(discoveryHref({})).toBe("/campaigns")
    expect(discoveryHref({ type: null, category: null, q: null })).toBe("/campaigns")
  })

  it("encodes the query", () => {
    expect(discoveryHref({ type: "give", category: "healthcare", q: "lũ lụt" })).toBe(
      "/campaigns?type=give&category=healthcare&q=l%C5%A9+l%E1%BB%A5t"
    )
  })
})
