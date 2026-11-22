import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import { getPublicOrganizerProfile, listOrganizerPublicCampaigns } from "./organizer-profile"

describe("organizer-profile data layer (DOS/Give#251, #261)", () => {
  it("skips database calls and returns null/empty for invalid or reserved handles", async () => {
    const log: Call[] = []
    const db = fakeDb(() => ({ data: [] }), log)

    for (const bad of ["", "ab", "bad--slug", "admin", "campaigns", "../me"]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(await getPublicOrganizerProfile(db as any, bad)).toBeNull()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(await listOrganizerPublicCampaigns(db as any, bad)).toEqual([])
    }
    expect(log).toHaveLength(0)
  })

  it("whitelists only public fields and sanitizes avatar_url from public_organizer_profile", async () => {
    const log: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          {
            handle: "quy-ban-may",
            display_name: "Quỹ Bản Mây",
            avatar_url: "https://cdn.dos.me/avatar.webp",
            kind: "organization",
            verification_status: "verified",
            bio: "Hỗ trợ học sinh vùng cao.",
            created_at: "2026-10-01T00:00:00Z",
            // Private fields must never survive mapping even if injected.
            user_id: "11111111-1111-4111-8111-111111111111",
            legal_name: "Quỹ TNHH Pháp Lý",
            phone: "0901234567",
            email: "secret@example.vn",
          },
        ],
      }),
      log
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = await getPublicOrganizerProfile(db as any, "  Quy-Ban-May ")
    expect(log).toHaveLength(1)
    expect(log[0].target).toBe("rpc:public_organizer_profile")
    expect(op(log[0], "args")).toEqual([{ p_handle: "quy-ban-may" }])
    expect(profile).toEqual({
      handle: "quy-ban-may",
      display_name: "Quỹ Bản Mây",
      avatar_url: "https://cdn.dos.me/avatar.webp",
      kind: "organization",
      verification_status: "verified",
      bio: "Hỗ trợ học sinh vùng cao.",
      created_at: "2026-10-01T00:00:00Z",
    })
  })

  it("drops unsafe avatar_url values from public_organizer_profile", async () => {
    const db = fakeDb(() => ({
      data: [
        {
          handle: "quy-ban-may",
          display_name: "Quỹ Bản Mây",
          avatar_url: "javascript:alert(1)",
          kind: "organization",
          verification_status: "verified",
          bio: null,
          created_at: "2026-10-01T00:00:00Z",
        },
      ],
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = await getPublicOrganizerProfile(db as any, "quy-ban-may")
    expect(profile?.avatar_url).toBeNull()
  })

  it("clamps limit/offset and maps campaign card rows from list_organizer_public_campaigns", async () => {
    const log: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            slug: "xay-truong-ban-may",
            type: "give",
            title: "Xây trường Bản Mây",
            summary: "Tóm tắt",
            goal_amount: "50000000",
            ends_at: "2026-12-31T00:00:00Z",
            status: "live",
            display_options: { progress_bar: true, backers_count: true, time_remaining: true },
            cover_storage_path: "campaigns/22222222-2222-4222-8222-222222222222/cover.webp",
            cover_alt: "Ảnh bìa",
            created_at: "2026-11-01T00:00:00Z",
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            slug: "sach-anh",
            type: "back",
            title: "Sách ảnh",
            summary: null,
            goal_amount: 10000000,
            ends_at: null,
            status: "succeeded",
            display_options: { progress_bar: true, backers_count: true, time_remaining: true },
            cover_storage_path: null,
            cover_alt: null,
            created_at: "2026-10-01T00:00:00Z",
          },
        ],
      }),
      log
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const campaigns = await listOrganizerPublicCampaigns(db as any, "quy-ban-may", 999, -5)
    expect(log).toHaveLength(1)
    expect(log[0].target).toBe("rpc:list_organizer_public_campaigns")
    expect(op(log[0], "args")).toEqual([{ p_handle: "quy-ban-may", p_limit: 100, p_offset: 0 }])
    expect(campaigns).toEqual([
      {
        id: "22222222-2222-4222-8222-222222222222",
        slug: "xay-truong-ban-may",
        type: "give",
        title: "Xây trường Bản Mây",
        goal_amount: 50_000_000,
        ends_at: "2026-12-31T00:00:00Z",
        status: "live",
        display_options: { progress_bar: true, backers_count: true, time_remaining: true },
        cover: {
          storage_path: "campaigns/22222222-2222-4222-8222-222222222222/cover.webp",
          alt: "Ảnh bìa",
        },
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        slug: "sach-anh",
        type: "back",
        title: "Sách ảnh",
        goal_amount: 10_000_000,
        ends_at: null,
        status: "succeeded",
        display_options: { progress_bar: true, backers_count: true, time_remaining: true },
        cover: null,
      },
    ])
  })
})
