// @vitest-environment happy-dom
/**
 * Covers the `/admin/reports/comments` moderator queue RSC (`AdminCommentReportsPage`)
 * and its `AdminNav` highlighting under "Báo cáo" (DOS/Give#250, #262).
 */
import { createElement } from "react"
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { COMMENT_REPORTS_PAGE_SIZE, type CommentReportRow } from "@/lib/campaign-comments"
import { MODERATION_ROLES } from "@/lib/evidence-moderation"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const STAFF_USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222"
const COMMENT_VISIBLE = "33333333-3333-4333-8333-333333333333"
const COMMENT_HIDDEN = "44444444-4444-4444-8444-444444444444"
const REPORT_VISIBLE = "55555555-5555-4555-8555-555555555555"
const REPORT_DELETED = "66666666-6666-4666-8666-666666666666"
const REPORT_ACTIONED = "77777777-7777-4777-8777-777777777777"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  session: null as { user: { id: string; email: string | null; name: string | null }; accessToken: string } | null,
}))

const notFoundMock = vi.hoisted(() =>
  vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND")
  })
)
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  })
)
const requireSessionMock = vi.hoisted(() =>
  vi.fn(async (_next?: string) => {
    if (!state.session) throw new Error("NEXT_REDIRECT:/auth/login")
    return state.session
  })
)
const dbAsMock = vi.hoisted(() => vi.fn((_token?: string) => fakeDb((call) => state.handler(call), state.calls)))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
  usePathname: () => "/admin/reports/comments",
}))
vi.mock("@/lib/auth/session", () => ({
  requireSession: requireSessionMock,
  getSession: vi.fn(async () => state.session),
}))
vi.mock("@/lib/supabase", () => ({ dbAs: dbAsMock }))
vi.mock("./actions", () => ({
  resolveCommentReport: vi.fn(async () => null),
  moderateComment: vi.fn(async () => null),
}))

const { default: AdminCommentReportsPage, metadata } = await import("./page")
const { default: AdminLayout } = await import("../../layout")

function reportFixture(reportId: string, overrides: Partial<CommentReportRow> = {}): CommentReportRow {
  return {
    report_id: reportId,
    comment_id: COMMENT_VISIBLE,
    campaign_id: CAMPAIGN_ID,
    campaign_slug: "xay-truong-ban-may",
    campaign_title: "Xây trường Bản Mây",
    comment_parent_id: null,
    comment_body: "Bình luận chứa liên kết https://spam.example <script>alert(1)</script>",
    comment_status: "visible",
    comment_created_at: "2026-11-20T07:00:00.000Z",
    comment_deleted_at: null,
    comment_author_name: "Người viết",
    reason_code: "spam_or_scam",
    details: "Quảng cáo lừa đảo",
    status: "open",
    action_taken: null,
    resolution_note: null,
    handled_by_name: null,
    handled_at: null,
    created_at: "2026-11-20T08:00:00.000Z",
    total_count: 1,
    ...overrides,
  }
}

function parseDoc(html: string) {
  const win = new Window()
  win.document.body.innerHTML = html
  return win.document
}

beforeEach(() => {
  notFoundMock.mockClear()
  redirectMock.mockClear()
  requireSessionMock.mockClear()
  dbAsMock.mockClear()
  state.calls.length = 0
  state.session = {
    user: { id: STAFF_USER, email: "mod@dos.me", name: "Kiểm duyệt viên" },
    accessToken: "mod-jwt",
  }
})

describe("AdminCommentReportsPage (DOS/Give#250)", () => {
  it("sets noindex metadata, requires session, and 404s non-moderator staff", async () => {
    expect(metadata).toEqual({ title: "Báo cáo bình luận", robots: { index: false } })

    state.handler = (call) => (call.target === "rpc:is_admin" ? { data: false } : undefined)
    await expect(AdminCommentReportsPage()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(requireSessionMock).toHaveBeenCalledWith("/admin/reports/comments")
    expect(dbAsMock).toHaveBeenCalledWith("mod-jwt")
    expect(op(state.calls[0], "args")?.[0]).toEqual({ p_roles: MODERATION_ROLES })
  })

  it("renders empty state, report type tabs, and status filters when queue is clear", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:is_admin") return { data: true }
      if (call.target === "rpc:list_comment_reports") return { data: [] }
      return undefined
    }

    const doc = parseDoc(renderToStaticMarkup(await AdminCommentReportsPage()))
    expect(doc.querySelector("h1")?.textContent).toBe("Báo cáo bình luận")
    expect(doc.querySelector('a[href="/admin/reports"]')?.textContent).toContain("Báo cáo chiến dịch")
    expect(doc.querySelector('a[href="/admin/reports/comments"]')?.getAttribute("aria-current")).toBe("page")
    expect(doc.body.textContent).toContain("Không có báo cáo bình luận nào chờ xử lý.")
  })

  it("renders visible, deleted-snapshot, and resolved/hidden comment reports safely with moderation history", async () => {
    const rows: CommentReportRow[] = [
      reportFixture(REPORT_VISIBLE, {
        total_count: 3,
      }),
      reportFixture(REPORT_DELETED, {
        comment_id: null,
        comment_status: "deleted",
        comment_body: "Nội dung bản sao trước khi xóa",
        comment_deleted_at: "2026-11-20T09:00:00.000Z",
        comment_author_name: null,
        reason_code: "harassment_or_hate",
        details: null,
        total_count: 3,
      }),
      reportFixture(REPORT_ACTIONED, {
        comment_id: COMMENT_HIDDEN,
        comment_status: "hidden",
        comment_parent_id: COMMENT_VISIBLE,
        status: "actioned",
        action_taken: "hide",
        resolution_note: "Đã ẩn do ngôn từ xúc phạm.",
        handled_by_name: "Mod A",
        handled_at: "2026-11-20T10:00:00.000Z",
        total_count: 3,
      }),
    ]

    state.handler = (call) => {
      if (call.target === "rpc:is_admin") return { data: true }
      if (call.target === "rpc:list_comment_reports") return { data: rows }
      if (call.target === "rpc:list_comment_moderation_history") {
        const args = op(call, "args")?.[0] as { p_comment_id?: string } | undefined
        if (args?.p_comment_id === COMMENT_HIDDEN) {
          return {
            data: [
              {
                id: 99,
                action: "campaign_comment.moderate_hide",
                actor_display_name: "Mod A",
                before: { status: "visible" },
                after: { status: "hidden", reason: "Vi phạm quy tắc" },
                created_at: "2026-11-20T10:00:00.000Z",
              },
              {
                id: 100,
                action: "comment_reports.moderate",
                actor_display_name: "Mod A",
                before: null,
                after: { resolution_note: "Chốt báo cáo" },
                created_at: "2026-11-20T10:00:01.000Z",
              },
            ],
          }
        }
        return { data: [] }
      }
      return undefined
    }

    const html = renderToStaticMarkup(
      await AdminCommentReportsPage({ searchParams: Promise.resolve({ status: "all" }) })
    )
    const doc = parseDoc(html)

    // XSS safety: script tag is escaped as plain text, never an executable <script> node, and URLs are not clickable links.
    expect([...doc.querySelectorAll("script")].some((s) => s.textContent?.includes("alert(1)"))).toBe(false)
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(doc.querySelector('a[href="https://spam.example"]')).toBeNull()

    const cards = [...doc.querySelectorAll('section[aria-labelledby="comment-reports"] > ul > li')]
    expect(cards).toHaveLength(3)

    // 1. Open report on visible comment: offers both hide (danger) and dismiss (secondary).
    const visibleCard = cards[0]
    expect(visibleCard.textContent).toContain("Bình luận chứa liên kết https://spam.example <script>alert(1)</script>")
    expect(visibleCard.querySelector('button[name="action"][value="hide"]')?.textContent).toContain("Ẩn bình luận")
    expect(visibleCard.querySelector('button[name="action"][value="dismiss"]')?.textContent).toContain("Bác bỏ báo cáo")

    // 2. Open report on deleted comment: shows snapshot label, deleted author fallback, NO hide button, dismiss only!
    const deletedCard = cards[1]
    expect(deletedCard.textContent).toContain("Tác giả đã xóa")
    expect(deletedCard.textContent).toContain("Bản sao nội dung bình luận trước khi bị tác giả xóa")
    expect(deletedCard.textContent).toContain("Nội dung bản sao trước khi xóa")
    expect(deletedCard.textContent).toContain("Người dùng đã xóa tài khoản")
    expect(deletedCard.querySelector('button[name="action"][value="hide"]')).toBeNull()
    expect(deletedCard.querySelector('button[name="action"][value="dismiss"]')).not.toBeNull()

    // 3. Actioned report on hidden reply: shows resolution details, moderation history, and unhide disclosure.
    const actionedCard = cards[2]
    expect(actionedCard.textContent).toContain("Phản hồi")
    expect(actionedCard.textContent).toContain("Đã ẩn bình luận")
    expect(actionedCard.textContent).toContain("Mod A")
    expect(actionedCard.textContent).toContain("Lịch sử kiểm duyệt (2)")
    expect(actionedCard.textContent).toContain("Kiểm duyệt ẩn bình luận")
    expect(actionedCard.textContent).toContain("Chốt báo cáo bình luận")
    expect(actionedCard.textContent).toContain("Vi phạm quy tắc")
    expect(actionedCard.querySelector('input[name="action"][value="unhide"]')).not.toBeNull()

    // Never queries moderation history for null comment_id.
    const historyCalls = state.calls.filter((c) => c.target === "rpc:list_comment_moderation_history")
    expect(historyCalls.map((c) => (op(c, "args")?.[0] as { p_comment_id: string }).p_comment_id)).toEqual([
      COMMENT_VISIBLE,
      COMMENT_HIDDEN,
    ])
  })

  it("paginates reports and redirects out-of-range ?page= back to the last page when OFFSET returns 0 rows", async () => {
    const total = COMMENT_REPORTS_PAGE_SIZE + 2
    state.handler = (call) => {
      if (call.target === "rpc:is_admin") return { data: true }
      if (call.target === "rpc:list_comment_reports") {
        const args = op(call, "args")?.[0] as { p_offset?: number } | undefined
        if ((args?.p_offset ?? 0) >= total) return { data: [] }
        return { data: [reportFixture(REPORT_VISIBLE, { total_count: total })] }
      }
      if (call.target === "rpc:list_comment_moderation_history") return { data: [] }
      return undefined
    }

    const page1 = parseDoc(renderToStaticMarkup(await AdminCommentReportsPage()))
    const nav = page1.querySelector('nav[aria-label="Phân trang báo cáo bình luận"]')!
    expect(nav.textContent).toContain(`Trang 1 / 2 (${total} báo cáo)`)
    expect(nav.querySelector('a[href="/admin/reports/comments?page=2"]')).not.toBeNull()

    await expect(AdminCommentReportsPage({ searchParams: Promise.resolve({ page: "9" }) })).rejects.toThrow(
      "NEXT_REDIRECT:/admin/reports/comments?page=2"
    )
  })

  it("highlights 'Báo cáo' in AdminLayout nav when visiting /admin/reports/comments", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:is_admin") {
        const roles = (op(call, "args")?.[0] as { p_roles?: readonly string[] } | undefined)?.p_roles
        return { data: roles === MODERATION_ROLES }
      }
      return undefined
    }

    const doc = parseDoc(renderToStaticMarkup(await AdminLayout({ children: createElement("div", null, "body") })))
    const reportLink = doc.querySelector('a[href="/admin/reports"]')
    expect(reportLink?.getAttribute("aria-current")).toBe("page")
  })
})
