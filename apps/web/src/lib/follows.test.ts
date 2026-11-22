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
