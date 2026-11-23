import { describe, expect, it } from "vitest"

import type { Db } from "@/lib/campaigns"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

import {
  EMPTY_DONOR_IMPACT_SUMMARY,
  followCampaign,
  followOrganizerByHandle,
  getCampaignFollowerCount,
  getMyDonorImpactSummary,
  getOrganizerFollowerCountByHandle,
  isFollowingCampaign,
  isFollowingOrganizerByHandle,
  listMyFollowedCampaigns,
  listMyFollowedOrganizers,
  unfollowCampaign,
  unfollowOrganizerByHandle,
} from "./follows"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

function mockDb(handler: Handler, calls?: Call[]): Db {
  return fakeDb(handler, calls) as unknown as Db
}

describe("follows & donor impact data layer (DOS/Give#315)", () => {
  it("reads campaign follower count and rejects invalid UUIDs without hitting DB", async () => {
    const calls: Call[] = []
    const db = mockDb((call) => {
      if (call.target === "rpc:campaign_follower_count") return { data: "42" }
      return undefined
    }, calls)

    expect(await getCampaignFollowerCount(db, "not-a-uuid")).toBe(0)
    expect(calls).toHaveLength(0)

    expect(await getCampaignFollowerCount(db, CAMPAIGN)).toBe(42)
    expect(calls).toHaveLength(1)
    expect(op(calls[0], "args")?.[0]).toEqual({ p_campaign_id: CAMPAIGN })
  })

  it("checks, inserts (idempotent on 23505), and deletes campaign follows under RLS", async () => {
    const calls: Call[] = []
    let exists = true
    const db = mockDb((call) => {
      if (call.target === "campaign_follows" && op(call, "select")) {
        return { data: exists ? { campaign_id: CAMPAIGN } : null }
      }
      if (call.target === "campaign_follows" && op(call, "insert")) {
        return { data: null, error: { code: "23505", message: "duplicate key" } }
      }
      return { data: null }
    }, calls)

    expect(await isFollowingCampaign(db, USER, CAMPAIGN)).toBe(true)
    exists = false
    expect(await isFollowingCampaign(db, USER, CAMPAIGN)).toBe(false)
    await expect(followCampaign(db, USER, CAMPAIGN)).resolves.toBeUndefined()
    await expect(unfollowCampaign(db, USER, CAMPAIGN)).resolves.toBeUndefined()
    expect(calls.some((c) => c.target === "campaign_follows" && op(c, "delete"))).toBe(true)
  })

  it("uses ONLY handle-based RPCs for organizer follows and rejects invalid/reserved handles", async () => {
    const calls: Call[] = []
    const db = mockDb((call) => {
      if (call.target === "rpc:organizer_follower_count_by_handle") return { data: "17" }
      if (call.target === "rpc:is_following_organizer_by_handle") return { data: true }
      if (call.target === "rpc:follow_organizer_by_handle") return { data: true }
      if (call.target === "rpc:unfollow_organizer_by_handle") return { data: true }
      return undefined
    }, calls)

    expect(await getOrganizerFollowerCountByHandle(db, "admin")).toBe(0)
    expect(await isFollowingOrganizerByHandle(db, "!!bad")).toBe(false)
    await expect(followOrganizerByHandle(db, "admin")).rejects.toThrow("GIVE_ORGANIZER_NOT_FOUND")
    expect(await unfollowOrganizerByHandle(db, "   ")).toBe(false)
    expect(calls).toHaveLength(0)

    expect(await getOrganizerFollowerCountByHandle(db, "  QuY-Ban-May  ")).toBe(17)
    expect(await isFollowingOrganizerByHandle(db, "QuY-Ban-May")).toBe(true)
    expect(await followOrganizerByHandle(db, "QuY-Ban-May")).toBe(true)
    expect(await unfollowOrganizerByHandle(db, "QuY-Ban-May")).toBe(true)

    // Never touches organizer_follows table or organizer_id directly.
    expect(calls.map((c) => c.target)).toEqual([
      "rpc:organizer_follower_count_by_handle",
      "rpc:is_following_organizer_by_handle",
      "rpc:follow_organizer_by_handle",
      "rpc:unfollow_organizer_by_handle",
    ])
    for (const c of calls) {
      expect(op(c, "args")?.[0]).toEqual({ p_handle: "quy-ban-may" })
    }
  })

  it("lists followed organizers via list_my_followed_organizers and sanitizes avatar URLs", async () => {
    const db = mockDb((call) => {
      if (call.target === "rpc:list_my_followed_organizers") {
        return {
          data: [
            {
              handle: "quy-ban-may",
              display_name: "Quỹ Bản Mây",
              avatar_url: "https://cdn.dos.me/avatar.png",
              kind: "organization",
              verification_status: "verified",
              followed_at: "2026-11-20T00:00:00Z",
            },
            {
              handle: "anh-hai",
              display_name: "Anh Hai",
              avatar_url: "javascript:alert(1)",
              kind: "individual",
              verification_status: "unverified",
              followed_at: "2026-11-19T00:00:00Z",
            },
          ],
        }
      }
      return undefined
    })

    const list = await listMyFollowedOrganizers(db)
    expect(list).toEqual([
      {
        handle: "quy-ban-may",
        display_name: "Quỹ Bản Mây",
        avatar_url: "https://cdn.dos.me/avatar.png",
        kind: "organization",
        verification_status: "verified",
        followed_at: "2026-11-20T00:00:00Z",
      },
      {
        handle: "anh-hai",
        display_name: "Anh Hai",
        avatar_url: null,
        kind: "individual",
        verification_status: "unverified",
        followed_at: "2026-11-19T00:00:00Z",
      },
    ])
  })

  it("parses my_donor_impact_summary safely including bigint strings and category breakdown", async () => {
    const db = mockDb((call) => {
      if (call.target === "rpc:my_donor_impact_summary") {
        return {
          data: [
            {
              total_matched_vnd: "1250000",
              campaigns_supported_count: "3",
              active_monthly_plans_count: "1",
              followed_campaigns_count: "4",
              followed_organizers_count: "2",
              category_breakdown: [
                {
                  category_id: "cat-1",
                  category_slug: "healthcare",
                  category_name: "Y tế",
                  total_vnd: 800000,
                  campaigns_count: 2,
                },
                {
                  category_id: null,
                  category_slug: "uncategorized",
                  category_name: "Khác",
                  total_vnd: "450000",
                  campaigns_count: "1",
                },
              ],
            },
          ],
        }
      }
      return undefined
    })

    expect(await getMyDonorImpactSummary(db)).toEqual({
      total_matched_vnd: 1250000,
      campaigns_supported_count: 3,
      active_monthly_plans_count: 1,
      followed_campaigns_count: 4,
      followed_organizers_count: 2,
      category_breakdown: [
        {
          category_id: "cat-1",
          category_slug: "healthcare",
          category_name: "Y tế",
          total_vnd: 800000,
          campaigns_count: 2,
        },
        {
          category_id: null,
          category_slug: "uncategorized",
          category_name: "Khác",
          total_vnd: 450000,
          campaigns_count: 1,
        },
      ],
    })

    const emptyDb = mockDb(() => ({ data: [] }))
    expect(await getMyDonorImpactSummary(emptyDb)).toEqual(EMPTY_DONOR_IMPACT_SUMMARY)
  })
})

describe("listMyFollowedCampaigns (DOS/Give#337)", () => {
  it("clamps pagination, parses bigint strings, validates slugs/handles/covers, and zeroes non-public received_amount", async () => {
    const calls: Call[] = []
    const db = mockDb((call) => {
      if (call.target === "rpc:list_my_followed_campaigns") {
        return {
          data: [
            {
              campaign_id: CAMPAIGN,
              slug: "bep-am-vung-cao",
              type: "give",
              title: "Bếp ấm vùng cao",
              summary: "Hỗ trợ bữa ăn",
              status: "live",
              goal_amount: "50000000",
              starts_at: "2026-11-01T00:00:00Z",
              ends_at: "2026-12-31T00:00:00Z",
              prelaunch_public: false,
              cover_storage_path: "campaigns/22222222-2222-4222-8222-222222222222/cover.webp",
              cover_alt: "Ảnh bìa",
              organizer_display_name: "Quỹ Bản Mây",
              organizer_handle: "  QuY-Ban-May ",
              organizer_verification_status: "verified",
              received_amount: "12500000",
              followed_at: "2026-11-21T00:00:00Z",
              has_supported: true,
            },
            {
              campaign_id: "33333333-3333-4333-8333-333333333333",
              slug: "du-an-sap-mo",
              type: "back",
              title: "Dự án sắp mở",
              summary: null,
              status: "approved",
              goal_amount: 100_000_000,
              starts_at: "2099-12-15T00:00:00Z",
              ends_at: "2100-01-15T00:00:00Z",
              prelaunch_public: true,
              cover_storage_path: "../secret/file.webp",
              cover_alt: null,
              organizer_display_name: "Admin Giả",
              organizer_handle: "admin",
              organizer_verification_status: "bogus",
              // Defense-in-depth: even if leaked, non-public received_amount is zeroed.
              received_amount: 999999,
              followed_at: "2026-11-22T00:00:00Z",
              has_supported: false,
            },
            // Unsafe slug and invalid campaign_id rows are dropped cleanly.
            {
              campaign_id: "not-a-uuid",
              slug: "ok-slug",
              type: "give",
              title: "Bad ID",
              status: "live",
            },
            {
              campaign_id: "44444444-4444-4444-8444-444444444444",
              slug: "../evil",
              type: "give",
              title: "Bad Slug",
              status: "live",
            },
          ],
        }
      }
      return undefined
    }, calls)

    const items = await listMyFollowedCampaigns(db, 250, -5)
    expect(op(calls[0], "args")).toEqual([{ p_limit: 100, p_offset: 0 }])
    expect(items).toEqual([
      {
        campaign_id: CAMPAIGN,
        slug: "bep-am-vung-cao",
        type: "give",
        title: "Bếp ấm vùng cao",
        summary: "Hỗ trợ bữa ăn",
        status: "live",
        goal_amount: 50_000_000,
        starts_at: "2026-11-01T00:00:00Z",
        ends_at: "2026-12-31T00:00:00Z",
        prelaunch_public: false,
        cover_storage_path: "campaigns/22222222-2222-4222-8222-222222222222/cover.webp",
        cover_alt: "Ảnh bìa",
        organizer_display_name: "Quỹ Bản Mây",
        organizer_handle: "quy-ban-may",
        organizer_verification_status: "verified",
        received_amount: 12_500_000,
        followed_at: "2026-11-21T00:00:00Z",
        has_supported: true,
      },
      {
        campaign_id: "33333333-3333-4333-8333-333333333333",
        slug: "du-an-sap-mo",
        type: "back",
        title: "Dự án sắp mở",
        summary: null,
        status: "approved",
        goal_amount: 100_000_000,
        starts_at: "2099-12-15T00:00:00Z",
        ends_at: "2100-01-15T00:00:00Z",
        prelaunch_public: true,
        cover_storage_path: null,
        cover_alt: null,
        organizer_display_name: "Admin Giả",
        organizer_handle: null,
        organizer_verification_status: null,
        received_amount: 0,
        followed_at: "2026-11-22T00:00:00Z",
        has_supported: false,
      },
    ])
  })

  it("propagates RPC errors", async () => {
    const db = mockDb(() => ({ error: { code: "PGRST303", message: "JWT expired" } }))
    await expect(listMyFollowedCampaigns(db)).rejects.toMatchObject({ code: "PGRST303" })
  })
})
