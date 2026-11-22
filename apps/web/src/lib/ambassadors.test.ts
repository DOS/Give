import { describe, expect, it } from "vitest"

import {
  AMBASSADOR_LEADERBOARD_MAX_LIMIT,
  ambassadorFormSchema,
  ambassadorLinkPath,
  campaignPledgeHref,
  canCreateAmbassadorLink,
  getMyCampaignAmbassador,
  getPublicAmbassadorRef,
  listCampaignAmbassadorLeaderboard,
  listMyAmbassadorLinks,
  sanitizeAmbassadorRef,
  upsertMyCampaignAmbassador,
} from "@/lib/ambassadors"
import type { Db } from "@/lib/campaigns"
import { fakeDb, op, type Call } from "@/test/fake-db"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

describe("ambassadors helpers (DOS/Give#319)", () => {
  it("sanitizes valid 8..12 alphanumeric refs and fails open to null on anything malformed", () => {
    expect(sanitizeAmbassadorRef("ab23cd45ef")).toBe("ab23cd45ef")
    expect(sanitizeAmbassadorRef("  AB23CD45EF  ")).toBe("ab23cd45ef")
    expect(sanitizeAmbassadorRef(["AB23CD45", "ignored"])).toBe("ab23cd45")
    expect(sanitizeAmbassadorRef("123456789012")).toBe("123456789012")

    expect(sanitizeAmbassadorRef(null)).toBeNull()
    expect(sanitizeAmbassadorRef(undefined)).toBeNull()
    expect(sanitizeAmbassadorRef("")).toBeNull()
    expect(sanitizeAmbassadorRef("   ")).toBeNull()
    expect(sanitizeAmbassadorRef("short77")).toBeNull()
    expect(sanitizeAmbassadorRef("toolong123456")).toBeNull()
    expect(sanitizeAmbassadorRef("<script>alert(1)</script>")).toBeNull()
    expect(sanitizeAmbassadorRef("ab23-cd45")).toBeNull()
    expect(sanitizeAmbassadorRef(12345678)).toBeNull()
  })

  it("builds shareable ambassador links and pledge URLs preserving valid refs only", () => {
    expect(ambassadorLinkPath("xay-truong", "ab23cd45ef")).toBe("/campaigns/xay-truong?ref=ab23cd45ef")
    expect(campaignPledgeHref("du-an-den")).toBe("/campaigns/du-an-den/pledge")
    expect(campaignPledgeHref("du-an-den", { refCode: "AB23CD45EF" })).toBe(
      "/campaigns/du-an-den/pledge?ref=ab23cd45ef"
    )
    expect(campaignPledgeHref("du-an-den", { tierId: "tier-1", refCode: "ab23cd45ef" })).toBe(
      "/campaigns/du-an-den/pledge?tier=tier-1&ref=ab23cd45ef"
    )
    expect(campaignPledgeHref("du-an-den", { tierId: "tier-1", refCode: "bad!!ref" })).toBe(
      "/campaigns/du-an-den/pledge?tier=tier-1"
    )
  })

  it("gates ambassador link creation strictly to live (unended) and active public pre-launch campaigns", () => {
    const now = new Date("2026-11-22T12:00:00Z")
    expect(canCreateAmbassadorLink({ status: "live", ends_at: "2026-12-01T00:00:00Z" }, false, now)).toBe(true)
    expect(canCreateAmbassadorLink({ status: "live", ends_at: null }, false, now)).toBe(true)
    expect(
      canCreateAmbassadorLink(
        { status: "approved", prelaunch_public: true, starts_at: "2026-12-01T00:00:00Z" },
        false,
        now
      )
    ).toBe(true)

    // Never on preview, draft, non-prelaunch approved, suspended, cancelled, ended, or past-end live.
    expect(canCreateAmbassadorLink({ status: "live", ends_at: "2026-12-01T00:00:00Z" }, true, now)).toBe(false)
    expect(canCreateAmbassadorLink({ status: "live", ends_at: "2026-11-21T00:00:00Z" }, false, now)).toBe(false)
    expect(canCreateAmbassadorLink({ status: "draft" }, false, now)).toBe(false)
    expect(canCreateAmbassadorLink({ status: "in_review" }, false, now)).toBe(false)
    expect(
      canCreateAmbassadorLink(
        { status: "approved", prelaunch_public: false, starts_at: "2026-12-01T00:00:00Z" },
        false,
        now
      )
    ).toBe(false)
    expect(canCreateAmbassadorLink({ status: "suspended" }, false, now)).toBe(false)
    expect(canCreateAmbassadorLink({ status: "succeeded" }, false, now)).toBe(false)
    expect(canCreateAmbassadorLink({ status: "closed" }, false, now)).toBe(false)
    expect(canCreateAmbassadorLink({ status: "failed" }, false, now)).toBe(false)
  })

  it("validates ambassador form input cleanly", () => {
    expect(ambassadorFormSchema.parse({ display_name: "  CLB Xanh  ", show_on_leaderboard: "on" })).toEqual({
      display_name: "CLB Xanh",
      show_on_leaderboard: true,
    })
    expect(ambassadorFormSchema.parse({ display_name: "Minh Anh", show_on_leaderboard: "" })).toEqual({
      display_name: "Minh Anh",
      show_on_leaderboard: false,
    })
    expect(ambassadorFormSchema.safeParse({ display_name: "   ", show_on_leaderboard: true }).success).toBe(false)
    expect(ambassadorFormSchema.safeParse({ display_name: "a".repeat(81), show_on_leaderboard: true }).success).toBe(
      false
    )
    expect(ambassadorFormSchema.safeParse({ display_name: "Line1\nLine2", show_on_leaderboard: true }).success).toBe(
      false
    )
  })
})

describe("ambassadors RPC wrappers (DOS/Give#319)", () => {
  it("getPublicAmbassadorRef skips DB call on malformed ref and resolves valid ref", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      (call) =>
        call.target === "rpc:public_ambassador_ref"
          ? { data: [{ ref_code: "ab23cd45ef", display_name: "Minh Anh" }] }
          : undefined,
      calls
    ) as unknown as Db

    expect(await getPublicAmbassadorRef(db, CAMPAIGN, "not-valid!!")).toBeNull()
    expect(calls).toHaveLength(0)

    expect(await getPublicAmbassadorRef(db, CAMPAIGN, "  AB23CD45EF  ")).toEqual({
      ref_code: "ab23cd45ef",
      display_name: "Minh Anh",
    })
    expect(op(calls[0], "args")).toEqual([{ p_campaign_id: CAMPAIGN, p_ref_code: "ab23cd45ef" }])
  })

  it("listCampaignAmbassadorLeaderboard clamps limit to 1..50 and filters non-positive rows", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          { ref_code: "ab23cd45ef", display_name: "CLB Xanh", matched_count: "3", matched_total_vnd: "1500000" },
          { ref_code: "zero123456", display_name: "Zero", matched_count: 0, matched_total_vnd: 0 },
        ],
      }),
      calls
    ) as unknown as Db

    const rows = await listCampaignAmbassadorLeaderboard(db, CAMPAIGN, 999)
    expect(op(calls[0], "args")).toEqual([{ p_campaign_id: CAMPAIGN, p_limit: AMBASSADOR_LEADERBOARD_MAX_LIMIT }])
    expect(rows).toEqual([
      { ref_code: "ab23cd45ef", display_name: "CLB Xanh", matched_count: 3, matched_total_vnd: 1_500_000 },
    ])
  })

  it("getMyCampaignAmbassador, listMyAmbassadorLinks, and upsertMyCampaignAmbassador parse RPC output", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "rpc:get_my_campaign_ambassador") {
        return {
          data: [
            {
              ref_code: "ab23cd45ef",
              display_name: "Minh Anh",
              show_on_leaderboard: true,
              matched_count: "2",
              matched_total_vnd: "400000",
              created_at: "2026-11-22T00:00:00Z",
              updated_at: "2026-11-22T00:00:00Z",
            },
          ],
        }
      }
      if (call.target === "rpc:list_my_ambassador_links") {
        return {
          data: [
            {
              campaign_id: CAMPAIGN,
              campaign_slug: "xay-truong",
              campaign_title: "Xây trường",
              campaign_status: "live",
              campaign_type: "give",
              ref_code: "ab23cd45ef",
              display_name: "Minh Anh",
              show_on_leaderboard: false,
              matched_count: 1,
              matched_total_vnd: 250000,
              created_at: "2026-11-22T00:00:00Z",
              updated_at: "2026-11-22T00:00:00Z",
            },
          ],
        }
      }
      if (call.target === "rpc:upsert_my_campaign_ambassador") {
        return {
          data: [
            {
              ref_code: "ab23cd45ef",
              display_name: "Minh Anh Mới",
              show_on_leaderboard: false,
              created_at: "2026-11-22T00:00:00Z",
            },
          ],
        }
      }
      return undefined
    }, calls) as unknown as Db

    expect(await getMyCampaignAmbassador(db, CAMPAIGN)).toMatchObject({
      ref_code: "ab23cd45ef",
      matched_count: 2,
      matched_total_vnd: 400_000,
    })
    expect(await listMyAmbassadorLinks(db)).toEqual([
      expect.objectContaining({
        campaign_slug: "xay-truong",
        ref_code: "ab23cd45ef",
        show_on_leaderboard: false,
        matched_total_vnd: 250_000,
      }),
    ])
    expect(
      await upsertMyCampaignAmbassador(db, {
        campaignId: CAMPAIGN,
        displayName: "Minh Anh Mới",
        showOnLeaderboard: false,
      })
    ).toEqual({
      ref_code: "ab23cd45ef",
      display_name: "Minh Anh Mới",
      show_on_leaderboard: false,
      created_at: "2026-11-22T00:00:00Z",
    })
  })
})
