// @vitest-environment happy-dom
import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { AmbassadorLeaderboard } from "@/components/campaign/AmbassadorLeaderboard"

describe("AmbassadorLeaderboard (DOS/Give#319)", () => {
  it("hides cleanly when there are no opt-in ambassadors with matched contributions", () => {
    expect(renderToStaticMarkup(createElement(AmbassadorLeaderboard, { rows: [] }))).toBe("")
  })

  it("renders ranked display_name, matched_count, and matched_total_vnd with zero XSS or PII", () => {
    const html = renderToStaticMarkup(
      createElement(AmbassadorLeaderboard, {
        rows: [
          {
            ref_code: "topref1234",
            display_name: "CLB Sinh viên <script>alert(1)</script>",
            matched_count: 5,
            matched_total_vnd: 2_500_000,
          },
          {
            ref_code: "second1234",
            display_name: "Minh Anh",
            matched_count: 2,
            matched_total_vnd: 800_000,
          },
        ],
      })
    )
    const doc = new Window().document
    doc.body.innerHTML = html

    expect(doc.querySelector("h2")?.textContent).toBe("Người đồng hành lan tỏa")
    const items = [...doc.querySelectorAll("li")]
    expect(items).toHaveLength(2)
    expect(items[0]!.textContent).toContain("CLB Sinh viên <script>alert(1)</script>")
    expect(items[0]!.textContent).toContain("5 lượt ủng hộ đã khớp")
    expect(items[0]!.textContent).toContain("2.500.000")
    expect(items[1]!.textContent).toContain("Minh Anh")
    expect(items[1]!.textContent).toContain("2 lượt ủng hộ đã khớp")
    expect(items[1]!.textContent).toContain("800.000")
    // Must not execute raw script tags and must not render opaque ref codes as visible text.
    expect(doc.querySelector("script")).toBeNull()
    expect(items[0]!.textContent).not.toContain("topref1234")
  })
})
