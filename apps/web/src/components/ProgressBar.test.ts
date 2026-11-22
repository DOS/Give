import { createElement, type ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ProgressBar } from "./ProgressBar"

const render = (props: ComponentProps<typeof ProgressBar>) => renderToStaticMarkup(createElement(ProgressBar, props))

describe("ProgressBar (DOS/Give#270)", () => {
  it("renders ARIA progressbar attributes, default label, md height, and fill width", () => {
    const html = render({ percent: 64 })

    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-label="Tiến độ gây quỹ"')
    expect(html).toContain('aria-valuemin="0"')
    expect(html).toContain('aria-valuemax="100"')
    expect(html).toContain('aria-valuenow="64"')
    expect(html).toContain('aria-valuetext="64%"')
    expect(html).toContain("h-2")
    expect(html).not.toContain("h-1.5")
    expect(html).toContain('<div class="h-full rounded bg-primary" style="width:64%"></div>')
  })

  it("clamps negative percentages to 0% and percentages above 100 to 100%", () => {
    const belowZero = render({ percent: -25 })
    expect(belowZero).toContain('aria-valuenow="0"')
    expect(belowZero).toContain('aria-valuetext="0%"')
    expect(belowZero).toContain('style="width:0%"')

    const zero = render({ percent: 0 })
    expect(zero).toContain('aria-valuenow="0"')
    expect(zero).toContain('style="width:0%"')

    const hundred = render({ percent: 100 })
    expect(hundred).toContain('aria-valuenow="100"')
    expect(hundred).toContain('style="width:100%"')

    const overfunded = render({ percent: 185 })
    expect(overfunded).toContain('aria-valuenow="100"')
    expect(overfunded).toContain('aria-valuetext="100%"')
    expect(overfunded).toContain('style="width:100%"')
  })

  it("supports sm card height, custom accessible label, fractional percentages, and extra className", () => {
    const html = render({
      percent: 37.5,
      size: "sm",
      label: "Tiến độ cam kết dự án",
      className: "mt-3",
    })

    expect(html).toContain('aria-label="Tiến độ cam kết dự án"')
    expect(html).toContain('aria-valuenow="37.5"')
    expect(html).toContain('aria-valuetext="37.5%"')
    expect(html).toContain("h-1.5")
    expect(html).toContain("mt-3")
    expect(html).toContain('style="width:37.5%"')
  })
})
