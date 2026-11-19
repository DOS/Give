import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Markdown } from "./Markdown"

const render = (markdown: string) => renderToStaticMarkup(createElement(Markdown, null, markdown))

describe("Markdown (DOS/Give#270)", () => {
  it("renders headings, unordered/ordered lists, blockquotes, and inline emphasis", () => {
    const html = render(
      [
        "# Mục tiêu chiến dịch",
        "## Hạng mục xây dựng",
        "### Tiến độ tuần 1",
        "",
        "- Khảo sát địa điểm",
        "- Chuẩn bị **vật tư** và *nhân công*",
        "",
        "1. Đổ móng",
        "2. Lắp dầm",
        "",
        "> Mọi khoản thu chi đều có chứng từ đối chiếu.",
      ].join("\n")
    )

    expect(html).toContain("<h1>Mục tiêu chiến dịch</h1>")
    expect(html).toContain("<h2>Hạng mục xây dựng</h2>")
    expect(html).toContain("<h3>Tiến độ tuần 1</h3>")
    expect(html).toContain("<ul>")
    expect(html).toContain("<li>Khảo sát địa điểm</li>")
    expect(html).toContain("<strong>vật tư</strong>")
    expect(html).toContain("<em>nhân công</em>")
    expect(html).toContain("<ol>")
    expect(html).toContain("<li>Đổ móng</li>")
    expect(html).toContain("<blockquote>")
    expect(html).toContain("Mọi khoản thu chi đều có chứng từ đối chiếu.")
  })

  it("renders links with rel='nofollow ugc noopener noreferrer' and target='_blank'", () => {
    const html = render(
      "Xem [báo cáo minh bạch](https://give.vn/campaigns/xay-cau/statement) hoặc [email](mailto:hi@give.vn)."
    )

    expect(html).toContain(
      '<a href="https://give.vn/campaigns/xay-cau/statement" rel="nofollow ugc noopener noreferrer" target="_blank">báo cáo minh bạch</a>'
    )
    expect(html).toContain(
      '<a href="mailto:hi@give.vn" rel="nofollow ugc noopener noreferrer" target="_blank">email</a>'
    )
  })

  it("escapes raw HTML <script> and inline event-handler tags instead of rendering raw DOM elements", () => {
    const html = render('Đoạn văn <script>window.__xss = true</script> và <div onclick="alert(1)">nhãn</div>.')

    expect(html).not.toContain("<script")
    expect(html).not.toContain("<div onclick=")
    expect(html).toContain("&lt;script&gt;window.__xss = true&lt;/script&gt;")
    expect(html).toContain("&lt;div onclick=&quot;alert(1)&quot;&gt;nhãn&lt;/div&gt;")
  })

  it("strips unsafe javascript: and data: URLs from links", () => {
    const html = render(
      [
        "[Bấm vào đây](javascript:alert(1))",
        "[Viết hoa](JAVASCRIPT:alert(2))",
        "[Tệp nhúng](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
      ].join("\n\n")
    )

    expect(html).not.toContain("javascript:")
    expect(html).not.toContain("JAVASCRIPT:")
    expect(html).not.toContain("data:text/html")
    expect(html).toContain('<a href="" rel="nofollow ugc noopener noreferrer" target="_blank">Bấm vào đây</a>')
    expect(html).toContain('<a href="" rel="nofollow ugc noopener noreferrer" target="_blank">Viết hoa</a>')
    expect(html).toContain('<a href="" rel="nofollow ugc noopener noreferrer" target="_blank">Tệp nhúng</a>')
  })

  it("disallows and unwraps markdown <img> elements while preserving surrounding content", () => {
    const html = render(
      "Trước ảnh ![Ảnh theo dõi](https://tracker.example/pixel.gif) sau ảnh và [![Biểu ngữ](https://tracker.example/banner.png)](https://give.vn)."
    )

    expect(html).not.toContain("<img")
    expect(html).not.toContain("tracker.example")
    expect(html).toContain("Trước ảnh ")
    expect(html).toContain(" sau ảnh")
    expect(html).toContain('<a href="https://give.vn" rel="nofollow ugc noopener noreferrer" target="_blank">')
  })
})
