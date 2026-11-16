// @vitest-environment happy-dom
/**
 * Covers the `/admin/reports` moderator queue RSC (`AdminReportsPage`) and
 * `AdminLayout` navigation wiring (DOS/Give#98): session & role guards,
 * empty states, unresolved live/awaiting/succeeded-back/ended cards, button
 * hierarchy (`DESIGN.md` 6: at most one primary button per card), self-review
 * guard, resolved list, and `AdminNav` link visibility by role.
 */
import { createElement } from "react"
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignReport, ReportedCampaign } from "@/lib/campaign-reports"
import { MODERATION_ROLES } from "@/lib/evidence-moderation"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const STAFF_USER = "11111111-1111-4111-8111-111111111111"
const OTHER_ORG = "22222222-2222-4222-8222-222222222222"
const LIVE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const BACK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const CLOSED_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const OWN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const RESOLVED_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"

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
  usePathname: () => "/admin/reports",
}))
vi.mock("@/lib/auth/session", () => ({
  requireSession: requireSessionMock,
  getSession: vi.fn(async () => state.session),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: dbAsMock,
}))
vi.mock("./actions", () => ({ moderateCampaignReports: vi.fn(async () => null) }))

const { default: AdminReportsPage, metadata } = await import("./page")
const { default: AdminLayout } = await import("../layout")

function campaignRow(id: string, overrides: Partial<ReportedCampaign> = {}): ReportedCampaign {
  const organizerId = overrides.organizer_id ?? OTHER_ORG
  return {
    id,
    slug: `chien-dich-${id.slice(0, 4)}`,
    type: "give",
    status: "live",
    title: `Chiến dịch ${id.slice(0, 4)}`,
    organizer_id: organizerId,
    review_note: null,
    payments_stopped_at: null,
    payments_stopped_note: null,
    organizer: {
      user_id: organizerId,
      kind: "organization",
      legal_name: "Quỹ Minh Bạch",
      display_name: "Minh Bạch",
      verification_status: "verified",
    },
    ...overrides,
  }
}

function reportRow(id: string, campaignId: string, overrides: Partial<CampaignReport> = {}): CampaignReport {
  return {
    id,
    campaign_id: campaignId,
    reason_code: "fraud_or_impersonation",
    details: "Nghi mạo danh đơn vị thụ hưởng.",
    status: "open",
    action_taken: null,
    resolution_note: null,
    handled_at: null,
    created_at: "2026-11-16T02:00:00.000Z",
    updated_at: "2026-11-16T02:00:00.000Z",
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
    accessToken: "mod-access-token",
  }
})

describe("AdminReportsPage (DOS/Give#98)", () => {
  it("sets noindex metadata, requires /admin/reports session, and 404s non-moderator staff", async () => {
    expect(metadata).toEqual({ title: "Báo cáo chiến dịch", robots: { index: false } })

    state.handler = (call) => {
      if (call.target === "rpc:is_admin") return { data: false }
      return undefined
    }
    await expect(AdminReportsPage()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(requireSessionMock).toHaveBeenCalledWith("/admin/reports")
    expect(dbAsMock).toHaveBeenCalledWith("mod-access-token")
    expect(op(state.calls[0], "args")?.[0]).toEqual({ p_roles: MODERATION_ROLES })
  })

  it("renders empty states for both #unresolved and #resolved when the queue is clear", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:is_admin") return { data: true }
      if (call.target === "campaign_reports") return { data: [] }
      return undefined
    }

    const doc = parseDoc(renderToStaticMarkup(await AdminReportsPage()))
    expect(doc.querySelector("h1")?.textContent).toBe("Báo cáo chiến dịch")
    expect(doc.querySelector('section[aria-labelledby="unresolved"]')?.textContent).toContain(
      "Không có báo cáo chiến dịch nào chờ xử lý."
    )
    expect(doc.querySelector('section[aria-labelledby="resolved"]')?.textContent).toContain(
      "Chưa có báo cáo chiến dịch nào được xử lý."
    )
  })

  it("renders live, succeeded-back, closed, awaiting-only and own-campaign cards with proper action hierarchy", async () => {
    const unresolvedRows: CampaignReport[] = [
      reportRow("r-live-1", LIVE_ID, {
        status: "awaiting_organizer",
        action_taken: "asked_organizer",
        resolution_note: "Đề nghị gửi giấy xác nhận bệnh viện.",
        handled_at: "2026-11-16T03:00:00.000Z",
      }),
      reportRow("r-live-2", LIVE_ID, {
        reason_code: "other",
        details: "Báo cáo mới bổ sung.",
        status: "open",
        created_at: "2026-11-16T04:00:00.000Z",
      }),
      reportRow("r-back", BACK_ID, {
        reason_code: "misuse_of_funds",
        details: null,
        status: "awaiting_organizer",
        action_taken: "asked_organizer",
        resolution_note: "Đã hỏi lần 1.",
        handled_at: "2026-11-16T05:00:00.000Z",
      }),
      reportRow("r-closed", CLOSED_ID, { reason_code: "false_or_misleading" }),
      reportRow("r-own", OWN_ID, { reason_code: "prohibited_or_harmful" }),
    ]
    const resolvedRows: CampaignReport[] = [
      reportRow("r-done", RESOLVED_ID, {
        status: "dismissed",
        action_taken: "dismissed",
        resolution_note: "Chứng từ đầy đủ, không vi phạm.",
        handled_at: "2026-11-16T06:00:00.000Z",
      }),
    ]
    const campaigns: ReportedCampaign[] = [
      campaignRow(LIVE_ID, { title: "Trường học Vùng Cao", status: "live" }),
      campaignRow(BACK_ID, {
        title: "Đèn bàn thủ công",
        type: "back",
        status: "succeeded",
        payments_stopped_at: "2026-11-16T01:00:00.000Z",
        payments_stopped_note: "Tạm dừng để xác minh.",
      }),
      campaignRow(CLOSED_ID, { title: "Chiến dịch Đã Đóng", status: "closed" }),
      campaignRow(OWN_ID, { title: "Chiến dịch Của Tôi", organizer_id: STAFF_USER }),
      campaignRow(RESOLVED_ID, { title: "Chiến dịch Đã Xử Lý", status: "live" }),
    ]

    state.handler = (call) => {
      if (call.target === "rpc:is_admin") return { data: true }
      if (call.target === "campaign_reports") {
        const statuses = op(call, "in")?.[1] as string[] | undefined
        return { data: statuses?.includes("open") ? unresolvedRows : resolvedRows }
      }
      if (call.target === "rpc:managed_campaigns") return { data: campaigns }
      return undefined
    }

    const doc = parseDoc(renderToStaticMarkup(await AdminReportsPage()))
    const cards = [...doc.querySelectorAll('section[aria-labelledby="unresolved"] > ul > li')]
    expect(cards).toHaveLength(4)

    // 1. Live campaign with both open and awaiting reports: ask_organizer + dismiss + suspend; at most 1 primary button.
    const liveCard = cards[0]
    expect(liveCard.textContent).toContain("Trường học Vùng Cao")
    expect(liveCard.textContent).toContain("1 chờ xem xét · 1 chờ người tổ chức phản hồi")
    expect(liveCard.textContent).toContain("Đề nghị gửi giấy xác nhận bệnh viện.")
    expect(liveCard.querySelector('button[value="ask_organizer"]')?.textContent).toBe("Hỏi người tổ chức")
    expect(liveCard.querySelector('button[value="dismiss"]')?.textContent).toBe("Bác bỏ báo cáo")
    expect(liveCard.querySelector('input[name="action"][value="suspend"]')).not.toBeNull()
    expect(liveCard.querySelector('textarea[name="public_note"]')).toBeNull()
    expect(liveCard.querySelectorAll(".btn-primary")).toHaveLength(1)

    // 2. Succeeded back campaign with awaiting-only report (open_count === 0) and stopped payments:
    // hides ask_organizer, shows stop_payment_requests with prefilled public_note.
    const backCard = cards[1]
    expect(backCard.textContent).toContain("Đèn bàn thủ công")
    expect(backCard.textContent).toContain("(không ghi chi tiết)")
    expect(backCard.querySelector('button[value="ask_organizer"]')).toBeNull()
    expect(backCard.querySelector('button[value="dismiss"]')).not.toBeNull()
    expect(backCard.querySelector('input[name="action"][value="stop_payment_requests"]')).not.toBeNull()
    expect(backCard.querySelector('textarea[name="public_note"]')?.textContent).toBe("Tạm dừng để xác minh.")
    expect(backCard.querySelectorAll(".btn-primary")).toHaveLength(0)

    // 3. Closed give campaign: neither suspend nor stop_payment_requests; explains why.
    const closedCard = cards[2]
    expect(closedCard.textContent).toContain("Chiến dịch Đã Đóng")
    expect(closedCard.textContent).toContain("Chiến dịch đã kết thúc gây quỹ nên không còn tạm dừng được")
    expect(closedCard.querySelector('input[name="action"][value="suspend"]')).toBeNull()
    expect(closedCard.querySelector('input[name="action"][value="stop_payment_requests"]')).toBeNull()

    // 4. Moderator's own campaign: hides all forms and warns against self-review.
    const ownCard = cards[3]
    expect(ownCard.textContent).toContain("Chiến dịch Của Tôi")
    expect(ownCard.textContent).toContain("Đây là chiến dịch của bạn; một kiểm duyệt viên khác cần xử lý")
    expect(ownCard.querySelectorAll("form")).toHaveLength(0)

    // Resolved section: read-only summary with decision badge and moderator note.
    const resolvedSection = doc.querySelector('section[aria-labelledby="resolved"]')!
    expect(resolvedSection.textContent).toContain("Chiến dịch Đã Xử Lý")
    expect(resolvedSection.textContent).toContain("Bác bỏ báo cáo")
    expect(resolvedSection.textContent).toContain("Chứng từ đầy đủ, không vi phạm.")
    expect(resolvedSection.querySelectorAll("form")).toHaveLength(0)
  })
})

describe("AdminLayout navigation link for /admin/reports (DOS/Give#98)", () => {
  it("shows 'Báo cáo' (/admin/reports) for moderators/admins and hides it for finance-only staff", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:is_admin") {
        const roles = (op(call, "args")?.[0] as { p_roles?: readonly string[] } | undefined)?.p_roles
        return { data: roles === MODERATION_ROLES }
      }
      return undefined
    }
    const modHtml = renderToStaticMarkup(await AdminLayout({ children: createElement("div", null, "body") }))
    const modDoc = parseDoc(modHtml)
    const reportLink = modDoc.querySelector('a[href="/admin/reports"]')
    expect(reportLink?.textContent).toContain("Báo cáo")
    expect(reportLink?.getAttribute("aria-current")).toBe("page")

    state.handler = (call) => {
      if (call.target === "rpc:is_admin") {
        const roles = (op(call, "args")?.[0] as { p_roles?: readonly string[] } | undefined)?.p_roles
        return { data: roles === FINANCE_ROLES }
      }
      return undefined
    }
    const finHtml = renderToStaticMarkup(await AdminLayout({ children: createElement("div", null, "body") }))
    const finDoc = parseDoc(finHtml)
    expect(finDoc.querySelector('a[href="/admin/reports"]')).toBeNull()
    expect(finDoc.querySelector('a[href="/admin/accounts"]')).not.toBeNull()
  })
})
