import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CONTRIB = "3200d000-0000-4000-8000-000000000001"
const SLUG = "xay-truong-ban-may"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  signedIn: true,
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
const dbAsMock = vi.hoisted(() => vi.fn((_token?: string) => fakeDb((call) => state.handler(call), state.calls)))

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    state.signedIn ? { user: { id: USER, email: "u@dos.me", name: "An" }, accessToken: "user-jwt" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({ dbAs: dbAsMock }))

const { moderateWishFromCampaign, reportWish, toggleWishHeart } = await import("./wish-actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [k, v] of Object.entries(values)) data.set(k, v)
  return data
}

beforeEach(() => {
  revalidatePathMock.mockClear()
  dbAsMock.mockClear()
  state.calls.length = 0
  state.signedIn = true
  state.handler = () => ({ data: [{ hearted: true, heart_count: 3 }] })
})

describe("toggleWishHeart (DOS/Give#320)", () => {
  it("toggles heart under caller JWT (dbAs) and returns updated state", async () => {
    const res = await toggleWishHeart(CONTRIB, SLUG, { hearted: false, heartCount: 2 }, new FormData())
    expect(res).toEqual({ hearted: true, heartCount: 3 })
    expect(dbAsMock).toHaveBeenCalledWith("user-jwt")
    expect(state.calls[0].target).toBe("rpc:toggle_contribution_heart")
    expect(op(state.calls[0], "args")?.[0]).toEqual({ p_contribution_id: CONTRIB })
    expect(revalidatePathMock).toHaveBeenCalledWith(`/campaigns/${SLUG}`)
  })

  it("refuses signed-out callers and invalid UUIDs without calling DB", async () => {
    state.signedIn = false
    const signedOut = await toggleWishHeart(CONTRIB, SLUG, { hearted: false, heartCount: 1 }, new FormData())
    expect(signedOut.error).toContain("đăng nhập")
    expect(signedOut.heartCount).toBe(1)

    state.signedIn = true
    const invalid = await toggleWishHeart("bad-id", SLUG, { hearted: true, heartCount: 4 }, new FormData())
    expect(invalid.error).toContain("không còn hiển thị")
    expect(invalid.hearted).toBe(true)
    expect(state.calls).toHaveLength(0)
  })

  it("maps GIVE_ACCOUNT_NOT_ACTIVE and GIVE_WISH_NOT_FOUND cleanly without raw leaks", async () => {
    state.handler = () => ({ error: { code: "42501", message: "GIVE_ACCOUNT_NOT_ACTIVE" } })
    const res = await toggleWishHeart(CONTRIB, SLUG, { hearted: false, heartCount: 2 }, new FormData())
    expect(res.error).toContain("không hoạt động")
    expect(res.heartCount).toBe(2)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe("reportWish (DOS/Give#320)", () => {
  it("submits report under caller JWT and revalidates campaign and staff queue", async () => {
    state.handler = () => ({ data: "3200e000-0000-4000-8000-000000000001" })
    const res = await reportWish(CONTRIB, SLUG, null, form({ reason: "  Nội dung quảng cáo rác  " }))
    expect(res).toEqual({
      ok: true,
      message: "Cảm ơn bạn. Đội kiểm duyệt Give đã nhận báo cáo lời chúc và sẽ xem xét.",
    })
    expect(dbAsMock).toHaveBeenCalledWith("user-jwt")
    expect(state.calls[0].target).toBe("rpc:report_contribution_message")
    expect(op(state.calls[0], "args")?.[0]).toEqual({
      p_contribution_id: CONTRIB,
      p_reason: "Nội dung quảng cáo rác",
    })
    expect(revalidatePathMock.mock.calls).toEqual([[`/campaigns/${SLUG}`], ["/admin/reports/wishes"]])
  })

  it("rejects empty/>500 reasons and maps GIVE_NOT_ALLOWED (self-report) and GIVE_REPORT_LIMIT", async () => {
    expect((await reportWish(CONTRIB, SLUG, null, form({ reason: "   " })))?.ok).toBe(false)
    expect((await reportWish(CONTRIB, SLUG, null, form({ reason: "a".repeat(501) })))?.ok).toBe(false)
    expect(state.calls).toHaveLength(0)

    state.handler = () => ({ error: { code: "42501", message: "GIVE_NOT_ALLOWED" } })
    expect((await reportWish(CONTRIB, SLUG, null, form({ reason: "spam" })))?.message).toContain("của chính mình")

    state.handler = () => ({ error: { code: "23514", message: "GIVE_REPORT_LIMIT" } })
    expect((await reportWish(CONTRIB, SLUG, null, form({ reason: "spam" })))?.message).toContain("20 báo cáo")
  })
})

describe("moderateWishFromCampaign (DOS/Give#320)", () => {
  it("hides and restores wishes under caller JWT and reports resolved report counts", async () => {
    state.handler = () => ({
      data: [
        { contribution_id: CONTRIB, action: "hide", message_hidden_at: "2026-11-22T10:00:00Z", resolved_reports: 2 },
      ],
    })
    const hid = await moderateWishFromCampaign(CONTRIB, SLUG, null, form({ action: "hide", reason: "  Vi phạm  " }))
    expect(hid).toEqual({ ok: true, message: "Đã ẩn lời chúc khỏi trang công khai và chốt 2 báo cáo đang mở." })
    expect(op(state.calls[0], "args")?.[0]).toEqual({
      p_contribution_id: CONTRIB,
      p_action: "hide",
      p_reason: "Vi phạm",
    })
    expect(revalidatePathMock.mock.calls).toEqual([[`/campaigns/${SLUG}`], ["/admin/reports/wishes"]])

    state.handler = () => ({
      data: [{ contribution_id: CONTRIB, action: "restore", message_hidden_at: null, resolved_reports: 0 }],
    })
    const restored = await moderateWishFromCampaign(CONTRIB, "../unsafe", null, form({ action: "restore", reason: "" }))
    expect(restored).toEqual({ ok: true, message: "Đã khôi phục lời chúc trên trang công khai." })
    expect(revalidatePathMock).toHaveBeenCalledWith("/campaigns/[slug]", "page")
  })

  it("maps GIVE_STAFF_HIDE_LOCKED and GIVE_SELF_REVIEW clearly", async () => {
    state.handler = () => ({ error: { code: "42501", message: "GIVE_STAFF_HIDE_LOCKED" } })
    expect(
      (await moderateWishFromCampaign(CONTRIB, SLUG, null, form({ action: "restore", reason: "" })))?.message
    ).toContain("kiểm duyệt viên")

    state.handler = () => ({ error: { code: "42501", message: "GIVE_SELF_REVIEW" } })
    expect(
      (await moderateWishFromCampaign(CONTRIB, SLUG, null, form({ action: "hide", reason: "" })))?.message
    ).toContain("một kiểm duyệt viên khác")
  })
})
