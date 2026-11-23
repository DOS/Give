// @vitest-environment happy-dom
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignStatus, PublicCampaign } from "@/lib/campaigns"
import { fakeDb, type Call, type Handler } from "@/test/fake-db"

const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333"
const SLUG = "xay-truong-ban-may"

const state = vi.hoisted(() => ({
  anonHandler: (() => undefined) as Handler,
  anonCalls: [] as Call[],
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
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => state.session),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.anonHandler(call), state.anonCalls),
  dbService: () => {
    throw new Error("dbService must not be called on StatementPage")
  },
}))
vi.mock("./actions", () => ({ reportEvidence: vi.fn(async () => null) }))

const { default: StatementPage } = await import("./page")

function campaignFixture(status: CampaignStatus = "live", extra: Partial<PublicCampaign> = {}): PublicCampaign {
  return {
    id: CAMPAIGN_ID,
    slug: SLUG,
    type: "give",
    funding_model: "flexible",
    category_id: "cat-1",
    title: "Xây trường Bản Mây",
    summary: "Cùng dựng lớp học mới.",
    story: "Nội dung chi tiết.",
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
    ...extra,
  }
}

const TOTALS_ROW = {
  id: CAMPAIGN_ID,
  type: "give",
  asset: "VND",
  goal_amount: 100_000_000,
  pledged_amount: 0,
  paid_amount: 2_500_000,
  disbursable_amount: 2_500_000,
  disbursed_amount: 700_000,
  refunded_amount: 100_000,
  unexplained_out_amount: 200_000,
  unexplained_out_count: 1,
  supporters_count: 5,
  other_in_amount: 0,
  refund_owed_amount: 0,
  backers_count: 0,
  payments_stopped_at: null,
  payments_stopped_note: null,
  own_transfer_amount: 0,
}

function parseDoc(html: string) {
  const win = new Window()
  win.document.body.innerHTML = html
  return win.document
}

beforeEach(() => {
  state.anonCalls.length = 0
  state.session = null
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://give.dos.me")
  state.anonHandler = (call) => {
    if (call.target === "campaigns") return { data: campaignFixture("live") }
    if (call.target === "public_campaigns") return { data: TOTALS_ROW }
    if (call.target === "public_statement") return { data: [], count: 0 }
    if (call.target === "public_account_changes") return { data: [] }
    if (call.target === "public_disbursement_evidence") return { data: [] }
    return undefined
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("StatementPage export controls & print masthead (DOS/Give#336)", () => {
  it("renders CSV download link and print button inside a print:hidden bar and includes a print-only masthead", async () => {
    const html = renderToStaticMarkup(
      await StatementPage({
        params: Promise.resolve({ slug: SLUG }),
        searchParams: Promise.resolve({}),
      })
    )
    const doc = parseDoc(html)

    const csvLink = doc.querySelector(`a[href="/campaigns/${SLUG}/statement/export"]`)
    expect(csvLink).not.toBeNull()
    expect(csvLink?.textContent).toContain("Tải CSV sao kê")
    expect(csvLink?.getAttribute("download")).toBe(`sao-ke-${SLUG}.csv`)
    expect(csvLink?.closest(".print\\:hidden")).not.toBeNull()

    const printButton = [...doc.querySelectorAll("button")].find((b) => b.textContent?.includes("In / Lưu PDF"))
    expect(printButton).toBeDefined()
    expect(printButton?.closest(".print\\:hidden")).not.toBeNull()

    const masthead = doc.querySelector(".print-only")
    expect(masthead).not.toBeNull()
    expect(masthead?.className).toContain("hidden")
    expect(masthead?.className).toContain("print:block")
    expect(masthead?.textContent).toContain("Xây trường Bản Mây")
    expect(masthead?.textContent).toContain(`https://give.dos.me/campaigns/${SLUG}/statement`)
    expect(masthead?.querySelector("a")?.getAttribute("href")).toBe(`https://give.dos.me/campaigns/${SLUG}/statement`)
    expect(masthead?.textContent).toContain("In lúc:")
    expect(masthead?.textContent).not.toContain("Trang 1/")
    expect(masthead?.textContent?.replace(/\u00a0/g, " ")).toContain("2.500.000 ₫")
    expect(masthead?.textContent?.replace(/\u00a0/g, " ")).toContain("1.700.000 ₫")
  })

  it("shows pagination context in the print-only masthead for multi-page statements", async () => {
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("live") }
      if (call.target === "public_campaigns") return { data: TOTALS_ROW }
      if (call.target === "public_statement") {
        return {
          data: Array.from({ length: 50 }, (_, idx) => ({
            id: `tx-${idx}`,
            direction: "in",
            asset: "VND",
            amount: 100_000,
            booked_at: "2026-11-10T02:30:00.000Z",
            booked_date_only: false,
            after_close: false,
            matched: true,
            counterparty_account_masked: null,
            explained: null,
            purpose: null,
            category: null,
            recipient: null,
            is_refund: null,
            explained_at: null,
            donor_name: "Cô Ba",
            donor_anonymous: false,
            in_explanation: null,
            in_explained_at: null,
            own_transfer_id: null,
            own_transfer_at: null,
            own_transfer_label: null,
            return_of: null,
            returned_by: null,
            returned_at: null,
            return_bank_fee: null,
          })),
          count: 120,
        }
      }
      if (call.target === "public_account_changes") return { data: [] }
      if (call.target === "public_disbursement_evidence") return { data: [] }
      return undefined
    }

    const html = renderToStaticMarkup(
      await StatementPage({
        params: Promise.resolve({ slug: SLUG }),
        searchParams: Promise.resolve({ page: "2" }),
      })
    )
    const doc = parseDoc(html)
    expect(doc.querySelector(".print-only")?.textContent).toContain("Trang 2/3 (50/120 giao dịch)")
  })

  it("preserves active filter on the CSV export link and shows active filter in the print masthead", async () => {
    const html = renderToStaticMarkup(
      await StatementPage({
        params: Promise.resolve({ slug: SLUG }),
        searchParams: Promise.resolve({ filter: "out" }),
      })
    )
    const doc = parseDoc(html)

    const csvLink = doc.querySelector(`a[href="/campaigns/${SLUG}/statement/export?filter=out"]`)
    expect(csvLink).not.toBeNull()
    expect(doc.querySelector(".print-only")?.textContent).toContain("Bộ lọc: Tiền ra")
  })

  it.each(["draft", "approved", "suspended", "cancelled"] as const)(
    "calls notFound() for non-public campaign status %s",
    async (status) => {
      state.anonHandler = (call) => {
        if (call.target === "campaigns") {
          return { data: campaignFixture(status, status === "approved" ? { prelaunch_public: true } : {}) }
        }
        return undefined
      }
      await expect(
        StatementPage({
          params: Promise.resolve({ slug: SLUG }),
          searchParams: Promise.resolve({}),
        })
      ).rejects.toThrow("NEXT_NOT_FOUND")
    }
  )
})
