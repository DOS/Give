import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SiteFooter } from "./SiteFooter"

const html = renderToStaticMarkup(createElement(SiteFooter))

describe("SiteFooter", () => {
  it("links Give's contact address under the brand line (DOS/Give#205)", () => {
    const row = html.match(/<p class="([^"]*)"><a href="mailto:help@dos\.me" class="([^"]*)">([^<]*)<\/a><\/p>/)
    expect(row).not.toBeNull()
    expect(row?.[3]).toBe("Liên hệ: help@dos.me")
    // The same 28px box in a 36px row as the sitemap links (DESIGN.md 6, Focus ring; 7).
    expect(row?.[1].split(" ")).toEqual(expect.arrayContaining(["mt-1", "relative", "min-h-9", "w-fit"]))
    expect(row?.[2].split(" ")).toEqual(expect.arrayContaining(["min-h-7", "text-muted", "before:absolute"]))
    expect(html.indexOf("Give không giữ tiền.")).toBeLessThan(html.indexOf("mailto:help@dos.me"))
  })

  it("keeps the sitemap links in the same rows", () => {
    expect(html).toMatch(
      /<li class="relative flex min-h-9 w-fit items-center"><a class="[^"]*min-h-7[^"]*" href="\/campaigns">Khám phá chiến dịch<\/a><\/li>/
    )
  })
})
