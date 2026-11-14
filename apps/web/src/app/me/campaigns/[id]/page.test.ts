import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignStatus, CampaignType } from "@/lib/campaigns"
import { fakeDb, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  usePathname: () => `/me/campaigns/${CAMPAIGN}`,
}))
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: USER, email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.handler(call), state.calls),
}))

const { default: EditCampaignPage } = await import("./page")

function campaignRow(status: CampaignStatus, type: CampaignType) {
  return {
    id: CAMPAIGN,
    organizer_id: USER,
    slug: "chien-dich-a",
    title: "Chiến dịch thử nghiệm",
    type,
    status,
    category_id: "cat-1",
    summary: "Tóm tắt chiến dịch",
    story: "Câu chuyện dài ít nhất một trăm ký tự để kiểm tra trang chỉnh sửa chiến dịch khi tài khoản nhận gặp sự cố.",
    beneficiary_name: "Người thụ hưởng",
    beneficiary_relation: "Cộng đồng",
    goal_amount: 10_000_000,
    stretch_goal_amount: null,
    min_contribution: 20_000,
    payment_window_days: 7,
    starts_at: null,
    ends_at: "2026-12-31T00:00:00.000Z",
    review_note: "Cần cập nhật lại tài khoản",
    display_options: {},
    cover: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  }
}

function accountWithDisabledBinding() {
  return [
    {
      id: "acc-1",
      owner_user_id: USER,
      channel: "statement_import",
      bank_bin: "970436",
      account_number: "0011012345678",
      account_name: "NGUYEN THI DAO",
      account_kind: "standard",
      public_statement_url: null,
      verification_status: "disabled",
      verification_code: "GIVEV123",
      review_note: null,
      verified_at: "2026-11-01T00:00:00.000Z",
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z",
      bindings: [{ id: "b-1", campaign_id: CAMPAIGN, bound_at: "2026-11-01T00:00:00.000Z", released_at: null }],
    },
  ]
}

function setupUnusableWithTransactions(status: CampaignStatus, type: CampaignType) {
  state.handler = (call) => {
    if (call.target === "rpc:managed_campaigns") return { data: campaignRow(status, type) }
    if (call.target === "categories") return { data: [] }
    if (call.target === "campaign_milestones") return { data: [] }
    if (call.target === "campaign_updates") return { data: [] }
    if (call.target === "reward_tiers") return { data: [] }
    if (call.target === "receiving_accounts") return { data: accountWithDisabledBinding() }
    if (call.target === "organizers") return { data: { legal_name: "Nguyễn Thị Đào", verification_status: "verified" } }
    if (call.target === "bank_transactions") return { data: [{ id: "tx-1" }] }
    if (call.target === "account_swap_requests") return { data: [] }
    return undefined
  }
}

beforeEach(() => {
  state.calls.length = 0
})

describe("EditCampaignPage unusable bound account with recorded transactions (DOS/Give#77)", () => {
  it("guides a sent-back give campaign to the finance-approved swap and hides early release", async () => {
    setupUnusableWithTransactions("changes_requested", "give")
    const html = renderToStaticMarkup(await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) }))
    expect(html).not.toContain(">Nhả tài khoản<")
    expect(html).toContain("đề nghị đổi tài khoản bên dưới")
    expect(html).toContain(">Đổi tài khoản nhận</h3>")
    expect(html).toContain("gửi yêu cầu đổi tài khoản trong mục")
    expect(html).not.toContain("hãy liên hệ đội ngũ Give để được hỗ trợ")
  })

  it("hides early release and directs a draft give campaign to contact Give without offering a swap", async () => {
    setupUnusableWithTransactions("draft", "give")
    const html = renderToStaticMarkup(await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) }))
    expect(html).not.toContain(">Nhả tài khoản<")
    expect(html).not.toContain("Đổi tài khoản nhận")
    expect(html).not.toContain("đề nghị đổi tài khoản bên dưới")
    expect(html).toContain("nếu nó không dùng được nữa, hãy liên hệ đội ngũ Give.")
    expect(html).toContain("hãy liên hệ đội ngũ Give để được hỗ trợ.")
  })

  it("hides early release and directs a sent-back back campaign to contact Give without offering a swap", async () => {
    setupUnusableWithTransactions("changes_requested", "back")
    const html = renderToStaticMarkup(await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) }))
    expect(html).not.toContain(">Nhả tài khoản<")
    expect(html).not.toContain("Đổi tài khoản nhận")
    expect(html).toContain("nếu nó không dùng được nữa, hãy liên hệ đội ngũ Give.")
    expect(html).toContain("hãy liên hệ đội ngũ Give để được hỗ trợ.")
  })
})
