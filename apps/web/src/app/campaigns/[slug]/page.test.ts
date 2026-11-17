// @vitest-environment happy-dom
/**
 * Covers the public `"Báo cáo chiến dịch"` flow on `/campaigns/[slug]`
 * (`CampaignPage` + `ReportCampaign`, DOS/Give#98): signed-out login prompt,
 * signed-in report form with all structured reasons and secondary button
 * hierarchy, self-report hiding for the organizer, and hiding on non-public
 * preview statuses.
 */
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { REPORT_REASON_LABELS, REPORT_REASONS } from "@/lib/campaign-reports"
import type { CampaignStatus, PublicCampaign } from "@/lib/campaigns"
import { fakeDb, type Call, type Handler } from "@/test/fake-db"

const VIEWER = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const CAMPAIGN = "33333333-3333-4333-8333-333333333333"
const SLUG = "xay-truong-ban-may"

const state = vi.hoisted(() => ({
  anonHandler: (() => undefined) as Handler,
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  anonCalls: [] as Call[],
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  session: null as { user: { id: string; email: string | null; name: string | null }; accessToken: string } | null,
}))

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn }
})
vi.mock("next/navigation", () => ({
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  usePathname: () => `/campaigns/${SLUG}`,
}))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => state.session),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) =>
    token
      ? fakeDb((call) => state.userHandler(call), state.userCalls)
      : fakeDb((call) => state.anonHandler(call), state.anonCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))
vi.mock("./actions", () => ({ reportCampaign: vi.fn(async () => null) }))
vi.mock("@/app/(public)/donations/actions", () => ({ donate: vi.fn(async () => null) }))

const { default: CampaignPage } = await import("./page")

function campaignFixture(status: CampaignStatus = "live"): PublicCampaign {
  return {
    id: CAMPAIGN,
    slug: SLUG,
    type: "give",
    funding_model: "flexible",
    category_id: "cat-1",
    title: "Xây trường Bản Mây",
    summary: "Cùng dựng lớp học mới.",
    story: "Nội dung câu chuyện chi tiết của chiến dịch.",
    beneficiary_name: "Điểm trường Bản Mây",
    beneficiary_relation: "Đơn vị thụ hưởng",
    cover_media_id: null,
    asset: "VND",
    goal_amount: 100_000_000,
    min_contribution: 20_000,
    stretch_goal_amount: null,
    display_options: { progress_bar: true, backers_count: true, time_remaining: true },
    starts_at: null,
    ends_at: "2099-12-31T00:00:00.000Z",
    payment_window_days: 7,
    status,
    submitted_at: "2026-11-10T00:00:00.000Z",
    approved_at: "2026-11-11T00:00:00.000Z",
    outcome_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-11T00:00:00.000Z",
    category: { id: "cat-1", slug: "giao-duc", name: "Giáo dục", icon: null, color: null },
    cover: null,
  }
}

function parseDoc(html: string) {
  const win = new Window()
  win.document.body.innerHTML = html
  return win.document
}

beforeEach(() => {
  state.anonCalls.length = 0
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.session = null
  state.anonHandler = (call) => {
    if (call.target === "campaigns") return { data: campaignFixture("live") }
    if (call.target === "campaign_milestones" || call.target === "campaign_updates") return { data: [] }
    if (call.target === "rpc:public_organizer")
      return { data: [{ display_name: "Quỹ Bản Mây", kind: "organization", verification_status: "verified" }] }
    if (call.target === "public_campaigns")
      return {
        data: {
          campaign_id: CAMPAIGN,
          received_amount: 10_000_000,
          spent_amount: 0,
          refunded_amount: 0,
          supporters_count: 5,
          pledged_amount: 0,
          paid_amount: 0,
          refund_owed_amount: 0,
          backers_count: 0,
          payments_stopped_at: null,
          payments_stopped_note: null,
          own_transfer_amount: 0,
        },
      }
    if (call.target === "public_account_changes") return { data: [] }
    if (call.target === "public_statement") return { data: [], count: 0 }
    return undefined
  }
  state.userHandler = (call) => {
    if (call.target === "rpc:managed_campaigns") return { data: { organizer_id: OTHER } }
    return undefined
  }
  state.serviceHandler = (call) => {
    if (call.target === "rpc:payment_account")
      return { data: [{ bank_bin: "970436", account_number: "0123456789", account_name: "QUY BAN MAY" }] }
    return undefined
  }
})

describe("CampaignPage report flow (DOS/Give#98)", () => {
  it("shows the 'Báo cáo chiến dịch' disclosure with a sign-in link for signed-out visitors", async () => {
    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    const doc = parseDoc(html)

    const summary = [...doc.querySelectorAll("summary")].find((el) => el.textContent?.includes("Báo cáo chiến dịch"))
    expect(summary).toBeDefined()

    const details = summary!.closest("details")!
    expect(details.querySelector('select[name="reason_code"]')).toBeNull()
    const loginLink = details.querySelector('a[href^="/auth/login"]')
    expect(loginLink?.getAttribute("href")).toBe(`/auth/login?return_path=${encodeURIComponent(`/campaigns/${SLUG}`)}`)
    expect(loginLink?.textContent).toContain("Đăng nhập để báo cáo")
    expect(details.querySelector(`a[href="/campaigns/${SLUG}/statement?filter=out"]`)).not.toBeNull()
  })

  it("renders the structured report form with secondary button hierarchy for a signed-in non-organizer", async () => {
    state.session = {
      user: { id: VIEWER, email: "viewer@dos.me", name: "Người xem" },
      accessToken: "viewer-token",
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    const doc = parseDoc(html)

    const summary = [...doc.querySelectorAll("summary")].find((el) => el.textContent?.includes("Báo cáo chiến dịch"))
    expect(summary).toBeDefined()

    const details = summary!.closest("details")!
    const select = details.querySelector('select[name="reason_code"]') as HTMLSelectElement | null
    expect(select).not.toBeNull()
    const values = [...select!.querySelectorAll("option")]
      .map((opt) => opt.getAttribute("value"))
      .filter((v): v is string => Boolean(v))
    expect(values).toEqual([...REPORT_REASONS])
    for (const code of REPORT_REASONS) {
      expect(select!.textContent).toContain(REPORT_REASON_LABELS[code])
    }

    const textarea = details.querySelector('textarea[name="details"]')
    expect(textarea?.getAttribute("maxlength")).toBe("1000")

    const submit = details.querySelector('button[type="submit"]')
    expect(submit?.textContent).toBe("Gửi báo cáo")
    // Funding box keeps 'Ủng hộ' as sole primary CTA; report submit is secondary.
    expect(submit?.className).toContain("btn-secondary")
    expect(submit?.className).not.toContain("btn-primary")
  })

  it("hides 'Báo cáo chiến dịch' from the campaign's own organizer", async () => {
    state.session = {
      user: { id: VIEWER, email: "org@dos.me", name: "Người tổ chức" },
      accessToken: "org-token",
    }
    state.userHandler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: { organizer_id: VIEWER } }
      return undefined
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    expect(html).not.toContain("Báo cáo chiến dịch")
  })

  it("hides 'Báo cáo chiến dịch' on non-public preview statuses", async () => {
    state.session = {
      user: { id: VIEWER, email: "mod@dos.me", name: "Kiểm duyệt viên" },
      accessToken: "mod-token",
    }
    state.anonHandler = () => ({ data: null })
    state.userHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("in_review") }
      if (call.target === "campaign_milestones" || call.target === "campaign_updates") return { data: [] }
      return undefined
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    expect(html).toContain("Bản xem trước")
    expect(html).not.toContain("Báo cáo chiến dịch")
    expect(state.userCalls.some((c) => c.target === "rpc:managed_campaigns")).toBe(false)
  })
})
