import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { ListedCampaign } from "@/lib/campaigns"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))
vi.mock("next/image", () => ({ default: () => null }))

const { CampaignCard } = await import("./CampaignCard")

const campaign = (organizer: ListedCampaign["organizer"], extra: Partial<ListedCampaign> = {}) =>
  ({
    id: "1060c000-0000-4000-8000-000000000001",
    slug: "be-an",
    type: "give",
    title: "Chung tay cùng bé An",
    goal_amount: 100_000_000,
    ends_at: null,
    display_options: {},
    cover: null,
    category: { id: "c1", slug: "y-te", name: "Y tế", icon: null, color: null },
    organizer,
    status: "live",
    ...extra,
  }) as unknown as ListedCampaign

const render = (organizer: ListedCampaign["organizer"]) =>
  renderToStaticMarkup(createElement(CampaignCard, { campaign: campaign(organizer), raised: 70_000_000 }))

describe("CampaignCard", () => {
  it("shows the organizer with the verified check after the title, and no category", () => {
    const html = render({ display_name: "Quỹ Nhịp Tim Việt", kind: "organization", verification_status: "verified" })
    expect(html).toContain("Quỹ Nhịp Tim Việt")
    // The check is a named image that screen readers do not skip, whatever the attribute order.
    const check = html.match(/<svg(?=[^>]*aria-label="Đã xác minh")[^>]*>/)?.[0]
    expect(check).toMatch(/role="img"/)
    expect(check).not.toMatch(/aria-hidden="true"/)
    expect(html.indexOf("Chung tay cùng bé An")).toBeLessThan(html.indexOf("Quỹ Nhịp Tim Việt"))
    expect(html).not.toContain("Y tế")
  })

  it("shows an unverified organizer without the check", () => {
    const html = render({ display_name: "Anh Bình", kind: "individual", verification_status: "pending" })
    expect(html).toContain("Anh Bình")
    expect(html).not.toContain("Đã xác minh")
  })

  it("leaves the organizer line out when there is no organizer", () => {
    const html = render(null)
    expect(html).not.toContain("Đã xác minh")
    // The title is followed directly by the progress block.
    expect(html).toMatch(/<\/h3><div class="mt-auto pt-2">/)
  })

  it("shows an ended campaign's status instead of the time left", () => {
    const ended = (status: string, ends_at: string) =>
      renderToStaticMarkup(
        createElement(CampaignCard, {
          campaign: campaign(null, { status, ends_at } as Partial<ListedCampaign>),
          raised: 0,
          people: 8,
        })
      )
    const past = "2026-01-01T00:00:00Z"
    expect(ended("succeeded", past)).toContain("8 người ủng hộ · Thành công")
    expect(ended("closed", past)).toContain("8 người ủng hộ · Đã kết thúc")
    expect(ended("settling", past)).toContain("Đang tất toán")
    expect(ended("failed", past)).toContain("Không đạt mục tiêu")
    for (const status of ["succeeded", "closed", "settling", "failed"])
      expect(ended(status, past)).not.toContain("Đã hết hạn")
    // A live campaign past its end date (before the closing job runs) still says so.
    expect(ended("live", past)).toContain("Đã hết hạn")
    expect(ended("live", "2999-01-01T00:00:00Z")).toMatch(/Còn \d+ ngày/)
  })
})
