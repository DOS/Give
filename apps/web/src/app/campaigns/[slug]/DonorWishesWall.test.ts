// @vitest-environment happy-dom
/**
 * Component tests for `DonorWishesWall` and `WishHeartButton` (DOS/Give#320):
 * plain-text XSS safety, anonymous masking, guest login link vs signed-in heart
 * button, report/hide controls, and hidden-wishes drawer (`can_restore` gating).
 */
import { createElement } from "react"
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { CampaignWishRow, HiddenCampaignWishRow } from "@/lib/donor-wishes"

vi.mock("./wish-actions", () => ({
  toggleWishHeart: vi.fn(async () => ({ hearted: true, heartCount: 1 })),
  reportWish: vi.fn(async () => null),
  moderateWishFromCampaign: vi.fn(async () => null),
}))

const { DonorWishesWall } = await import("./DonorWishesWall")

const WISH_NAMED: CampaignWishRow = {
  contribution_id: "3200d000-0000-4000-8000-000000000001",
  display_name: "Nguyễn An",
  is_anonymous: false,
  amount: 500_000,
  message: "Chúc chiến dịch thành công <img src=x onerror=alert(1)>",
  created_at: "2026-11-22T09:00:00.000Z",
  heart_count: 5,
  viewer_hearted: true,
  total_count: 2,
}

const WISH_ANON: CampaignWishRow = {
  contribution_id: "3200d000-0000-4000-8000-000000000002",
  display_name: null,
  is_anonymous: true,
  amount: 200_000,
  message: "Gửi chút tấm lòng",
  created_at: "2026-11-22T08:00:00.000Z",
  heart_count: 0,
  viewer_hearted: false,
  total_count: 2,
}

const HIDDEN_STAFF: HiddenCampaignWishRow = {
  contribution_id: "3200d000-0000-4000-8000-000000000003",
  display_name: "Trần B",
  is_anonymous: false,
  amount: 100_000,
  message: "Lời chúc bị kiểm duyệt viên ẩn",
  created_at: "2026-11-22T07:00:00.000Z",
  message_hidden_at: "2026-11-22T08:00:00.000Z",
  message_hidden_role: "moderator",
  message_hide_reason: "Vi phạm",
  can_restore: false,
}

const HIDDEN_OWNER: HiddenCampaignWishRow = {
  contribution_id: "3200d000-0000-4000-8000-000000000004",
  display_name: "Lê C",
  is_anonymous: false,
  amount: 150_000,
  message: "Lời chúc do chủ chiến dịch ẩn",
  created_at: "2026-11-22T07:30:00.000Z",
  message_hidden_at: "2026-11-22T08:30:00.000Z",
  message_hidden_role: "owner",
  message_hide_reason: null,
  can_restore: true,
}

function parseDoc(html: string) {
  const win = new Window()
  win.document.body.innerHTML = html
  return win.document
}

describe("DonorWishesWall (DOS/Give#320)", () => {
  it("renders guest view with plain-text XSS escaping, anonymous masking, and login links for hearts", () => {
    const html = renderToStaticMarkup(
      createElement(DonorWishesWall, {
        slug: "xay-truong",
        wishes: [WISH_NAMED, WISH_ANON],
        totalCount: 2,
        page: 1,
        signedIn: false,
        loginHref: "/auth/login?return_path=%2Fcampaigns%2Fxay-truong",
        canHideWishes: false,
        canViewHiddenWishes: false,
        showHidden: false,
        hiddenWishes: [],
      })
    )
    const doc = parseDoc(html)

    expect(doc.querySelector("#wishes-heading")?.textContent).toContain("Tường lời chúc")
    // Zero injected <img> tags; rendered literally as plain text
    expect(doc.querySelectorAll("img")).toHaveLength(0)
    expect(doc.body.textContent).toContain("<img src=x onerror=alert(1)>")
    expect(doc.body.textContent).toContain("Người ủng hộ ẩn danh")
    expect(doc.body.textContent).toContain("500.000")
    // Guests get login <a> links for heart buttons and no report/hide controls
    const loginLinks = Array.from(doc.querySelectorAll('a[href="/auth/login?return_path=%2Fcampaigns%2Fxay-truong"]'))
    expect(loginLinks).toHaveLength(2)
    expect(doc.body.textContent).not.toContain("Báo cáo")
    expect(doc.body.textContent).not.toContain("Ẩn lời chúc")
  })

  it("renders signed-in controls, aria-pressed heart state, and hidden-wishes restore gating", () => {
    const html = renderToStaticMarkup(
      createElement(DonorWishesWall, {
        slug: "xay-truong",
        wishes: [WISH_NAMED],
        totalCount: 25,
        page: 1,
        signedIn: true,
        loginHref: "/auth/login?return_path=%2Fcampaigns%2Fxay-truong",
        canHideWishes: true,
        canViewHiddenWishes: true,
        showHidden: true,
        hiddenWishes: [HIDDEN_STAFF, HIDDEN_OWNER],
      })
    )
    const doc = parseDoc(html)

    const heartBtn = doc.querySelector('button[aria-pressed="true"]')
    expect(heartBtn).not.toBeNull()
    expect(heartBtn?.getAttribute("aria-label")).toBe("Bỏ tim lời chúc (5 tim)")
    expect(heartBtn?.querySelector(".sr-only")).toBeNull()
    expect(heartBtn?.textContent).toContain("5")
    expect(doc.body.textContent).toContain("Báo cáo")
    expect(doc.body.textContent).toContain("Ẩn lời chúc")
    // Hidden wishes drawer respects can_restore: owner-hidden has button, staff-hidden shows lock notice
    expect(doc.body.textContent).toContain("Lời chúc đã ẩn")
    expect(doc.body.textContent).toContain("Khôi phục lời chúc")
    expect(doc.body.textContent).toContain("do đội kiểm duyệt ẩn")
    // Pagination shows page 1 / 2
    expect(doc.body.textContent).toContain("Trang 1 / 2")
  })

  it("renders calm empty state when there are no wishes yet", () => {
    const html = renderToStaticMarkup(
      createElement(DonorWishesWall, {
        slug: "xay-truong",
        wishes: [],
        totalCount: 0,
        page: 1,
        signedIn: false,
        loginHref: "/auth/login",
        canHideWishes: false,
        canViewHiddenWishes: false,
        showHidden: false,
        hiddenWishes: [],
      })
    )
    expect(html).toContain("Chưa có lời chúc nào")
  })
})
