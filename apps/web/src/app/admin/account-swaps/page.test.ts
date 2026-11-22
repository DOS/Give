import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SwapForReview } from "@/lib/account-swaps"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const REVIEWER = "66666666-6666-4666-8666-666666666666"
const OWNER = "11111111-1111-4111-8111-111111111111"
const DUE_CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const PAID_CAMPAIGN = "33333333-3333-4333-8333-333333333333"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  usePathname: () => "/admin/account-swaps",
}))
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: REVIEWER, email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.handler(call), state.calls),
}))

const { default: AdminAccountSwapsPage } = await import("./page")

function pendingSwapRow(id: string, campaignId: string, title: string): SwapForReview {
  return {
    id,
    campaign_id: campaignId,
    old_binding_id: `b-${id}`,
    new_receiving_account_id: `a-new-${id}`,
    new_binding_id: null,
    reason: "Ngân hàng đã đóng tài khoản cũ.",
    status: "pending",
    decided_at: null,
    decision_note: null,
    public_note: null,
    created_at: "2026-11-22T01:00:00Z",
    campaign: {
      id: campaignId,
      slug: `slug-${id}`,
      title,
      status: "succeeded",
      type: "back",
      payments_stopped_at: null,
    },
    new_account: {
      id: `a-new-${id}`,
      owner_user_id: OWNER,
      channel: "statement_import",
      bank_bin: "970422",
      account_number: "920002220002",
      account_name: "NGUYEN THI DAO",
      verification_status: "verified",
      review_note: null,
      organizer: { legal_name: "Nguyễn Thị Đào", display_name: "Đào", verification_status: "verified" },
    },
    old_binding: {
      id: `b-${id}`,
      bound_at: "2026-11-01T00:00:00Z",
      released_at: null,
      account: {
        id: `a-old-${id}`,
        owner_user_id: OWNER,
        channel: "statement_import",
        bank_bin: "970436",
        account_number: "920001110001",
        account_name: "NGUYEN THI DAO",
        verification_status: "disabled",
        review_note: "Khóa do ngân hàng đóng",
      },
    },
  }
}

beforeEach(() => {
  state.calls.length = 0
  state.handler = () => undefined
})

describe("AdminAccountSwapsPage (DOS/Give#92)", () => {
  it("returns 404 when the caller does not hold a finance or admin role", async () => {
    state.handler = (call) => (call.target === "rpc:is_admin" ? { data: false } : undefined)
    await expect(AdminAccountSwapsPage()).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("enables approval for a succeeded back campaign with payments due and blocks one with none", async () => {
    const dueSwap = pendingSwapRow("swap-due", DUE_CAMPAIGN, "Đèn ngủ gỗ còn chờ thanh toán")
    const paidSwap = pendingSwapRow("swap-paid", PAID_CAMPAIGN, "Đèn ngủ gỗ đã thanh toán đủ")

    state.handler = (call) => {
      if (call.target === "rpc:is_admin") return { data: true }
      if (call.target === "account_swap_requests") {
        return op(call, "eq")?.[1] === "pending" ? { data: [dueSwap, paidSwap] } : { data: [] }
      }
      if (call.target === "bank_transactions") return { count: 2 }
      if (call.target === "contributions") {
        return op(call, "eq")?.[1] === DUE_CAMPAIGN ? { data: [{ id: "pledge-1" }] } : { data: [] }
      }
      return undefined
    }

    const html = renderToStaticMarkup(await AdminAccountSwapsPage())
    expect(html).toContain("dự án có quà tặng đã đạt mục tiêu nhưng còn cam kết chờ thanh toán")
    expect(html).toContain("Đèn ngủ gỗ còn chờ thanh toán")
    expect(html).toContain("Đèn ngủ gỗ đã thanh toán đủ")
    expect(html).toContain("Duyệt đổi tài khoản")
    expect(html).toContain("không còn cam kết nào đang chờ thanh toán")
    // Only the due swap gets an approve button; the settled one gets the block callout instead.
    expect(html.match(/>Duyệt đổi tài khoản</g)).toHaveLength(1)
  })
})
