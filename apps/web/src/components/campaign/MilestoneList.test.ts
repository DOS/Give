// @vitest-environment happy-dom
/**
 * Covers `MilestoneList` (DOS/Give#268): reached badge (`Đã đạt mốc`) and
 * `unlock_note` (`whitespace-pre-line`) when `raisedAmount >= target_amount`,
 * hidden `unlock_note` on unreached public milestones, and preview verification
 * (`Khi đạt mốc:`) when `raisedAmount === null`.
 */
import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { Milestone } from "@/lib/campaigns"
import { formatVnd } from "@/lib/format"

import { MilestoneList } from "./MilestoneList"

const CAMPAIGN = "33333333-3333-4333-8333-333333333333"

const MILESTONES: readonly Milestone[] = [
  {
    id: "ms-1",
    campaign_id: CAMPAIGN,
    title: "Đổ móng phòng học",
    description: "Hoàn thành nền móng bê tông.",
    target_amount: 30_000_000,
    unlock_note: "Công bố biên bản nghiệm thu móng\nKèm ảnh công trường tuần 1.",
    sort_order: 1,
  },
  {
    id: "ms-2",
    campaign_id: CAMPAIGN,
    title: "Lợp mái tôn chống nóng",
    description: "Lắp khung kèo thép và mái tôn.",
    target_amount: 60_000_000,
    unlock_note: "Mở đăng ký tình nguyện viên sơn tường.",
    sort_order: 2,
  },
  {
    id: "ms-3",
    campaign_id: CAMPAIGN,
    title: "Trang bị bàn ghế",
    description: "   ",
    target_amount: 20_000_000,
    unlock_note: "   ",
    sort_order: 3,
  },
]

function parseDoc(html: string) {
  const win = new Window()
  win.document.body.innerHTML = html
  return win.document
}

describe("MilestoneList (DOS/Give#268)", () => {
  it("renders nothing when milestones is empty", () => {
    const html = renderToStaticMarkup(createElement(MilestoneList, { milestones: [], raisedAmount: 50_000_000 }))
    expect(html).toBe("")
  })

  it("marks reached milestones (including exact boundary) with 'Đã đạt mốc' and renders non-empty unlock_note with whitespace-pre-line", () => {
    const html = renderToStaticMarkup(
      createElement(MilestoneList, { milestones: MILESTONES, raisedAmount: 30_000_000 })
    )
    const doc = parseDoc(html)
    const items = [...doc.querySelectorAll("ol > li")]
    expect(items).toHaveLength(3)

    // Milestone 1: exact boundary (30M === 30M) -> reached badge + unlock_note, no preview prefix.
    expect(items[0].textContent).toContain("Đổ móng phòng học")
    expect(items[0].textContent).toContain(formatVnd(30_000_000))
    expect(items[0].textContent).toContain("Đã đạt mốc")
    expect(items[0].innerHTML).toContain("bg-primary-soft text-primary")
    const unlockP = [...items[0].querySelectorAll("p")].find((p) =>
      p.textContent?.includes("Công bố biên bản nghiệm thu móng")
    )
    expect(unlockP).toBeDefined()
    expect(unlockP?.className).toContain("whitespace-pre-line")
    expect(unlockP?.textContent).toBe("Công bố biên bản nghiệm thu móng\nKèm ảnh công trường tuần 1.")
    expect(items[0].textContent).not.toContain("Khi đạt mốc:")

    // Milestone 2: unreached (30M < 60M) -> no badge and unlock_note stays locked/hidden.
    expect(items[1].textContent).toContain("Lợp mái tôn chống nóng")
    expect(items[1].textContent).toContain(formatVnd(60_000_000))
    expect(items[1].textContent).not.toContain("Đã đạt mốc")
    expect(items[1].textContent).not.toContain("Mở đăng ký tình nguyện viên sơn tường.")
    expect(items[1].textContent).not.toContain("Khi đạt mốc:")

    // Milestone 3: reached (30M >= 20M) with blank description & unlock_note -> badge only, no empty <p>.
    expect(items[2].textContent).toContain("Đã đạt mốc")
    expect(items[2].querySelectorAll("p")).toHaveLength(0)
  })

  it("never marks milestones reached on previews (raisedAmount === null) and prefixes non-empty unlock_note with 'Khi đạt mốc:'", () => {
    const html = renderToStaticMarkup(createElement(MilestoneList, { milestones: MILESTONES, raisedAmount: null }))
    const doc = parseDoc(html)
    const items = [...doc.querySelectorAll("ol > li")]

    expect(html).not.toContain("Đã đạt mốc")

    const previewNote1 = [...items[0].querySelectorAll("p")].find((p) => p.textContent?.includes("Khi đạt mốc:"))
    expect(previewNote1).toBeDefined()
    expect(previewNote1?.className).toContain("whitespace-pre-line")
    expect(previewNote1?.textContent).toContain("Khi đạt mốc: Công bố biên bản nghiệm thu móng")

    const previewNote2 = [...items[1].querySelectorAll("p")].find((p) => p.textContent?.includes("Khi đạt mốc:"))
    expect(previewNote2?.textContent).toBe("Khi đạt mốc: Mở đăng ký tình nguyện viên sơn tường.")

    // Whitespace-only unlock_note produces no preview note.
    expect(items[2].querySelectorAll("p")).toHaveLength(0)
  })

  it("hides both reached badges and preview unlock notes on public pages when totals are unavailable (preview=false, raisedAmount=null)", () => {
    const html = renderToStaticMarkup(
      createElement(MilestoneList, { milestones: MILESTONES, raisedAmount: null, preview: false })
    )
    expect(html).not.toContain("Đã đạt mốc")
    expect(html).not.toContain("Khi đạt mốc:")
    expect(html).not.toContain("Công bố biên bản nghiệm thu móng")
    expect(html).toContain("Hoàn thành nền móng bê tông.")
  })

  it("renders per-milestone disbursement & evidence rollups on public pages and hides them on preview (DOS/Give#314)", () => {
    const rollups = [
      {
        milestone_id: MILESTONES[0].id,
        title: MILESTONES[0].title,
        target_amount: MILESTONES[0].target_amount,
        sort_order: 0,
        disbursed_total: 12_500_000,
        disbursement_count: 2,
        evidence_count: 5,
      },
      {
        milestone_id: MILESTONES[1].id,
        title: MILESTONES[1].title,
        target_amount: MILESTONES[1].target_amount,
        sort_order: 1,
        disbursed_total: 0,
        disbursement_count: 0,
        evidence_count: 0,
      },
    ]
    const publicHtml = renderToStaticMarkup(
      createElement(MilestoneList, {
        milestones: MILESTONES,
        raisedAmount: 25_000_000,
        preview: false,
        rollups,
        statementUrl: "/campaigns/ban-may/statement?filter=out",
      })
    )
    expect(publicHtml).toContain("Đã giải ngân")
    expect(publicHtml).toContain("2 khoản chi")
    expect(publicHtml).toContain("5 chứng từ công khai")
    expect(publicHtml).toContain("/campaigns/ban-may/statement?filter=out")
    expect(publicHtml).toContain("Chưa có khoản chi gắn mốc này")

    const previewHtml = renderToStaticMarkup(
      createElement(MilestoneList, {
        milestones: MILESTONES,
        raisedAmount: null,
        preview: true,
        rollups,
      })
    )
    expect(previewHtml).not.toContain("Đã giải ngân")
    expect(previewHtml).not.toContain("Chưa có khoản chi gắn mốc này")
  })
})
