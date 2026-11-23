import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, type Call, type Handler } from "@/test/fake-db"

const state = vi.hoisted(() => ({
  session: { user: { id: "11111111-1111-4111-8111-111111111111" }, accessToken: "tok" } as {
    user: { id: string }
    accessToken: string
  } | null,
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  revalidated: [] as string[],
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((path: string) => state.revalidated.push(path)),
}))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => state.session),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.handler(call), state.calls),
}))

const { toggleOrganizerFollow } = await import("./actions")

function formWith(intent: string) {
  const f = new FormData()
  f.set("intent", intent)
  return f
}

describe("toggleOrganizerFollow action (/u/[handle], DOS/Give#315)", () => {
  beforeEach(() => {
    state.session = { user: { id: "11111111-1111-4111-8111-111111111111" }, accessToken: "tok" }
    state.calls.length = 0
    state.revalidated.length = 0
    state.handler = (call) => {
      if (call.target === "rpc:follow_organizer_by_handle") return { data: true }
      if (call.target === "rpc:unfollow_organizer_by_handle") return { data: true }
      if (call.target === "rpc:organizer_follower_count_by_handle") return { data: 9 }
      return undefined
    }
  })

  it("refuses guests and reserved/invalid handles without hitting the DB", async () => {
    state.session = null
    expect(await toggleOrganizerFollow("quy-ban-may", { following: false, count: 0 }, formWith("follow"))).toEqual({
      following: false,
      count: 0,
      error: "Hãy đăng nhập để theo dõi người tổ chức.",
    })

    state.session = { user: { id: "11111111-1111-4111-8111-111111111111" }, accessToken: "tok" }
    expect(await toggleOrganizerFollow("admin", { following: false, count: 0 }, formWith("follow"))).toMatchObject({
      error: "Không tìm thấy hồ sơ người tổ chức công khai.",
    })
    expect(state.calls).toHaveLength(0)
  })

  it("uses strictly handle-based RPCs (zero organizer_follows table / organizer_id access)", async () => {
    const followed = await toggleOrganizerFollow("Quy-Ban-May", { following: false, count: 8 }, formWith("follow"))
    expect(followed).toEqual({ following: true, count: 9 })
    expect(state.calls.map((c) => c.target)).toEqual([
      "rpc:follow_organizer_by_handle",
      "rpc:organizer_follower_count_by_handle",
    ])
    expect(state.revalidated).toEqual(["/u/quy-ban-may", "/me/contributions", "/me/following"])

    state.calls.length = 0
    state.handler = (call) => {
      if (call.target === "rpc:unfollow_organizer_by_handle") return { data: true }
      if (call.target === "rpc:organizer_follower_count_by_handle") return { data: 8 }
      return undefined
    }
    const unfollowed = await toggleOrganizerFollow("quy-ban-may", { following: true, count: 9 }, formWith("unfollow"))
    expect(unfollowed).toEqual({ following: false, count: 8 })
    expect(state.calls.map((c) => c.target)).toEqual([
      "rpc:unfollow_organizer_by_handle",
      "rpc:organizer_follower_count_by_handle",
    ])
  })

  it("maps GIVE_CANNOT_FOLLOW_SELF into Vietnamese copy", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:follow_organizer_by_handle") {
        return { data: null, error: { code: "23514", message: "GIVE_CANNOT_FOLLOW_SELF" } }
      }
      return undefined
    }
    const res = await toggleOrganizerFollow("quy-ban-may", { following: false, count: 8 }, formWith("follow"))
    expect(res).toEqual({
      following: false,
      count: 8,
      error: "Bạn không thể tự theo dõi trang của chính mình.",
    })
  })
})
