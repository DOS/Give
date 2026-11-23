// @vitest-environment happy-dom
/**
 * Covers `/admin/reports/wishes` moderator queue (`AdminWishReportsPage`,
 * DOS/Give#320): noindex metadata, moderator/admin gate, status filtering,
 * anonymous masking, XSS-safe plain-text rendering, and hide/restore/dismiss controls.
 */
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ReportedWishRow } from "@/lib/donor-wishes"
import { MODERATION_ROLES } from "@/lib/evidence-moderation"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const STAFF_USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222"
const CONTRIB_VISIBLE = "33333333-3333-4333-8333-333333333333"
const CONTRIB_HIDDEN = "44444444-4444-4444-8444-444444444444"
const REPORT_OPEN = "55555555-5555-4555-8555-555555555555"
const REPORT_RESOLVED = "66666666-6666-4666-8666-666666666666"

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
  usePathname: () => "/admin/reports/wishes",
}))
vi.mock("@/lib/auth/session", () => ({
  requireSession: requireSessionMock,
  getSession: vi.fn(async () => state.session),
}))
vi.mock("@/lib/supabase", () => ({ dbAs: dbAsMock }))
vi.mock("./actions", () => ({
  moderateReportedWish: vi.fn(async () => null),
}))

const { default: AdminWishReportsPage, metadata } = await import("./page")

function reportFixture(reportId: string, overrides: Partial<ReportedWishRow> = {}): ReportedWishRow {
  return {
    report_id: reportId,
    contribution_id: CONTRIB_VISIBLE,
    campaign_id: CAMPAIGN_ID,
    campaign_slug: "xay-truong-ban-may",
    campaign_title: "Xây trường Bản Mây",
    donor_display_name: "Nguyễn An",
    is_anonymous: false,
    amount: 500_000,
    message: "Lời chúc chứa mã độc <script>alert(1)</script>",
    message_hidden_at: null,
    message_hidden_role: null,
    message_hide_reason: null,
    reason: "Quảng cáo rác",
    status: "open",
    resolved_by_name: null,
    resolved_at: null,
    created_at: "2026-11-22T08:00:00.000Z",
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
  requireSessionMock.mockClear()
  dbAsMock.mockClear()
  state.calls.length = 0
  state.session = {
    user: { id: STAFF_USER, email: "mod@dos.me", name: "Kiểm duyệt viên" },
    accessToken: "mod-jwt",
  }
})

describe("AdminWishReportsPage (DOS/Give#320)", () => {
  it("sets noindex metadata, requires session, and 404s non-moderator staff", async () => {
    expect(metadata).toEqual({ title: "Báo cáo lời chúc", robots: { index: false } })

    state.handler = (call) => (call.target === "rpc:is_admin" ? { data: false } : undefined)
    await expect(AdminWishReportsPage()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(requireSessionMock).toHaveBeenCalledWith("/admin/reports/wishes")
    expect(dbAsMock).toHaveBeenCalledWith("mod-jwt")
    expect(op(state.calls[0], "args")?.[0]).toEqual({ p_roles: MODERATION_ROLES })
  })

  it("renders open wish reports with plain-text escaping, anonymous masking, and clear moderation buttons", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:is_admin") return { data: true }
      if (call.target === "rpc:list_reported_contribution_messages") {
        return {
          data: [
            reportFixture(REPORT_OPEN),
            reportFixture(REPORT_RESOLVED, {
              contribution_id: CONTRIB_HIDDEN,
              donor_display_name: "Tên Bị Che",
              is_anonymous: true,
              message_hidden_at: "2026-11-22T08:30:00.000Z",
              message_hidden_role: "owner",
              message_hide_reason: "Chủ chiến dịch tạm ẩn",
              total_count: 2,
            }),
          ],
        }
      }
      return undefined
    }

    const html = renderToStaticMarkup(await AdminWishReportsPage({ searchParams: Promise.resolve({ status: "open" }) }))
    const doc = parseDoc(html)

    expect(doc.querySelector("h1")?.textContent).toBe("Báo cáo lời chúc")
    // Zero XSS script tags rendered inside the wish reports list; literal text escaped
    expect(doc.querySelector('section[aria-labelledby="wish-reports"]')?.querySelectorAll("script")).toHaveLength(0)
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(doc.body.textContent).toContain("<script>alert(1)</script>")
    // Anonymous donor name is masked even if raw display_name were present
    expect(doc.body.textContent).toContain("Người ủng hộ ẩn danh")
    expect(doc.body.textContent).not.toContain("Tên Bị Che")
    // Navigation tabs include campaigns, comments, and wishes
    expect(html).toContain("/admin/reports/comments")
    expect(html).toContain("/admin/reports/wishes")
    // Open actions include hide, dismiss_reports, and restore warning for already-hidden wish
    expect(doc.body.textContent).toContain("Ẩn lời chúc & chốt báo cáo")
    expect(doc.body.textContent).toContain("Xác nhận ẩn & chốt báo cáo")
    expect(doc.body.textContent).toContain(
      "Bấm “Xác nhận ẩn & chốt báo cáo” để nâng thành quyết định kiểm duyệt và đóng báo cáo"
    )
    expect(doc.body.textContent).toContain("Bác bỏ báo cáo")
    expect(doc.body.textContent).toContain("Khôi phục lời chúc (giữ báo cáo mở)")
    expect(doc.body.textContent).not.toContain("trên tổng số")
  })

  it("shows clear Vietnamese truncation note when totalCount exceeds returned reports (DOS/Give#331)", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:is_admin") return { data: true }
      if (call.target === "rpc:list_reported_contribution_messages") {
        return {
          data: [reportFixture(REPORT_OPEN, { total_count: 75 }), reportFixture(REPORT_RESOLVED, { total_count: 75 })],
        }
      }
      return undefined
    }

    const openHtml = renderToStaticMarkup(
      await AdminWishReportsPage({ searchParams: Promise.resolve({ status: "open" }) })
    )
    expect(openHtml).toContain("Đang hiển thị 2 báo cáo sớm nhất trên tổng số 75 báo cáo.")

    state.handler = (call) => {
      if (call.target === "rpc:is_admin") return { data: true }
      if (call.target === "rpc:list_reported_contribution_messages") {
        return {
          data: [reportFixture(REPORT_RESOLVED, { status: "resolved", total_count: 60 })],
        }
      }
      return undefined
    }

    const resolvedHtml = renderToStaticMarkup(
      await AdminWishReportsPage({ searchParams: Promise.resolve({ status: "resolved" }) })
    )
    expect(resolvedHtml).toContain("Đang hiển thị 1 báo cáo mới nhất trên tổng số 60 báo cáo.")
  })

  it("renders empty state cleanly and passes resolved filter to RPC", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:is_admin") return { data: true }
      if (call.target === "rpc:list_reported_contribution_messages") return { data: [] }
      return undefined
    }

    const html = renderToStaticMarkup(
      await AdminWishReportsPage({ searchParams: Promise.resolve({ status: "resolved" }) })
    )
    expect(op(state.calls[1], "args")?.[0]).toEqual({ p_status: "resolved", p_limit: 50 })
    expect(html).toContain("Không có báo cáo lời chúc nào khớp bộ lọc.")
  })
})
