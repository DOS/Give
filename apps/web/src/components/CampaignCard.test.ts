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

const campaign = (organizer: ListedCampaign["organizer"]) =>
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
  }) as unknown as ListedCampaign

const render = (organizer: ListedCampaign["organizer"]) =>
  renderToStaticMarkup(createElement(CampaignCard, { campaign: campaign(organizer), raised: 70_000_000 }))

describe("CampaignCard", () => {
  it("shows the organizer with the verified check after the title, and no category", () => {
    const html = render({ display_name: "Quỹ Nhịp Tim Việt", kind: "organization", verification_status: "verified" })
    expect(html).toContain("Quỹ Nhịp Tim Việt")
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*aria-label="Đã xác minh"/)
    expect(html).not.toMatch(/<svg[^>]*aria-label="Đã xác minh"[^>]*aria-hidden="true"/)
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
    expect(html).not.toContain("truncate")
  })
})
