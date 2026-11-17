import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SearchIcon } from "./icons"

const stroke = (props: Parameters<typeof SearchIcon>[0] = {}) =>
  renderToStaticMarkup(createElement(SearchIcon, props)).match(/stroke-width="([^"]+)"/)?.[1]

describe("Icon stroke (DESIGN.md 9)", () => {
  it("draws 1.5 on the 24px grid at 24px and below", () => {
    expect(stroke()).toBe("1.5")
    expect(stroke({ width: 16, height: 16 })).toBe("1.5")
    expect(stroke({ width: 24, height: 24 })).toBe("1.5")
  })

  it("keeps a 1.5px stroke on screen when drawn larger", () => {
    // 0.9 on the 24px grid, scaled to 40px, is 1.5px.
    expect(stroke({ width: 40, height: 40 })).toBe("0.9")
  })

  it("lets a caller set its own stroke", () => {
    expect(stroke({ width: 40, height: 40, strokeWidth: 2 })).toBe("2")
  })
})
