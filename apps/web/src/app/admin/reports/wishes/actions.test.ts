import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const MOD = "66666666-6666-4666-8666-666666666666"
const CONTRIB = "3200d000-0000-4000-8000-000000000001"

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
    state.signedIn ? { user: { id: MOD, email: "mod@dos.me", name: "Mod" }, accessToken: "mod-jwt" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({ dbAs: dbAsMock }))

const { moderateReportedWish } = await import("./actions")

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
  state.handler = () => ({
    data: [
      { contribution_id: CONTRIB, action: "hide", message_hidden_at: "2026-11-22T10:00:00Z", resolved_reports: 2 },
    ],
  })
})

describe("moderateReportedWish (DOS/Give#320)", () => {
  it("handles hide, restore, and dismiss_reports under staff JWT (dbAs) and revalidates paths", async () => {
    const hid = await moderateReportedWish(CONTRIB, null, form({ action: "hide", reason: "  Quảng cáo rác  " }))
    expect(hid).toEqual({ ok: true, message: "Đã ẩn lời chúc khỏi trang công khai và chốt 2 báo cáo đang mở." })
    expect(dbAsMock).toHaveBeenCalledWith("mod-jwt")
    expect(state.calls[0].target).toBe("rpc:moderate_contribution_message")
    expect(op(state.calls[0], "args")?.[0]).toEqual({
      p_contribution_id: CONTRIB,
      p_action: "hide",
      p_reason: "Quảng cáo rác",
    })
    expect(revalidatePathMock.mock.calls).toEqual([["/admin/reports/wishes"], ["/campaigns/[slug]", "page"]])

    state.handler = () => ({
      data: [{ contribution_id: CONTRIB, action: "restore", message_hidden_at: null, resolved_reports: 0 }],
    })
    const restored = await moderateReportedWish(CONTRIB, null, form({ action: "restore", reason: "" }))
    expect(restored?.ok).toBe(true)
    expect(restored?.message).toContain("Bác bỏ báo cáo")

    state.handler = () => ({
      data: [{ contribution_id: CONTRIB, action: "dismiss_reports", message_hidden_at: null, resolved_reports: 1 }],
    })
    const dismissed = await moderateReportedWish(CONTRIB, null, form({ action: "dismiss_reports", reason: "Hợp lệ" }))
    expect(dismissed).toEqual({ ok: true, message: "Đã bác bỏ 1 báo cáo đang mở và giữ nguyên lời chúc." })
  })

  it("refuses signed-out callers, invalid IDs, invalid actions, and >500-char reasons before calling DB", async () => {
    state.signedIn = false
    expect((await moderateReportedWish(CONTRIB, null, form({ action: "hide", reason: "" })))?.message).toContain(
      "Phiên đăng nhập"
    )
    state.signedIn = true

    expect((await moderateReportedWish("bad-id", null, form({ action: "hide", reason: "" })))?.ok).toBe(false)
    expect((await moderateReportedWish(CONTRIB, null, form({ action: "bogus", reason: "" })))?.ok).toBe(false)
    expect((await moderateReportedWish(CONTRIB, null, form({ action: "hide", reason: "x".repeat(501) })))?.ok).toBe(
      false
    )
    expect(state.calls).toHaveLength(0)
  })

  it("maps GIVE_SELF_REVIEW and GIVE_NOT_ADMIN cleanly without revalidating", async () => {
    state.handler = () => ({ error: { code: "42501", message: "GIVE_SELF_REVIEW" } })
    expect((await moderateReportedWish(CONTRIB, null, form({ action: "hide", reason: "" })))?.message).toContain(
      "một kiểm duyệt viên khác"
    )

    state.handler = () => ({ error: { code: "42501", message: "GIVE_NOT_ADMIN" } })
    expect(
      (await moderateReportedWish(CONTRIB, null, form({ action: "dismiss_reports", reason: "" })))?.message
    ).toContain("Chỉ kiểm duyệt viên hoặc quản trị viên")
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
