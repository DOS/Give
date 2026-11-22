import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const COMMENT = "33333333-3333-4333-8333-333333333333"
const PARENT = "44444444-4444-4444-8444-444444444444"
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

const {
  createComment,
  deleteComment,
  editComment,
  hideCommentAsOrganizer,
  moderateCommentFromCampaign,
  reportComment,
} = await import("./comment-actions")

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
  state.handler = () => ({ data: true })
})

describe("createComment (DOS/Give#250)", () => {
  it("posts top-level comments and 1-level replies with the caller's JWT and revalidates the campaign path", async () => {
    const rootRes = await createComment(CAMPAIGN, SLUG, null, form({ body: "  Chúc chiến dịch thành công!  " }))
    expect(rootRes).toEqual({ ok: true, message: "Đã đăng bình luận." })
    expect(dbAsMock).toHaveBeenCalledWith("user-jwt")
    expect(state.calls[0].target).toBe("rpc:create_campaign_comment")
    expect(op(state.calls[0], "args")?.[0]).toEqual({
      p_campaign_id: CAMPAIGN,
      p_body: "Chúc chiến dịch thành công!",
      p_parent_id: null,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith(`/campaigns/${SLUG}`)

    state.calls.length = 0
    revalidatePathMock.mockClear()
    const replyRes = await createComment(CAMPAIGN, "../bad", null, form({ body: "Cảm ơn bạn!", parent_id: PARENT }))
    expect(replyRes).toEqual({ ok: true, message: "Đã gửi phản hồi." })
    expect(op(state.calls[0], "args")?.[0]).toEqual({
      p_campaign_id: CAMPAIGN,
      p_body: "Cảm ơn bạn!",
      p_parent_id: PARENT,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith("/campaigns/[slug]", "page")
  })

  it("refuses signed-out guests, invalid UUIDs, empty or >2000 char bodies before touching the DB", async () => {
    state.signedIn = false
    expect((await createComment(CAMPAIGN, SLUG, null, form({ body: "Hi" })))?.message).toContain("đăng nhập")
    state.signedIn = true

    expect((await createComment("bad-id", SLUG, null, form({ body: "Hi" })))?.ok).toBe(false)
    expect((await createComment(CAMPAIGN, SLUG, null, form({ body: "   " })))?.ok).toBe(false)
    expect((await createComment(CAMPAIGN, SLUG, null, form({ body: "x".repeat(2001) })))?.ok).toBe(false)
    expect((await createComment(CAMPAIGN, SLUG, null, form({ body: "Hi", parent_id: "bad" })))?.ok).toBe(false)
    expect(state.calls).toHaveLength(0)
  })

  it("maps GIVE_COMMENT_NESTING_NOT_ALLOWED and GIVE_RATE_LIMITED with retry-after seconds", async () => {
    state.handler = () => ({ error: { code: "23514", message: "GIVE_COMMENT_NESTING_NOT_ALLOWED" } })
    expect((await createComment(CAMPAIGN, SLUG, null, form({ body: "Hi", parent_id: PARENT })))?.message).toContain(
      "một cấp"
    )

    state.handler = () => ({ error: { code: "PT429", message: "GIVE_RATE_LIMITED: 45" } })
    expect((await createComment(CAMPAIGN, SLUG, null, form({ body: "Hi" })))?.message).toContain("45 giây")

    state.handler = () => ({ error: { code: "PT429", message: "GIVE_RATE_LIMITED: 125" } })
    expect((await createComment(CAMPAIGN, SLUG, null, form({ body: "Hi" })))?.message).toContain("3 phút")
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe("editComment & deleteComment (DOS/Give#250)", () => {
  it("edits own visible comment and maps GIVE_COMMENT_HIDDEN", async () => {
    const ok = await editComment(COMMENT, SLUG, null, form({ body: "  Đã cập nhật nội dung  " }))
    expect(ok).toEqual({ ok: true, message: "Đã cập nhật bình luận." })
    expect(state.calls[0].target).toBe("rpc:edit_campaign_comment")
    expect(op(state.calls[0], "args")?.[0]).toEqual({ p_comment_id: COMMENT, p_body: "Đã cập nhật nội dung" })

    state.handler = () => ({ error: { code: "23514", message: "GIVE_COMMENT_HIDDEN" } })
    expect((await editComment(COMMENT, SLUG, null, form({ body: "Sửa" })))?.message).toContain("đã bị ẩn")
  })

  it("deletes own comment, revalidates campaign and comment report queue, and handles GIVE_COMMENT_HIDDEN", async () => {
    const ok = await deleteComment(COMMENT, SLUG, null, new FormData())
    expect(ok).toEqual({ ok: true, message: "Đã xóa bình luận." })
    expect(state.calls[0].target).toBe("rpc:delete_campaign_comment")
    expect(op(state.calls[0], "args")?.[0]).toEqual({ p_comment_id: COMMENT })
    expect(revalidatePathMock.mock.calls).toEqual([[`/campaigns/${SLUG}`], ["/admin/reports/comments"]])

    state.handler = () => ({ error: { code: "23514", message: "GIVE_COMMENT_HIDDEN" } })
    expect((await deleteComment(COMMENT, SLUG, null, new FormData()))?.message).toContain("phản hồi đã bị ẩn")
  })
})

describe("hideCommentAsOrganizer, reportComment & moderateCommentFromCampaign (DOS/Give#250)", () => {
  it("hides a comment as organizer and distinguishes transition vs idempotent replay", async () => {
    state.handler = () => ({ data: true })
    const hidden = await hideCommentAsOrganizer(COMMENT, SLUG, null, form({ reason: "  Quảng cáo  " }))
    expect(hidden).toEqual({ ok: true, message: "Đã ẩn bình luận khỏi trang công khai." })
    expect(state.calls[0].target).toBe("rpc:hide_campaign_comment")
    expect(op(state.calls[0], "args")?.[0]).toEqual({ p_comment_id: COMMENT, p_reason: "Quảng cáo" })

    state.handler = () => ({ data: false })
    const replay = await hideCommentAsOrganizer(COMMENT, SLUG, null, form({ reason: "   " }))
    expect(replay).toEqual({ ok: true, message: "Bình luận này đã được ẩn trước đó." })
    expect(op(state.calls[1], "args")?.[0]).toEqual({ p_comment_id: COMMENT, p_reason: null })

    state.handler = () => ({ error: { code: "42501", message: "GIVE_NOT_ALLOWED" } })
    expect((await hideCommentAsOrganizer(COMMENT, SLUG, null, form({ reason: "" })))?.message).toContain(
      "Chỉ người tổ chức"
    )
  })

  it("reports a visible comment, validates 'other' details, and maps self-report & 24h limit", async () => {
    const missingDetails = await reportComment(COMMENT, SLUG, null, form({ reason_code: "other", details: "  " }))
    expect(missingDetails).toEqual({ ok: false, message: "Ghi chi tiết khi chọn lý do “Lý do khác”." })
    expect(state.calls).toHaveLength(0)

    const ok = await reportComment(COMMENT, SLUG, null, form({ reason_code: "personal_data", details: "Lộ SĐT" }))
    expect(ok?.ok).toBe(true)
    expect(state.calls[0].target).toBe("rpc:report_campaign_comment")
    expect(op(state.calls[0], "args")?.[0]).toEqual({
      p_comment_id: COMMENT,
      p_reason_code: "personal_data",
      p_details: "Lộ SĐT",
    })
    expect(revalidatePathMock.mock.calls).toEqual([[`/campaigns/${SLUG}`], ["/admin/reports/comments"]])

    state.handler = () => ({ error: { code: "42501", message: "GIVE_NOT_ALLOWED" } })
    expect(
      (await reportComment(COMMENT, SLUG, null, form({ reason_code: "spam_or_scam", details: "" })))?.message
    ).toBe("Bạn không thể báo cáo bình luận của chính mình.")

    state.handler = () => ({ error: { code: "23514", message: "GIVE_REPORT_LIMIT" } })
    expect(
      (await reportComment(COMMENT, SLUG, null, form({ reason_code: "spam_or_scam", details: "" })))?.message
    ).toContain("20 báo cáo")
  })

  it("supports staff inline moderation and maps GIVE_SELF_REVIEW & GIVE_NOT_ADMIN", async () => {
    state.handler = () => ({ data: 2 })
    const hidden = await moderateCommentFromCampaign(
      COMMENT,
      SLUG,
      null,
      form({ action: "hide", reason: "Ngôn từ thù ghét" })
    )
    expect(hidden).toEqual({ ok: true, message: "Đã ẩn bình luận và chốt 2 báo cáo đang mở." })
    expect(state.calls[0].target).toBe("rpc:moderate_campaign_comment")
    expect(op(state.calls[0], "args")?.[0]).toEqual({
      p_comment_id: COMMENT,
      p_action: "hide",
      p_reason: "Ngôn từ thù ghét",
    })

    state.handler = () => ({ error: { code: "42501", message: "GIVE_SELF_REVIEW" } })
    expect(
      (await moderateCommentFromCampaign(COMMENT, SLUG, null, form({ action: "unhide", reason: "Xem lại" })))?.message
    ).toContain("một kiểm duyệt viên khác")
  })
})
