import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import EmbedNotFound from "./not-found"

const parser = new new Window().DOMParser()

describe("/embed/[slug] EmbedNotFound (DOS/Give#335)", () => {
  it("renders a compact chrome-free card linking out to /campaigns in a new tab", () => {
    const html = renderToStaticMarkup(createElement(EmbedNotFound))
    const doc = parser.parseFromString(html, "text/html")

    expect(doc.querySelector("h1")?.textContent.trim()).toBe("Không tìm thấy chiến dịch")
    const link = doc.querySelector('a[href="/campaigns"]')!
    expect(link).toBeTruthy()
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    expect(doc.querySelectorAll("form")).toHaveLength(0)
  })
})
