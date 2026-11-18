import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { CampaignStatus } from "@/lib/campaigns"
import { MAX_TIERS, type RewardTier } from "@/lib/reward-tiers"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }))
vi.mock("@/lib/supabase", () => ({ dbAs: vi.fn(), dbService: vi.fn() }))

const { FulfillmentLink, RewardTiersSection } = await import("./RewardTiersSection")

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TIER_A = "11111111-1111-4111-8111-111111111111"
const TIER_B = "33333333-3333-4333-8333-333333333333"
const TIER_C = "55555555-5555-4555-8555-555555555555"

function makeTier(overrides: Partial<RewardTier> & { id: string; title: string; sort_order: number }): RewardTier {
  return {
    campaign_id: CAMPAIGN,
    description: null,
    min_amount: 100_000,
    quantity_limit: null,
    quantity_claimed: 0,
    estimated_delivery: null,
    requires_shipping: false,
    shipping_note: null,
    status: "active",
    retired_at: null,
    ...overrides,
  }
}

function renderSection(status: CampaignStatus, tiers: RewardTier[] | null, minContribution = 50_000): string {
  return renderToStaticMarkup(
    createElement(RewardTiersSection, {
      campaignId: CAMPAIGN,
      status,
      minContribution,
      tiers,
    })
  ).replace(/\u00a0/g, " ")
}

describe("RewardTiersSection (DOS/Give#217)", () => {
  describe("null and empty tier states", () => {
    it("renders a danger Callout when tiers is null and hides the add-tier form", () => {
      const html = renderSection("draft", null)
      expect(html).toContain("bg-danger-soft")
      expect(html).toContain("text-danger")
      expect(html).toContain("Không tải được các mức phần thưởng. Hãy tải lại trang.")
      expect(html).not.toContain("Thêm mức phần thưởng")
    })

    it("renders editable empty copy with an open add-tier disclosure vs read-only empty copy when tiers is []", () => {
      const editableHtml = renderSection("draft", [])
      expect(editableHtml).toContain(
        "Chưa có mức nào. Không có mức nào thì người ủng hộ chỉ cam kết mà không nhận quà."
      )
      expect(editableHtml).toMatch(/<details[^>]*open[^>]*>[\s\S]*?Thêm mức phần thưởng/)

      const readOnlyHtml = renderSection("live", [])
      expect(readOnlyHtml).toContain("Dự án không có mức phần thưởng nào.")
      expect(readOnlyHtml).not.toContain("Thêm mức phần thưởng")
    })
  })

  describe("editable statuses (draft, changes_requested)", () => {
    it.each(["draft", "changes_requested"] as const)(
      "orders rows via sortTiers in %s, gates move buttons on first/last tiers, and renders delete and edit controls",
      (status) => {
        const html = renderSection(status, [
          makeTier({
            id: TIER_C,
            title: "Mức cuối",
            sort_order: 2,
            min_amount: 500_000,
            quantity_limit: 20,
            quantity_claimed: 5,
            estimated_delivery: "2027-04-01",
            requires_shipping: true,
            shipping_note: "Chỉ giao nội thành",
          }),
          makeTier({ id: TIER_B, title: "Mức giữa", sort_order: 0, min_amount: 300_000 }),
          makeTier({ id: TIER_A, title: "Mức đầu", sort_order: 0, min_amount: 150_000 }),
        ])

        const items = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map((m) => m[0])
        expect(items).toHaveLength(3)

        // sortTiers orders by sort_order ascending, breaking ties by id ascending (TIER_A before TIER_B, then TIER_C).
        expect(items[0]).toMatch(/<h3[^>]*>Mức đầu<\/h3>/)
        expect(items[0]).not.toContain("↑ Lên")
        expect(items[0]).toContain('↓ Xuống<span class="sr-only">: Mức đầu</span>')
        expect(items[0]).toContain('Xóa<span class="sr-only"> mức Mức đầu</span>')
        expect(items[0]).toContain('aria-label="Sửa mức này: Mức đầu"')
        expect(items[0]).toContain('Lưu phần thưởng<span class="sr-only">: Mức đầu</span>')

        expect(items[1]).toMatch(/<h3[^>]*>Mức giữa<\/h3>/)
        expect(items[1]).toContain('↑ Lên<span class="sr-only">: Mức giữa</span>')
        expect(items[1]).toContain('↓ Xuống<span class="sr-only">: Mức giữa</span>')
        expect(items[1]).toContain('Xóa<span class="sr-only"> mức Mức giữa</span>')
        expect(items[1]).toContain('aria-label="Sửa mức này: Mức giữa"')
        expect(items[1]).toContain('Lưu phần thưởng<span class="sr-only">: Mức giữa</span>')

        expect(items[2]).toMatch(/<h3[^>]*>Mức cuối<\/h3>/)
        expect(items[2]).toContain('↑ Lên<span class="sr-only">: Mức cuối</span>')
        expect(items[2]).not.toContain("↓ Xuống")
        expect(items[2]).toContain('Xóa<span class="sr-only"> mức Mức cuối</span>')
        expect(items[2]).toContain('aria-label="Sửa mức này: Mức cuối"')
        expect(items[2]).toContain('Lưu phần thưởng<span class="sr-only">: Mức cuối</span>')
        expect(items[2]).toContain("Giao hàng: Chỉ giao nội thành")

        expect(html).toContain("Thêm mức phần thưởng")
        expect(html).not.toContain("Ngừng nhận mức này")
      }
    )

    it("shows 'Thêm mức phần thưởng' below MAX_TIERS and hides it once ordered.length >= MAX_TIERS", () => {
      const makeMany = (count: number) =>
        Array.from({ length: count }, (_, i) =>
          makeTier({
            id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
            title: `Mức ${i + 1}`,
            sort_order: i,
          })
        )

      expect(renderSection("draft", makeMany(MAX_TIERS - 1))).toContain("Thêm mức phần thưởng")
      expect(renderSection("draft", makeMany(MAX_TIERS))).not.toContain("Thêm mức phần thưởng")
    })
  })

  describe("non-editable RETIRABLE_STATUSES (approved, live, suspended) and terminal statuses", () => {
    it.each(["approved", "live", "suspended"] as const)(
      "in %s hides edit/move/delete controls and differentiates unclaimed active, claimed active, and retired tiers",
      (status) => {
        const html = renderSection(status, [
          makeTier({ id: TIER_A, title: "Chưa ai chọn", sort_order: 0, status: "active", quantity_claimed: 0 }),
          makeTier({ id: TIER_B, title: "Đã có người chọn", sort_order: 1, status: "active", quantity_claimed: 3 }),
          makeTier({
            id: TIER_C,
            title: "Mức đã khóa",
            sort_order: 2,
            status: "retired",
            quantity_claimed: 0,
            retired_at: "2026-11-12T00:00:00Z",
          }),
        ])

        expect(html).not.toContain("↑ Lên")
        expect(html).not.toContain("↓ Xuống")
        expect(html).not.toContain(">Xóa<")
        expect(html).not.toContain("Sửa mức này")
        expect(html).not.toContain("Thêm mức phần thưởng")

        const items = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map((m) => m[0])
        expect(items).toHaveLength(3)

        // Active with 0 claimed -> canRetireTier is true -> offers "Ngừng nhận mức này" with tier.title context.
        expect(items[0]).toMatch(/<h3[^>]*>Chưa ai chọn<\/h3>/)
        expect(items[0]).toContain('Ngừng nhận mức này<span class="sr-only">: Chưa ai chọn</span>')
        expect(items[0]).not.toContain("Đã có người cam kết nên mức này không ngừng nhận được.")
        expect(items[0]).not.toContain("Đã ngừng nhận cam kết mới (ẩn khỏi trang dự án).")

        // Active with quantity_claimed > 0 -> explains why retiring is unavailable.
        expect(items[1]).toContain("Đã có người chọn")
        expect(items[1]).not.toContain("Ngừng nhận mức này")
        expect(items[1]).toContain("Đã có người cam kết nên mức này không ngừng nhận được.")

        // Retired -> shows retired warning without retire button or claimed note.
        expect(items[2]).toContain("Mức đã khóa")
        expect(items[2]).toContain("Đã ngừng nhận cam kết mới (ẩn khỏi trang dự án).")
        expect(items[2]).not.toContain("Ngừng nhận mức này")
        expect(items[2]).not.toContain("Đã có người cam kết nên mức này không ngừng nhận được.")
      }
    )

    it("omits retire controls and claimed note once campaign has ended, while FulfillmentLink links to fulfillment", () => {
      const html = renderSection("succeeded", [
        makeTier({ id: TIER_A, title: "Mức mở", sort_order: 0, status: "active", quantity_claimed: 0 }),
        makeTier({ id: TIER_B, title: "Mức đã chọn", sort_order: 1, status: "active", quantity_claimed: 2 }),
      ])
      expect(html).toContain("Các mức không sửa được ở trạng thái này.")
      expect(html).not.toContain("Ngừng nhận mức này")
      expect(html).not.toContain("Đã có người cam kết nên mức này không ngừng nhận được.")

      const linkHtml = renderToStaticMarkup(createElement(FulfillmentLink, { campaignId: CAMPAIGN }))
      expect(linkHtml).toContain(`href="/me/campaigns/${CAMPAIGN}/fulfillment"`)
      expect(linkHtml).toContain(">Cập nhật giao quà<")
    })
  })
})
