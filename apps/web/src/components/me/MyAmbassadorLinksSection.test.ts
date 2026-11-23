// @vitest-environment happy-dom
import { Window } from "happy-dom"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AmbassadorLeaderboardToggleState } from "@/app/me/actions"
import { MyAmbassadorLinksSection } from "@/components/me/MyAmbassadorLinksSection"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

afterEach(() => {
  document.body.innerHTML = ""
})

const SAMPLE_LINKS = [
  {
    campaign_id: "22222222-2222-4222-8222-222222222222",
    campaign_slug: "xay-truong-ban-may",
    campaign_title: "Xây trường Bản Mây",
    campaign_status: "live" as const,
    campaign_type: "give" as const,
    ref_code: "ab23cd45ef",
    display_name: "CLB Sinh viên Xanh",
    show_on_leaderboard: true,
    matched_count: 4,
    matched_total_vnd: 1_200_000,
    created_at: "2026-11-22T00:00:00Z",
    updated_at: "2026-11-22T00:00:00Z",
  },
  {
    campaign_id: "33333333-3333-4333-8333-333333333333",
    campaign_slug: "du-an-den",
    campaign_title: "Dự án đèn",
    campaign_status: "succeeded" as const,
    campaign_type: "back" as const,
    ref_code: "xy98zw76ab",
    display_name: "Ẩn Danh Lan Tỏa",
    show_on_leaderboard: false,
    matched_count: 1,
    matched_total_vnd: 300_000,
    created_at: "2026-11-20T00:00:00Z",
    updated_at: "2026-11-20T00:00:00Z",
  },
]

describe("MyAmbassadorLinksSection (DOS/Give#319, #331)", () => {
  it("renders a calm empty state pointing to /campaigns when the user has no ambassador links", () => {
    const html = renderToStaticMarkup(createElement(MyAmbassadorLinksSection, { links: [], origin: "https://give.vn" }))
    const doc = new Window().document
    doc.body.innerHTML = html

    expect(doc.querySelector("h2")?.textContent).toBe("Liên kết đồng hành của tôi")
    expect(html).toContain("Bạn chưa tạo liên kết đồng hành cho chiến dịch nào.")
    expect(doc.querySelector('a[href="/campaigns"]')).not.toBeNull()
  })

  it("renders ambassador links with ?ref= URL, copy button, visibility badge, net matched stats, and leaderboard toggle buttons (including ended campaigns)", () => {
    const toggleAction = vi.fn(async (state: AmbassadorLeaderboardToggleState) => state)
    const html = renderToStaticMarkup(
      createElement(MyAmbassadorLinksSection, {
        origin: "https://give.vn",
        links: SAMPLE_LINKS,
        toggleLeaderboardAction: toggleAction,
      })
    )
    const doc = new Window().document
    doc.body.innerHTML = html

    expect(html).toContain("Liên kết đồng hành của tôi")
    expect(html).toContain("5 lượt đã đối soát")
    expect(html).toContain("1.500.000")
    expect(html).toContain("https://give.vn/campaigns/xay-truong-ban-may?ref=ab23cd45ef")
    expect(html).toContain("https://give.vn/campaigns/du-an-den?ref=xy98zw76ab")
    expect(html).toContain("Hiện trên bảng lan tỏa")
    expect(html).toContain("Ẩn khỏi bảng lan tỏa")
    expect(html).toContain("Ẩn khỏi bảng xếp hạng")
    expect(html).toContain("Hiện trên bảng xếp hạng")
    expect(doc.querySelectorAll("button")).toHaveLength(4)
    expect(doc.querySelector('a[href="/campaigns/xay-truong-ban-may"]')).not.toBeNull()
  })

  it("submits leaderboard visibility toggle and updates badge, button label, and status/error feedback", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const toggleAction = vi.fn(
      async (
        _prev: AmbassadorLeaderboardToggleState,
        formData: FormData
      ): Promise<AmbassadorLeaderboardToggleState> => {
        const next = formData.get("show_on_leaderboard") === "true"
        return {
          showOnLeaderboard: next,
          message: next ? "Đã hiện liên kết này trên bảng xếp hạng." : "Đã ẩn liên kết này khỏi bảng xếp hạng.",
        }
      }
    )

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          createElement(MyAmbassadorLinksSection, {
            origin: "https://give.vn",
            links: [SAMPLE_LINKS[1]],
            toggleLeaderboardAction: toggleAction,
          })
        )
      })

      // Ended campaign starts hidden -> button offers "Hiện trên bảng xếp hạng"
      const submitBtn = container.querySelector<HTMLButtonElement>('button[type="submit"]')!
      expect(submitBtn.textContent).toContain("Hiện trên bảng xếp hạng")
      expect(container.textContent).toContain("Ẩn khỏi bảng lan tỏa")

      await act(async () => {
        submitBtn.click()
      })

      expect(toggleAction).toHaveBeenCalledTimes(1)
      const submittedForm = toggleAction.mock.calls[0][1]
      expect(submittedForm.get("campaign_id")).toBe(SAMPLE_LINKS[1].campaign_id)
      expect(submittedForm.get("campaign_slug")).toBe(SAMPLE_LINKS[1].campaign_slug)
      expect(submittedForm.get("show_on_leaderboard")).toBe("true")
      expect(container.querySelector('[role="status"]')?.textContent).toBe("Đã hiện liên kết này trên bảng xếp hạng.")
      expect(container.textContent).toContain("Hiện trên bảng lan tỏa")
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toContain(
        "Ẩn khỏi bảng xếp hạng"
      )

      // Revalidation delivering the matching server prop preserves the confirmation status message.
      act(() => {
        root.render(
          createElement(MyAmbassadorLinksSection, {
            origin: "https://give.vn",
            links: [{ ...SAMPLE_LINKS[1], show_on_leaderboard: true }],
            toggleLeaderboardAction: toggleAction,
          })
        )
      })
      expect(container.querySelector('[role="status"]')?.textContent).toBe("Đã hiện liên kết này trên bảng xếp hạng.")

      // Error return shows role="alert" and leaves badge/button labels unchanged.
      toggleAction.mockResolvedValueOnce({
        showOnLeaderboard: true,
        error: "Tài khoản của bạn hiện không hoạt động nên không thể thực hiện thao tác này.",
      })
      await act(async () => {
        container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
      })
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        "Tài khoản của bạn hiện không hoạt động nên không thể thực hiện thao tác này."
      )
      expect(container.querySelector('[role="status"]')).toBeNull()
      expect(container.textContent).toContain("Hiện trên bảng lan tỏa")
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toContain(
        "Ẩn khỏi bảng xếp hạng"
      )

      // External server prop refresh updates visibility and clears superseded state cleanly.
      act(() => {
        root.render(
          createElement(MyAmbassadorLinksSection, {
            origin: "https://give.vn",
            links: [{ ...SAMPLE_LINKS[1], show_on_leaderboard: false }],
            toggleLeaderboardAction: toggleAction,
          })
        )
      })
      expect(container.querySelector('[role="alert"]')).toBeNull()
      expect(container.textContent).toContain("Ẩn khỏi bảng lan tỏa")
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toContain(
        "Hiện trên bảng xếp hạng"
      )
      expect(container.querySelector<HTMLInputElement>('input[name="show_on_leaderboard"]')?.value).toBe("true")
    } finally {
      act(() => root.unmount())
    }
  })
})
