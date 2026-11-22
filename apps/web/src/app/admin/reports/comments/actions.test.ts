import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const MODERATOR = "66666666-6666-4666-8666-666666666666"
const REPORT = "77777777-7777-4777-8777-777777777777"
const COMMENT = "88888888-8888-4888-8888-888888888888"

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
    state.signedIn ? { user: { id: MODERATOR, email: "mod@dos.me", name: "Mod" }, accessToken: "mod-jwt" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({ dbAs: dbAsMock }))

const { moderateComment, resolveCommentReport } = await import("./actions")

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
  state.handler = () => ({ data: 1 })
})

describe("resolveCommentReport (DOS/Give#250)", () => {
  it("calls give.resolve_comment_report with caller JWT for hide and dismiss, and handles already-resolved 0", async () => {
    state.handler = () => ({ data: 3 })
    const hid = await resolveCommentReport(REPORT, null, form({ action: "hide", reason: "  Lộ số điện thoại  " }))
    expect(hid).toEqual({ ok: true, message: "Đã ẩn bình luận và chốt 3 báo cáo đang mở." })
    expect(dbAsMock).toHaveBeenCalledWith("mod-jwt")
    expect(state.calls[0].target).toBe("rpc:resolve_comment_report")
    expect(op(state.calls[0], "args")?.[0]).toEqual({
      p_report_id: REPORT,
      p_action: "hide",
      p_reason: "Lộ số điện thoại",
    })
    expect(revalidatePathMock.mock.calls).toEqual([["/admin/reports/comments"], ["/campaigns/[slug]", "page"]])

    state.handler = () => ({ data: 2 })
    const dismissed = await resolveCommentReport(REPORT, null, form({ action: "dismiss", reason: "Không vi phạm" }))
    expect(dismissed).toEqual({ ok: true, message: "Đã bác bỏ 2 báo cáo bình luận." })

    state.handler = () => ({ data: 0 })
    const already = await resolveCommentReport(REPORT, null, form({ action: "dismiss", reason: "Không vi phạm" }))
    expect(already).toEqual({ ok: true, message: "Báo cáo này đã được xử lý trước đó." })
  })

  it("refuses signed-out callers, invalid IDs, invalid actions and empty/>500 reasons before DB calls", async () => {
    state.signedIn = false
    expect((await resolveCommentReport(REPORT, null, form({ action: "dismiss", reason: "x" })))?.message).toContain(
      "Phiên đăng nhập"
    )
    state.signedIn = true

    expect((await resolveCommentReport("bad-id", null, form({ action: "dismiss", reason: "x" })))?.ok).toBe(false)
    expect((await resolveCommentReport(REPORT, null, form({ action: "unhide", reason: "x" })))?.ok).toBe(false)
    expect((await resolveCommentReport(REPORT, null, form({ action: "hide", reason: "   " })))?.ok).toBe(false)
    expect((await resolveCommentReport(REPORT, null, form({ action: "hide", reason: "x".repeat(501) })))?.ok).toBe(
      false
    )
    expect(state.calls).toHaveLength(0)
  })

  it("maps GIVE_SELF_REVIEW, GIVE_NOT_ADMIN and GIVE_COMMENT_NOT_FOUND (deleted comment on hide)", async () => {
    state.handler = () => ({ error: { code: "42501", message: "GIVE_SELF_REVIEW" } })
    expect((await resolveCommentReport(REPORT, null, form({ action: "hide", reason: "x" })))?.message).toContain(
      "một kiểm duyệt viên khác"
    )

    state.handler = () => ({ error: { code: "42501", message: "GIVE_NOT_ADMIN" } })
    expect((await resolveCommentReport(REPORT, null, form({ action: "dismiss", reason: "x" })))?.message).toContain(
      "Chỉ kiểm duyệt viên hoặc quản trị viên"
    )

    state.handler = () => ({ error: { code: "P0002", message: "GIVE_COMMENT_NOT_FOUND" } })
    expect((await resolveCommentReport(REPORT, null, form({ action: "hide", reason: "x" })))?.message).toContain(
      "chỉ có thể bác bỏ báo cáo"
    )
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe("moderateComment (DOS/Give#250)", () => {
  it("calls give.moderate_campaign_comment for hide, unhide, and dismiss_reports", async () => {
    state.handler = () => ({ data: 0 })
    expect(await moderateComment(COMMENT, null, form({ action: "unhide", reason: "Đã xem xét lại" }))).toEqual({
      ok: true,
      message: "Đã hiện lại bình luận trên trang công khai.",
    })
    expect(state.calls[0].target).toBe("rpc:moderate_campaign_comment")
    expect(op(state.calls[0], "args")?.[0]).toEqual({
      p_comment_id: COMMENT,
      p_action: "unhide",
      p_reason: "Đã xem xét lại",
    })

    state.handler = () => ({ data: 2 })
    expect(await moderateComment(COMMENT, null, form({ action: "hide", reason: "Vi phạm" }))).toEqual({
      ok: true,
      message: "Đã ẩn bình luận và chốt 2 báo cáo đang mở.",
    })

    state.handler = () => ({ data: 0 })
    expect(await moderateComment(COMMENT, null, form({ action: "dismiss_reports", reason: "Hợp lệ" }))).toEqual({
      ok: true,
      message: "Không còn báo cáo đang mở nào của bình luận này.",
    })
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/reports/comments")
    expect(revalidatePathMock).toHaveBeenCalledWith("/campaigns/[slug]", "page")
  })

  it("refuses invalid comment ID or action before DB calls", async () => {
    expect((await moderateComment("bad", null, form({ action: "hide", reason: "x" })))?.ok).toBe(false)
    expect((await moderateComment(COMMENT, null, form({ action: "delete", reason: "x" })))?.ok).toBe(false)
    expect(state.calls).toHaveLength(0)
  })
})
