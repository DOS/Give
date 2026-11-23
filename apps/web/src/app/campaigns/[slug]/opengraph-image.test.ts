import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignStatus, PublicCampaign } from "@/lib/campaigns"
import { PUBLIC_COVER_CACHE } from "@/lib/cover-route"
import { fakeDb, type Call, type Handler } from "@/test/fake-db"

const CAMPAIGN = "33333333-3333-4333-8333-333333333333"
const SLUG = "xay-truong-ban-may"

const state = vi.hoisted(() => ({
  anonHandler: (() => undefined) as Handler,
  anonCalls: [] as Call[],
  dbAsTokens: [] as (string | undefined)[],
}))

vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) => {
    state.dbAsTokens.push(token)
    return fakeDb((call) => state.anonHandler(call), state.anonCalls)
  },
}))

const { default: CampaignOpenGraphImage, contentType, size } = await import("./opengraph-image")

function campaignFixture(status: CampaignStatus = "live", overrides: Partial<PublicCampaign> = {}): PublicCampaign {
  return {
    id: CAMPAIGN,
    slug: SLUG,
    type: "give",
    funding_model: "flexible",
    category_id: "cat-1",
    title: "Xây trường Bản Mây — Hỗ trợ bữa ăn đủ chất cho trẻ em vùng cao",
    summary: "Cùng dựng lớp học mới.",
    story: null,
    beneficiary_name: null,
    beneficiary_relation: null,
    cover_media_id: null,
    asset: "VND",
    goal_amount: 100_000_000,
    min_contribution: 20_000,
    stretch_goal_amount: null,
    display_options: { progress_bar: true, backers_count: true, time_remaining: true },
    starts_at: null,
    ends_at: "2099-12-31T00:00:00.000Z",
    payment_window_days: 7,
    status,
    submitted_at: "2026-11-10T00:00:00.000Z",
    approved_at: "2026-11-11T00:00:00.000Z",
    outcome_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-11T00:00:00.000Z",
    category: { id: "cat-1", slug: "giao-duc", name: "Giáo dục", icon: null, color: null },
    cover: null,
    ...overrides,
  }
}

beforeEach(() => {
  state.anonCalls.length = 0
  state.dbAsTokens.length = 0
  state.anonHandler = (call) => {
    if (call.target === "campaigns") return { data: campaignFixture("live") }
    if (call.target === "public_campaigns") {
      return {
        data: {
          id: CAMPAIGN,
          type: "give",
          asset: "VND",
          goal_amount: 100_000_000,
          pledged_amount: 0,
          paid_amount: 45_000_000,
          disbursable_amount: 45_000_000,
          disbursed_amount: 0,
          refunded_amount: 0,
          unexplained_out_amount: 0,
          unexplained_out_count: 0,
          supporters_count: 18,
          other_in_amount: 5_000_000,
          refund_owed_amount: 0,
          backers_count: 0,
          payments_stopped_at: null,
          payments_stopped_note: null,
          own_transfer_amount: 0,
        },
      }
    }
    if (call.target === "rpc:public_organizer") {
      return { data: [{ display_name: "Quỹ Bản Mây", kind: "organization", verification_status: "verified" }] }
    }
    return undefined
  }
})

describe("CampaignOpenGraphImage (/campaigns/[slug]/opengraph-image, DOS/Give#313)", () => {
  it("declares standard 1200x630 PNG metadata", () => {
    expect(size).toEqual({ width: 1200, height: 630 })
    expect(contentType).toBe("image/png")
  })

  it("renders a valid PNG with bundled Vietnamese font and public cache headers for public give and back campaigns", async () => {
    const giveResponse = await CampaignOpenGraphImage({ params: Promise.resolve({ slug: SLUG }) })
    expect(giveResponse.status).toBe(200)
    expect(giveResponse.headers.get("content-type")).toContain("image/png")
    expect(giveResponse.headers.get("cache-control")).toBe(PUBLIC_COVER_CACHE)
    expect(giveResponse.headers.get("x-content-type-options")).toBe("nosniff")
    // Anonymous dbAs() only — never reads authenticated session.
    expect(state.dbAsTokens).toEqual([undefined])

    const bytes = new Uint8Array(await giveResponse.arrayBuffer())
    expect(bytes.length).toBeGreaterThan(1000)
    // PNG magic header: 89 50 4E 47 0D 0A 1A 0A
    expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    // Also renders cleanly for a succeeded back campaign.
    const base = state.anonHandler
    state.anonHandler = (call) =>
      call.target === "campaigns"
        ? { data: campaignFixture("succeeded", { type: "back", funding_model: "all_or_nothing" }) }
        : base(call)
    const backResponse = await CampaignOpenGraphImage({ params: Promise.resolve({ slug: SLUG }) })
    expect(backResponse.status).toBe(200)
    const backBytes = new Uint8Array(await backResponse.arrayBuffer())
    expect(Array.from(backBytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it.each(["draft", "in_review", "changes_requested", "approved", "suspended", "cancelled"] as const)(
    "strictly returns 404 with no-store for non-public campaign status %s",
    async (status) => {
      state.anonHandler = (call) => (call.target === "campaigns" ? { data: campaignFixture(status) } : undefined)

      const response = await CampaignOpenGraphImage({ params: Promise.resolve({ slug: SLUG }) })
      expect(response.status).toBe(404)
      expect(response.headers.get("cache-control")).toBe("no-store")
    }
  )

  it("renders a valid teaser PNG without reading public_campaigns for an opted-in future pre-launch campaign (DOS/Give#315)", async () => {
    const base = state.anonHandler
    state.anonHandler = (call) =>
      call.target === "campaigns"
        ? {
            data: campaignFixture("approved", {
              prelaunch_public: true,
              starts_at: "2099-12-01T00:00:00.000Z",
            }),
          }
        : base(call)

    const response = await CampaignOpenGraphImage({ params: Promise.resolve({ slug: SLUG }) })
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("image/png")
    expect(response.headers.get("cache-control")).toBe(PUBLIC_COVER_CACHE)
    expect(state.anonCalls.some((c) => c.target === "public_campaigns")).toBe(false)
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])

    // Past starts_at approved campaign must still return 404.
    state.anonHandler = (call) =>
      call.target === "campaigns"
        ? {
            data: campaignFixture("approved", {
              prelaunch_public: true,
              starts_at: "2020-01-01T00:00:00.000Z",
            }),
          }
        : base(call)
    const expired = await CampaignOpenGraphImage({ params: Promise.resolve({ slug: SLUG }) })
    expect(expired.status).toBe(404)
    expect(expired.headers.get("cache-control")).toBe("no-store")
  })

  it("returns Cache-Control: no-store on live/ended campaigns when totals read fails so CDNs never cache 0 ₫ fallbacks (DOS/Give#331)", async () => {
    const base = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "public_campaigns") return { error: { code: "XX000", message: "transient failure" } }
      return base(call)
    }

    const liveFailed = await CampaignOpenGraphImage({ params: Promise.resolve({ slug: SLUG }) })
    expect(liveFailed.status).toBe(200)
    expect(liveFailed.headers.get("content-type")).toContain("image/png")
    expect(liveFailed.headers.get("cache-control")).toBe("no-store")
    expect(liveFailed.headers.get("x-content-type-options")).toBe("nosniff")

    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("closed") }
      if (call.target === "public_campaigns") return { data: null }
      return base(call)
    }

    const endedMissingTotals = await CampaignOpenGraphImage({ params: Promise.resolve({ slug: SLUG }) })
    expect(endedMissingTotals.status).toBe(200)
    expect(endedMissingTotals.headers.get("cache-control")).toBe("no-store")
  })

  it("returns 404 for nonexistent campaigns and invalid slugs without querying the database for invalid slugs", async () => {
    state.anonHandler = () => ({ data: null })
    const missing = await CampaignOpenGraphImage({ params: Promise.resolve({ slug: SLUG }) })
    expect(missing.status).toBe(404)
    expect(missing.headers.get("cache-control")).toBe("no-store")

    state.anonCalls.length = 0
    const invalid = await CampaignOpenGraphImage({ params: Promise.resolve({ slug: "BAD SLUG/.." }) })
    expect(invalid.status).toBe(404)
    expect(invalid.headers.get("cache-control")).toBe("no-store")
    expect(state.anonCalls).toHaveLength(0)
  })
})
