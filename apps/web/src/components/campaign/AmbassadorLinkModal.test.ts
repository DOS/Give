// @vitest-environment happy-dom
import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AmbassadorLinkModal } from "@/components/campaign/AmbassadorLinkModal"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

describe("AmbassadorLinkModal (DOS/Give#319)", () => {
  it("renders a clean login link for guests without a modal button", () => {
    const html = renderToStaticMarkup(
      createElement(AmbassadorLinkModal, {
        campaignId: CAMPAIGN,
        slug: "xay-truong",
        origin: "https://give.vn",
        signedIn: false,
        loginHref: "/auth/login?return_path=%2Fcampaigns%2Fxay-truong",
        defaultName: "",
        initialAmbassador: null,
        action: vi.fn(async (s) => s),
      })
    )
    const doc = new Window().document
    doc.body.innerHTML = html

    const link = doc.querySelector("a")
    expect(link?.getAttribute("href")).toBe("/auth/login?return_path=%2Fcampaigns%2Fxay-truong")
    expect(link?.textContent).toContain("Tạo link kêu gọi giúp chiến dịch")
    expect(doc.querySelector("button")).toBeNull()
  })

  it("renders the modal trigger button for signed-in users (create vs manage copy)", () => {
    const createHtml = renderToStaticMarkup(
      createElement(AmbassadorLinkModal, {
        campaignId: CAMPAIGN,
        slug: "xay-truong",
        origin: "https://give.vn",
        signedIn: true,
        loginHref: "/auth/login?return_path=%2Fcampaigns%2Fxay-truong",
        defaultName: "Minh Anh",
        initialAmbassador: null,
        action: vi.fn(async (s) => s),
      })
    )
    expect(createHtml).toContain("Tạo link kêu gọi giúp chiến dịch")

    const manageHtml = renderToStaticMarkup(
      createElement(AmbassadorLinkModal, {
        campaignId: CAMPAIGN,
        slug: "xay-truong",
        origin: "https://give.vn",
        signedIn: true,
        loginHref: "/auth/login?return_path=%2Fcampaigns%2Fxay-truong",
        defaultName: "Minh Anh",
        initialAmbassador: {
          ref_code: "ab23cd45ef",
          display_name: "Minh Anh KOL",
          show_on_leaderboard: true,
          matched_count: 3,
          matched_total_vnd: 900_000,
          created_at: "2026-11-22T00:00:00Z",
          updated_at: "2026-11-22T00:00:00Z",
        },
        action: vi.fn(async (s) => s),
      })
    )
    expect(manageHtml).toContain("Link kêu gọi của bạn")
  })
})
