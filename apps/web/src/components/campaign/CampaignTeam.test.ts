import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CO_ORGANIZER_FALLBACK_NAME, type PublicTeamMember } from "@/lib/campaign-members"

import { CampaignTeam } from "./CampaignTeam"

const OWNER_MEMBER: PublicTeamMember = {
  member_role: "owner",
  display_name: "Quỹ Bếp Ấm",
  avatar_url: "https://cdn.example.vn/owner.jpg",
  kind: "organization",
  verification_status: "verified",
  joined_at: "2026-11-01T00:00:00Z",
}

describe("CampaignTeam (DOS/Give#253)", () => {
  it("renders nothing when a campaign has no accepted co-organizers", () => {
    expect(renderToStaticMarkup(createElement(CampaignTeam, { members: [] }))).toBe("")
    expect(renderToStaticMarkup(createElement(CampaignTeam, { members: [OWNER_MEMBER] }))).toBe("")
  })

  it("renders owner first with verified badge, editors in order, safe avatars, fallback initials, and money boundary note", () => {
    const members: PublicTeamMember[] = [
      OWNER_MEMBER,
      {
        member_role: "editor",
        display_name: "Minh Anh",
        avatar_url: "javascript:alert(1)",
        kind: null,
        verification_status: null,
        joined_at: "2026-11-02T00:00:00Z",
      },
      {
        member_role: "editor",
        display_name: "Co-organizer",
        avatar_url: null,
        kind: null,
        verification_status: null,
        joined_at: "2026-11-03T00:00:00Z",
      },
    ]

    const html = renderToStaticMarkup(createElement(CampaignTeam, { members }))
    expect(html).toContain("Đội ngũ tổ chức")
    expect(html).toContain("Tiền ủng hộ luôn chuyển thẳng vào tài khoản nhận của người tổ chức chính.")

    // Owner row: safe https avatar with referrerPolicy="no-referrer", verified check, owner role badge.
    expect(html).toContain('src="https://cdn.example.vn/owner.jpg"')
    expect(html).toContain('referrerPolicy="no-referrer"')
    expect(html).toContain("Quỹ Bếp Ấm")
    expect(html).toContain("Người tổ chức chính")
    expect(html).toContain('aria-label="Đã xác minh"')
    expect(html).toContain("Tổ chức gây quỹ · Đã xác minh")

    // Editor 1: unsafe javascript: avatar rejected -> initial tile "M".
    expect(html).not.toContain("javascript:")
    expect(html).toContain("Minh Anh")
    expect(html).toContain(">M<")

    // Editor 2: deleted/inactive account neutralized to Vietnamese fallback "Đồng tổ chức" + initial "Đ".
    expect(html).not.toContain("Co-organizer")
    expect(html).toContain(CO_ORGANIZER_FALLBACK_NAME)
    expect(html).toContain(">Đ<")
    expect(html.indexOf("Quỹ Bếp Ấm")).toBeLessThan(html.indexOf("Minh Anh"))
    expect(html.indexOf("Minh Anh")).toBeLessThan(html.lastIndexOf(CO_ORGANIZER_FALLBACK_NAME))
  })
})
