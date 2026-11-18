/**
 * Unit coverage for `SummaryCells` (DOS/Give#234): `<dl aria-label>`,
 * `<dt>`/`<dd>` VND formatting via `formatVnd`, optional `data-figure` hooks,
 * and `default` / `primary` / `accent` tone classes.
 */
import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { formatVnd } from "@/lib/format"

import { SummaryCells, type SummaryCell } from "./SummaryCells"

function renderSummary(label: string, cells: readonly SummaryCell[]) {
  const win = new Window()
  win.document.body.innerHTML = renderToStaticMarkup(createElement(SummaryCells, { label, cells }))
  return win.document
}

describe("SummaryCells (DOS/Give#234)", () => {
  it("renders a labelled <dl> with <dt> labels, formatVnd <dd> figures, and data-figure hooks", () => {
    const cells: SummaryCell[] = [
      { label: "Đã nhận", amount: 12_500_000, figure: "paid", tone: "primary" },
      { label: "Đã giải ngân", amount: 4_200_000, figure: "disbursed", tone: "default" },
      { label: "Chưa giải trình", amount: 300_000, figure: "unexplained", tone: "accent" },
      { label: "Còn trong tài khoản", amount: 8_300_000 },
    ]

    const doc = renderSummary("Tóm tắt sao kê", cells)
    const dl = doc.querySelector("dl")!
    expect(dl).toBeTruthy()
    expect(dl.getAttribute("aria-label")).toBe("Tóm tắt sao kê")

    const terms = [...dl.querySelectorAll("dt")]
    const descriptions = [...dl.querySelectorAll("dd")]
    expect(terms.map((dt) => dt.textContent)).toEqual(cells.map((cell) => cell.label))
    expect(descriptions.map((dd) => dd.textContent)).toEqual(cells.map((cell) => formatVnd(cell.amount)))

    expect(descriptions[0].getAttribute("data-figure")).toBe("paid")
    expect(descriptions[1].getAttribute("data-figure")).toBe("disbursed")
    expect(descriptions[2].getAttribute("data-figure")).toBe("unexplained")
    expect(descriptions[3].hasAttribute("data-figure")).toBe(false)
    for (const dd of descriptions) {
      expect(dd.className).toContain("tabular-nums")
    }
  })

  it("maps omitted, default, primary, and accent tones to the expected text color classes", () => {
    const doc = renderSummary("Bốn sắc thái số liệu", [
      { label: "Mặc định ngầm", amount: 0 },
      { label: "Mặc định tường minh", amount: 50_000, tone: "default" },
      { label: "Chính", amount: 1_000_000, tone: "primary" },
      { label: "Nhấn", amount: 250_000, tone: "accent" },
    ])

    const [implicitDefault, explicitDefault, primary, accent] = [...doc.querySelectorAll("dd")]

    expect(implicitDefault.textContent).toBe(formatVnd(0))
    expect(implicitDefault.classList.contains("text-fg")).toBe(true)
    expect(implicitDefault.classList.contains("text-primary")).toBe(false)
    expect(implicitDefault.classList.contains("text-accent")).toBe(false)

    expect(explicitDefault.classList.contains("text-fg")).toBe(true)
    expect(explicitDefault.classList.contains("text-primary")).toBe(false)
    expect(explicitDefault.classList.contains("text-accent")).toBe(false)

    expect(primary.classList.contains("text-primary")).toBe(true)
    expect(primary.classList.contains("text-fg")).toBe(false)
    expect(primary.classList.contains("text-accent")).toBe(false)

    expect(accent.classList.contains("text-accent")).toBe(true)
    expect(accent.classList.contains("text-fg")).toBe(false)
    expect(accent.classList.contains("text-primary")).toBe(false)
  })
})
