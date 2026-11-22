import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { ListedCampaign } from "@/lib/campaigns"
import { publicCoverUrl } from "@/lib/cover-urls"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))
vi.mock("next/image", () => ({
  default: ({ priority, fill: _fill, ...rest }: { src: string; alt: string; priority?: boolean; fill?: boolean }) =>
    createElement("img", { ...rest, ...(priority ? { "data-priority": "true" } : {}) }),
}))

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

  it("links the organizer name to /u/<handle> when a valid handle is present, and stays plain text otherwise", () => {
    const linked = render({
      display_name: "Quỹ Nhịp Tim Việt",
      kind: "organization",
      verification_status: "verified",
      handle: "quy-nhip-tim",
    })
    expect(linked).toContain('href="/u/quy-nhip-tim"')
    expect(linked).toContain(">Quỹ Nhịp Tim Việt</a>")

    const unlinked = render({
      display_name: "Quỹ Chưa Có Handle",
      kind: "organization",
      verification_status: "verified",
      handle: null,
    })
    expect(unlinked).not.toContain('href="/u/')
    expect(unlinked).toContain('<span class="truncate">Quỹ Chưa Có Handle</span>')

    const reserved = render({
      display_name: "Admin Giả",
      kind: "individual",
      verification_status: "unverified",
      handle: "admin",
    })
    expect(reserved).not.toContain('href="/u/admin"')
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

  it("renders back campaign copy ('Dự án sáng tạo', 'đã cam kết', 'người đồng hành') and headingLevel={2}", () => {
    const html = renderToStaticMarkup(
      createElement(CampaignCard, {
        campaign: campaign(null, {
          type: "back",
          slug: "sach-anh",
          title: "Sách ảnh thiếu nhi",
          ends_at: "2999-01-01T00:00:00Z",
        }),
        raised: 35_000_000,
        people: 14,
        headingLevel: 2,
      })
    )
    expect(html).toContain(">Dự án sáng tạo<")
    expect(html).toMatch(/<h2[^>]*><a href="\/campaigns\/sach-anh"[^>]*>Sách ảnh thiếu nhi<\/a><\/h2>/)
    expect(html).not.toContain("<h3")
    expect(html).toContain("đã cam kết · 35%")
    expect(html).toMatch(/14 người đồng hành · Còn \d+ ngày/)
  })

  it("renders public cover image with priority when cover.storage_path is set and CoverPlaceholder otherwise", () => {
    const path = "campaigns/1060c000-0000-4000-8000-000000000001/cover.webp"
    const withCover = renderToStaticMarkup(
      createElement(CampaignCard, {
        campaign: campaign(null, { cover: { storage_path: path, alt: "Ảnh bìa" } }),
        priority: true,
      })
    )
    expect(withCover).toContain(`src="${publicCoverUrl(path)}"`)
    expect(withCover).toContain('alt=""')
    expect(withCover).toContain('data-priority="true"')

    const withNullPath = renderToStaticMarkup(
      createElement(CampaignCard, {
        campaign: campaign(null, { cover: { storage_path: null, alt: null } }),
      })
    )
    expect(withNullPath).not.toContain("<img")
    expect(withNullPath).toContain("<svg")
  })

  it("guards null display_options and removes mt-3 above the raised line when progress_bar is false", () => {
    const nullOptions = renderToStaticMarkup(
      createElement(CampaignCard, {
        campaign: campaign(null, {
          display_options: null as never,
          ends_at: "2999-01-01T00:00:00Z",
        }),
        raised: 50_000_000,
        people: 6,
      })
    )
    expect(nullOptions).toContain("h-1.5")
    expect(nullOptions).toContain('<p class="mt-3">')
    expect(nullOptions).toContain("đã nhận · 50%")
    expect(nullOptions).toMatch(/6 người ủng hộ · Còn \d+ ngày/)

    const hiddenProgress = renderToStaticMarkup(
      createElement(CampaignCard, {
        campaign: campaign(null, {
          display_options: { progress_bar: false, backers_count: false, time_remaining: false },
          ends_at: "2999-01-01T00:00:00Z",
        }),
        raised: 50_000_000,
        people: 6,
      })
    )
    expect(hiddenProgress).not.toContain("h-1.5")
    expect(hiddenProgress).not.toContain("mt-3")
    expect(hiddenProgress).toContain('<div class="mt-auto pt-2"><p><span class="figure">')
    expect(hiddenProgress).toContain("đã nhận</span>")
    expect(hiddenProgress).not.toContain("50%")
    expect(hiddenProgress).not.toContain("6 người ủng hộ")
    expect(hiddenProgress).not.toContain("Còn ")

    // Ended status still renders in meta even when time_remaining is false.
    const endedHiddenTime = renderToStaticMarkup(
      createElement(CampaignCard, {
        campaign: campaign(null, {
          status: "succeeded",
          ends_at: "2026-01-01T00:00:00Z",
          display_options: { progress_bar: false, backers_count: false, time_remaining: false },
        }),
        raised: 100_000_000,
        people: 6,
      })
    )
    expect(endedHiddenTime).toContain("Thành công")
    expect(endedHiddenTime).not.toContain("6 người ủng hộ")
  })

  it("renders 'Sắp ra mắt' teaser badge, goal amount, and launch date without raised totals or progress bar (DOS/Give#315)", () => {
    const html = renderToStaticMarkup(
      createElement(CampaignCard, {
        campaign: campaign(null, {
          status: "approved",
          prelaunch_public: true,
          starts_at: "2099-12-15T00:00:00Z",
          ends_at: "2100-01-15T00:00:00Z",
        }),
        raised: 0,
      })
    )

    expect(html).toContain("Sắp ra mắt")
    expect(html).toContain("Mục tiêu")
    expect(html).toContain("Mở ngày")
    expect(html).not.toContain("đã nhận")
    expect(html).not.toContain("h-1.5")

    // Pre-launch card without a valid starts_at does not throw, does not repeat "Sắp ra mắt",
    // and suppresses hasImpactReport badge (#314 + #315).
    const withoutDate = renderToStaticMarkup(
      createElement(CampaignCard, {
        campaign: campaign(null, {
          status: "approved",
          prelaunch_public: true,
          starts_at: "not-a-date",
        }),
        hasImpactReport: true,
      })
    )
    expect(withoutDate.match(/Sắp ra mắt/g)).toHaveLength(1)
    expect(withoutDate).not.toContain("Mở ngày")
    expect(withoutDate).not.toContain("Có báo cáo tổng kết")
  })

  it("displays verified statement freshness on public cards and strictly suppresses it on pre-launch cards (DOS/Give#318)", () => {
    const auditedLive = renderToStaticMarkup(
      createElement(CampaignCard, {
        campaign: campaign(null, { status: "live" }),
        raised: 60_000_000,
        lastStatementAt: "2026-11-20T10:00:00Z",
      })
    )
    expect(auditedLive).toContain("Sao kê mới nhất: 20/11/2026")
    expect(auditedLive).toContain("tabular-nums")

    const auditedClosed = renderToStaticMarkup(
      createElement(CampaignCard, {
        campaign: campaign(null, { status: "closed" }),
        raised: 100_000_000,
        lastStatementAt: "2026-11-18T18:00:00Z",
      })
    )
    // 18:00 UTC = 01:00 next day in Asia/Ho_Chi_Minh (UTC+7).
    expect(auditedClosed).toContain("Sao kê mới nhất: 19/11/2026")

    const invalidDate = renderToStaticMarkup(
      createElement(CampaignCard, {
        campaign: campaign(null, { status: "live" }),
        raised: 60_000_000,
        lastStatementAt: "not-a-timestamp",
      })
    )
    expect(invalidDate).not.toContain("Sao kê mới nhất:")

    const prelaunchSuppressed = renderToStaticMarkup(
      createElement(CampaignCard, {
        campaign: campaign(null, {
          status: "approved",
          prelaunch_public: true,
          starts_at: "2099-12-15T00:00:00Z",
        }),
        lastStatementAt: "2026-11-20T10:00:00Z",
      })
    )
    expect(prelaunchSuppressed).toContain("Sắp ra mắt")
    expect(prelaunchSuppressed).not.toContain("Sao kê mới nhất:")
  })
})
