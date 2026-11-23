import { describe, expect, it } from "vitest"

import { buildFaqPageJsonLd, buildProfilePageJsonLd, buildWebsiteJsonLd, safeJsonLd } from "./jsonld"

describe("safeJsonLd", () => {
  it("escapes <, U+2028, and U+2029 while preserving valid JSON round-tripping", () => {
    const payload = {
      name: 'Quỹ </script><script>alert("xss")</script> <!-- test',
      lineSep: "line1\u2028line2\u2029line3",
      vietnamese: "Xây trường Bản Mây ễ ặ ỗ đ Đ",
    }

    const serialized = safeJsonLd(payload)

    expect(serialized).not.toContain("<")
    expect(serialized).not.toContain("\u2028")
    expect(serialized).not.toContain("\u2029")
    expect(serialized).toContain("\\u003c/script>\\u003cscript>")
    expect(serialized).toContain("\\u003c!--")
    expect(serialized).toContain("line1\\u2028line2\\u2029line3")
    expect(JSON.parse(serialized)).toStrictEqual(payload)
  })

  it("handles undefined and null cleanly without throwing", () => {
    expect(safeJsonLd(undefined)).toBe("null")
    expect(safeJsonLd(null)).toBe("null")
  })
})

describe("buildWebsiteJsonLd", () => {
  it("builds schema.org WebSite with SearchAction targeting /campaigns?q=", () => {
    expect(buildWebsiteJsonLd("https://give.vn")).toStrictEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Give",
      url: "https://give.vn",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://give.vn/campaigns?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    })
  })

  it("strips trailing slashes from origin", () => {
    const result = buildWebsiteJsonLd("https://give.vn///")
    expect(result.url).toBe("https://give.vn")
    expect(result.potentialAction.target.urlTemplate).toBe("https://give.vn/campaigns?q={search_term_string}")
  })
})

describe("buildFaqPageJsonLd", () => {
  it("returns null when faqs is empty", () => {
    expect(buildFaqPageJsonLd([])).toBeNull()
  })

  it("builds schema.org FAQPage with Question and Answer entries", () => {
    expect(
      buildFaqPageJsonLd([
        { question: "Tiền đi đâu?", answer: "Vào thẳng tài khoản chiến dịch." },
        { question: "Có sao kê không?", answer: "Có, công khai theo thời gian thực." },
      ])
    ).toStrictEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Tiền đi đâu?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Vào thẳng tài khoản chiến dịch.",
          },
        },
        {
          "@type": "Question",
          name: "Có sao kê không?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Có, công khai theo thời gian thực.",
          },
        },
      ],
    })
  })
})

describe("buildProfilePageJsonLd", () => {
  it("builds ProfilePage with Person by default and omits empty optional fields", () => {
    expect(
      buildProfilePageJsonLd({
        origin: "https://give.vn",
        handle: "anh-binh",
        displayName: "Anh Bình",
        bio: "   ",
        avatarUrl: null,
      })
    ).toStrictEqual({
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url: "https://give.vn/u/anh-binh",
      mainEntity: {
        "@type": "Person",
        name: "Anh Bình",
        alternateName: "@anh-binh",
        url: "https://give.vn/u/anh-binh",
      },
    })
  })

  it("builds ProfilePage with Organization, safe avatarUrl, trimmed bio, and valid dateCreated", () => {
    expect(
      buildProfilePageJsonLd({
        origin: "https://give.vn/",
        handle: "quy-ban-may",
        displayName: "Quỹ Bản Mây",
        kind: "organization",
        bio: "  Hỗ trợ trẻ em vùng cao.  ",
        avatarUrl: "https://cdn.dos.me/avatars/ban-may.webp",
        dateCreated: "2026-10-01T00:00:00Z",
      })
    ).toStrictEqual({
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url: "https://give.vn/u/quy-ban-may",
      dateCreated: "2026-10-01T00:00:00Z",
      mainEntity: {
        "@type": "Organization",
        name: "Quỹ Bản Mây",
        alternateName: "@quy-ban-may",
        url: "https://give.vn/u/quy-ban-may",
        description: "Hỗ trợ trẻ em vùng cao.",
        image: "https://cdn.dos.me/avatars/ban-may.webp",
      },
    })
  })

  it("strips unsafe avatar URLs and non-ISO dateCreated values while keeping ISO-8601 dates", () => {
    for (const badDate of ["not-a-date", "Jan 1, 2026", "2026", "2026-10-01-extra"]) {
      const result = buildProfilePageJsonLd({
        origin: "https://give.vn",
        handle: "quy ban/test",
        displayName: "Test",
        bio: "Bio",
        avatarUrl: "javascript:alert(1)",
        dateCreated: badDate,
      })

      expect(result).toStrictEqual({
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        url: "https://give.vn/u/quy%20ban%2Ftest",
        mainEntity: {
          "@type": "Person",
          name: "Test",
          alternateName: "@quy ban/test",
          url: "https://give.vn/u/quy%20ban%2Ftest",
          description: "Bio",
        },
      })
    }

    expect(
      buildProfilePageJsonLd({
        origin: "https://give.vn",
        handle: "anh-binh",
        displayName: "Anh Bình",
        dateCreated: " 2026-10-01 ",
      }).dateCreated
    ).toBe("2026-10-01")
  })
})
