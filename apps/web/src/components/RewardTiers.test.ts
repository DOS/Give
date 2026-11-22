import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { PublicRewardTier } from "@/lib/pledges"
import { minAmountLabel, pledgeHref } from "@/lib/reward-tiers"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { RewardTiers } = await import("./RewardTiers")

const tier = (overrides: Partial<PublicRewardTier> = {}): PublicRewardTier => ({
  id: "11111111-1111-4111-8111-111111111111",
  campaign_id: "22222222-2222-4222-8222-222222222222",
  title: "Bản sách bìa cứng",
  description: "Kèm chữ ký tác giả",
  min_amount: 350_000,
  quantity_limit: 10,
  quantity_claimed: 7,
  quantity_remaining: 3,
  estimated_delivery: "2027-03-01",
  requires_shipping: true,
  shipping_note: "Miễn phí giao nội thành",
  sort_order: 0,
  is_early_bird: false,
  available_until: null,
  ...overrides,
})

describe("RewardTiers", () => {
  it("returns null when tiers is empty", () => {
    expect(RewardTiers({ tiers: [], slug: "du-an-sach", open: true, closedNote: "Đã đóng." })).toBeNull()
  })

  it("renders choosable tiers with data-ring-box and a pledgeHref link, without closedNote", () => {
    const limited = tier()
    const unlimited = tier({
      id: "33333333-3333-4333-8333-333333333333",
      title: "Bản điện tử",
      description: null,
      min_amount: 100_000,
      quantity_limit: null,
      quantity_claimed: 0,
      quantity_remaining: null,
      estimated_delivery: null,
      requires_shipping: false,
      shipping_note: "Ghi chú bị ẩn khi không giao hàng",
      sort_order: 1,
    })

    const html = renderToStaticMarkup(
      createElement(RewardTiers, {
        tiers: [limited, unlimited],
        slug: "du-an-sach",
        open: true,
        closedNote: "Dự án không còn nhận cam kết.",
      })
    )

    expect(html).not.toContain("Dự án không còn nhận cam kết.")
    const items = html.match(/<li\b[^>]*>/g) ?? []
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item).toContain('data-ring-box="true"')
      expect(item).toContain("hover:border-primary")
      expect(item).not.toContain("bg-surface")
    }

    expect(html).toContain(`href="${pledgeHref("du-an-sach", limited.id)}"`)
    expect(html).toContain(`href="${pledgeHref("du-an-sach", unlimited.id)}"`)
    expect(html).toContain(minAmountLabel(350_000))
    expect(html).toContain("Còn 3/10 suất")
    expect(html).toContain("Không giới hạn số suất")
    expect(html).toContain("Giao dự kiến tháng 3/2027 · Giao tận nơi (cần địa chỉ nhận) · 7 người đã chọn")
    expect(html).toContain("Miễn phí giao nội thành")
    expect(html).toContain("Không cần giao hàng")
    expect(html).not.toContain("Ghi chú bị ẩn khi không giao hàng")
  })

  it("renders sold-out tiers without data-ring-box or link while keeping open sibling tiers choosable", () => {
    const available = tier({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Mức còn suất" })
    const soldOut = tier({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Mức đã hết",
      quantity_limit: 10,
      quantity_claimed: 10,
      quantity_remaining: 0,
    })

    const html = renderToStaticMarkup(
      createElement(RewardTiers, {
        tiers: [available, soldOut],
        slug: "du-an-sach",
        open: true,
        closedNote: "Dự án không còn nhận cam kết.",
      })
    )

    const items = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? []
    expect(items).toHaveLength(2)

    expect(items[0]).toContain('data-ring-box="true"')
    expect(items[0]).toContain(`href="${pledgeHref("du-an-sach", available.id)}"`)

    expect(items[1]).not.toContain("data-ring-box")
    expect(items[1]).toContain("bg-surface")
    expect(items[1]).not.toContain("hover:border-primary")
    expect(items[1]).not.toContain("<a ")
    expect(items[1]).not.toContain(pledgeHref("du-an-sach", soldOut.id))
    expect(items[1]).toContain(">Mức đã hết</h3>")
    expect(items[1]).toContain("bg-danger-soft text-danger")
    expect(items[1]).toContain("Hết suất")
  })

  it("shows closedNote and renders plain unlinked tiers without data-ring-box when open is false", () => {
    const openLookingTier = tier()
    const html = renderToStaticMarkup(
      createElement(RewardTiers, {
        tiers: [openLookingTier],
        slug: "du-an-sach",
        open: false,
        closedNote: "Đây là dự án của bạn nên bạn không chọn mức được.",
      })
    )

    expect(html).toContain("Đây là dự án của bạn nên bạn không chọn mức được.")
    expect(html).not.toContain("data-ring-box")
    expect(html).not.toContain("<a ")
    expect(html).not.toContain(pledgeHref("du-an-sach", openLookingTier.id))
    expect(html).toContain("bg-surface")
    expect(html).toContain(">Bản sách bìa cứng</h3>")
  })

  it("renders active Early Bird badge/deadline as choosable and disables expired Early Bird tiers cleanly (DOS/Give#317)", () => {
    const now = new Date("2027-01-10T10:00:00.000Z")
    const activeEb = tier({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      title: "Early Bird 48h",
      is_early_bird: true,
      available_until: "2027-01-12T10:00:00.000Z", // 17:00 12/01/2027 VN
      quantity_limit: 20,
      quantity_claimed: 5,
      quantity_remaining: 15,
    })
    const expiredEb = tier({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      title: "Early Bird Đã Đóng",
      is_early_bird: true,
      available_until: "2027-01-10T10:00:00.000Z", // exact boundary -> expired
      quantity_limit: 20,
      quantity_claimed: 5,
      quantity_remaining: 15,
    })

    const html = renderToStaticMarkup(
      createElement(RewardTiers, {
        tiers: [activeEb, expiredEb],
        slug: "du-an-sach",
        open: true,
        closedNote: "Dự án không còn nhận cam kết.",
        now,
      })
    )

    const items = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? []
    expect(items).toHaveLength(2)

    expect(items[0]).toContain('data-ring-box="true"')
    expect(items[0]).toContain(`href="${pledgeHref("du-an-sach", activeEb.id)}"`)
    expect(items[0]).toContain("Ưu đãi Early Bird")
    expect(items[0]).toContain("Còn 15/20 suất")
    expect(items[0]).toContain("Ưu đãi đến")

    expect(items[1]).not.toContain("data-ring-box")
    expect(items[1]).toContain("bg-surface")
    expect(items[1]).not.toContain("<a ")
    expect(items[1]).toContain("Ưu đãi Early Bird")
    expect(items[1]).toContain("Đã hết hạn ưu đãi")
    expect(items[1]).toContain("bg-danger-soft text-danger")
  })
})
