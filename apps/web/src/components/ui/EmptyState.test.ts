import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { EmptyState } from "./EmptyState"

const html = (props: Partial<Parameters<typeof EmptyState>[0]> = {}) =>
  renderToStaticMarkup(createElement(EmptyState, { title: "Chưa có gì", ...props }))

describe("EmptyState", () => {
  it("keeps 48px above and below and 16px at the sides by default", () => {
    expect(html()).toContain("px-4 py-12")
  })

  it("adds no padding of its own when flush (DESIGN.md 6, home)", () => {
    const flush = html({ flush: true })
    expect(flush).not.toMatch(/\bp[xytblr]?-\d/)
  })

  it("balances its sentence so no word is left alone on a line", () => {
    expect(html({ children: "Một câu ngắn." })).toContain("text-balance")
  })

  it("is an H3 by default and an H2 at level 2, with the same look", () => {
    expect(html()).toContain('<h3 class="mt-4 text-h3 text-fg">')
    expect(html({ level: 2 })).toContain('<h2 class="mt-4 text-h3 text-fg">')
  })

  it("is the page body at level 1: the page's H1 in the container, text in the text color (DESIGN.md 6)", () => {
    const page = html({ level: 1, children: "Một câu ngắn." })
    expect(page).toContain("container-page py-16 sm:py-24")
    expect(page).toContain('<h1 class="mt-4 text-h1-phone tracking-tight sm:text-h1">')
    expect(page).toMatch(/<p class="[^"]*\bmt-3 text-fg\b[^"]*">/)
    expect(page).toContain("text-balance")
    expect(page).not.toContain('text-muted">Một')
  })
})
