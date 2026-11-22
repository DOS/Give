import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))
vi.mock("../actions", () => ({
  setCampaignPrelaunchPublic: vi.fn(async () => null),
}))

const { campaignPrelaunchPublic, PrelaunchSection, showPrelaunchSection } = await import("./PrelaunchSection")

const NOW = new Date("2026-11-22T00:00:00Z")

function render(props: Parameters<typeof PrelaunchSection>[0]) {
  const html = renderToStaticMarkup(createElement(PrelaunchSection, { now: NOW, ...props }))
  const win = new Window()
  win.document.body.innerHTML = html
  return { html, doc: win.document }
}

describe("PrelaunchSection (/me/campaigns/[id], DOS/Give#315)", () => {
  it("shows only before launch (draft, changes_requested, in_review, approved)", () => {
    expect(showPrelaunchSection("draft")).toBe(true)
    expect(showPrelaunchSection("changes_requested")).toBe(true)
    expect(showPrelaunchSection("in_review")).toBe(true)
    expect(showPrelaunchSection("approved")).toBe(true)
    expect(showPrelaunchSection("live")).toBe(false)
    expect(showPrelaunchSection("closed")).toBe(false)
    expect(showPrelaunchSection("suspended")).toBe(false)
    expect(campaignPrelaunchPublic({ prelaunch_public: true })).toBe(true)
    expect(campaignPrelaunchPublic({})).toBe(false)
  })

  it("shows live teaser link and follower count when approved + enabled + future starts_at", () => {
    const { doc } = render({
      campaignId: "22222222-2222-4222-8222-222222222222",
      slug: "sap-ra-mat",
      status: "approved",
      startsAt: "2026-12-01T00:00:00Z",
      prelaunchPublic: true,
      followerCount: 15,
    })

    expect(doc.body.textContent).toContain("Đang bật")
    expect(doc.body.textContent).toContain("15 người đang chờ")
    expect(doc.querySelector('a[href="/campaigns/sap-ra-mat"]')?.textContent).toContain(
      "Xem trang Sắp ra mắt công khai"
    )
    expect(doc.querySelector('input[name="enabled"]')?.getAttribute("value")).toBe("false")
  })

  it("disables enabling when approved without a future start date", () => {
    const { doc } = render({
      campaignId: "22222222-2222-4222-8222-222222222222",
      slug: "qua-gio",
      status: "approved",
      startsAt: "2026-11-20T00:00:00Z",
      prelaunchPublic: false,
    })

    expect(doc.body.textContent).toContain("không có ngày bắt đầu trong tương lai")
    expect(doc.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(true)
  })

  it("explains in_review and approved-without-future-start states cleanly", () => {
    const inReview = render({
      campaignId: "22222222-2222-4222-8222-222222222222",
      slug: "cho-duyet",
      status: "in_review",
      startsAt: null,
      prelaunchPublic: true,
    })
    expect(inReview.doc.body.textContent).toContain("đang chờ duyệt")
    expect(inReview.doc.body.textContent).not.toContain("trước khi gửi duyệt")

    const approvedStale = render({
      campaignId: "22222222-2222-4222-8222-222222222222",
      slug: "het-han-prelaunch",
      status: "approved",
      startsAt: "2026-11-20T00:00:00Z",
      prelaunchPublic: true,
    })
    expect(approvedStale.doc.body.textContent).toContain("Chưa hiển thị công khai")
    expect(approvedStale.doc.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(false)
  })
})
