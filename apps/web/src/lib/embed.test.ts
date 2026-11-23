import { describe, expect, it } from "vitest"

import {
  buildCampaignOutboundUrl,
  buildEmbedIframeCode,
  buildEmbedPath,
  buildEmbedUrl,
  EMBED_HEIGHT_COMPACT,
  EMBED_HEIGHT_DEFAULT,
  escapeHtmlAttr,
  parseEmbedOptions,
} from "./embed"

describe("embed helpers (DOS/Give#335)", () => {
  it("parses allowlisted theme, compact, and ref query options safely", () => {
    expect(parseEmbedOptions()).toEqual({ theme: "light", compact: false, ref: null })
    expect(parseEmbedOptions({ theme: "dark", compact: "1", ref: "AB23CD45EF" })).toEqual({
      theme: "dark",
      compact: true,
      ref: "ab23cd45ef",
    })
    expect(parseEmbedOptions({ theme: "auto", compact: "0", ref: "1234abcd" })).toEqual({
      theme: "auto",
      compact: false,
      ref: "1234abcd",
    })
    // Untrusted/XSS values fall back to safe defaults
    expect(
      parseEmbedOptions({
        theme: 'dark" onload="alert(1)',
        compact: "true",
        ref: "javascript:alert(1)",
      })
    ).toEqual({
      theme: "light",
      compact: false,
      ref: null,
    })
    // Array query values pick first element safely
    expect(parseEmbedOptions({ theme: ["dark", "light"], compact: ["1", "0"] })).toEqual({
      theme: "dark",
      compact: true,
      ref: null,
    })
  })

  it("builds canonical embed and outbound campaign URLs without invalid origins or bad refs", () => {
    expect(buildEmbedPath("xay-truong")).toBe("/embed/xay-truong")
    expect(buildEmbedPath("xay-truong", { theme: "light", compact: false })).toBe("/embed/xay-truong")
    expect(buildEmbedPath("xay-truong", { theme: "dark", compact: true, ref: "AB23CD45EF" })).toBe(
      "/embed/xay-truong?theme=dark&compact=1&ref=ab23cd45ef"
    )

    expect(buildEmbedUrl("xay-truong", { origin: "https://give.vn/" })).toBe("https://give.vn/embed/xay-truong")
    expect(buildEmbedUrl("xay-truong", { origin: "javascript:alert(1)" })).toBe("/embed/xay-truong")

    expect(buildCampaignOutboundUrl("xay-truong", { origin: "https://give.vn", ref: "ab23cd45ef" })).toBe(
      "https://give.vn/campaigns/xay-truong?ref=ab23cd45ef"
    )
    expect(buildCampaignOutboundUrl("xay-truong", { origin: "https://give.vn", ref: "bad!!ref" })).toBe(
      "https://give.vn/campaigns/xay-truong"
    )
  })

  it("escapes HTML attributes and builds valid iframe snippets in default and compact modes", () => {
    expect(escapeHtmlAttr(`a & "b" 'c' <d>`)).toBe("a &amp; &quot;b&quot; &#39;c&#39; &lt;d&gt;")

    const defaultSnippet = buildEmbedIframeCode({
      slug: "xay-truong",
      title: 'Xây "trường" & lớp <mới>',
      origin: "https://give.vn",
    })
    expect(defaultSnippet).toBe(
      '<iframe src="https://give.vn/embed/xay-truong" title="Xây &quot;trường&quot; &amp; lớp &lt;mới&gt; · Give" width="100%" height="280" style="border:0;border-radius:12px;overflow:hidden" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>'
    )
    expect(defaultSnippet).toContain(`height="${EMBED_HEIGHT_DEFAULT}"`)

    const compactDark = buildEmbedIframeCode({
      slug: "xay-truong",
      title: "Xây trường\nBản Mây",
      origin: "https://give.vn",
      theme: "dark",
      compact: true,
      ref: "AB23CD45EF",
    })
    expect(compactDark).toContain('src="https://give.vn/embed/xay-truong?theme=dark&amp;compact=1&amp;ref=ab23cd45ef"')
    expect(compactDark).toContain('title="Xây trường Bản Mây · Give"')
    expect(compactDark).toContain(`height="${EMBED_HEIGHT_COMPACT}"`)
    expect(compactDark).toContain('referrerpolicy="strict-origin-when-cross-origin"')
  })
})
