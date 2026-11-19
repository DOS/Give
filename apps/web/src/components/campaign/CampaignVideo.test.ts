// @vitest-environment happy-dom
/**
 * Covers `CampaignVideo` (DOS/Give#268): strict 11-char YouTube ID validation,
 * zero third-party requests before click (Next.js-proxied poster, accessible
 * `min-h-11` play button, privacy hint, and external watch fallback), and
 * click-to-play `youtube-nocookie.com` iframe mounting.
 */
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: ({ fill: _fill, ...rest }: { src: string; alt: string; fill?: boolean; sizes?: string }) =>
    createElement("img", rest),
}))

const { CampaignVideo, isValidYoutubeId, YOUTUBE_ID_PATTERN } = await import("./CampaignVideo")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const VALID_ID = "dQw4w9WgXcQ"
const ALT_VALID_ID = "_-09AZaz_12"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const realError = console.error.bind(console)
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (args[0] instanceof DOMException && args[0].message.includes("Iframe page loading is disabled")) return
    realError(...args)
  })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe("CampaignVideo strict YouTube ID validation (DOS/Give#268)", () => {
  it("accepts only exact 11-character [A-Za-z0-9_-] IDs and renders null for anything else", () => {
    expect(YOUTUBE_ID_PATTERN.source).toBe("^[A-Za-z0-9_-]{11}$")
    expect(isValidYoutubeId(VALID_ID)).toBe(true)
    expect(isValidYoutubeId(ALT_VALID_ID)).toBe(true)

    for (const invalid of [
      "",
      "short12345",
      "toolong12345",
      ` ${VALID_ID}`,
      `${VALID_ID} `,
      "https://youtu.be/dQw4w9WgXcQ",
      "dQw4w9WgXcQ?t=1",
      "../dQw4w9Wg",
      'dQw4w9Wg"<>',
      "dQw4w9WgXcĐ",
      null,
      undefined,
    ]) {
      expect(isValidYoutubeId(invalid)).toBe(false)
      const html = renderToStaticMarkup(
        createElement(CampaignVideo, { youtubeId: (invalid ?? "") as string, title: "Xây trường Bản Mây" })
      )
      expect(html).toBe("")
    }
  })
})

describe("CampaignVideo poster state & click-to-play iframe (DOS/Give#268)", () => {
  it("renders a 16:9 Next.js-proxied poster with zero YouTube embed requests before click", () => {
    act(() => {
      root.render(
        createElement(CampaignVideo, {
          youtubeId: VALID_ID,
          title: "Xây trường Bản Mây",
          alt: "Giới thiệu điểm trường Bản Mây",
        })
      )
    })

    expect(container.querySelector("iframe")).toBeNull()
    expect(container.innerHTML).not.toContain("youtube-nocookie.com")

    const frame = container.querySelector(".aspect-video")
    expect(frame).not.toBeNull()

    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img?.getAttribute("alt")).toBe("Giới thiệu điểm trường Bản Mây")
    // Next.js proxies i.ytimg.com/vi/<id>/hqdefault.jpg server-side via /_next/image.
    const imgSrc = decodeURIComponent(img?.getAttribute("src") ?? "")
    expect(imgSrc).toContain(`https://i.ytimg.com/vi/${VALID_ID}/hqdefault.jpg`)

    const playBtn = container.querySelector<HTMLButtonElement>('button[type="button"]')
    expect(playBtn).not.toBeNull()
    expect(playBtn?.className).toContain("min-h-11")
    expect(playBtn?.className).not.toContain("btn-primary")
    expect(playBtn?.getAttribute("aria-label")).toBe("Phát video: Giới thiệu điểm trường Bản Mây")

    expect(container.textContent).toContain("Bấm để phát video từ YouTube")

    const watchLink = container.querySelector(`a[href="https://www.youtube.com/watch?v=${VALID_ID}"]`)
    expect(watchLink).not.toBeNull()
    expect(watchLink?.textContent).toBe("Mở trên YouTube")
    expect(watchLink?.getAttribute("target")).toBe("_blank")
    expect(watchLink?.getAttribute("rel")).toBe("noopener noreferrer")
    expect(watchLink?.className).toContain("min-h-11")
  })

  it("falls back to campaign title in aria-label and iframe title when alt is null or whitespace", () => {
    act(() => {
      root.render(createElement(CampaignVideo, { youtubeId: VALID_ID, title: "Xây trường Bản Mây", alt: "   " }))
    })

    const playBtn = container.querySelector<HTMLButtonElement>('button[type="button"]')!
    expect(playBtn.getAttribute("aria-label")).toBe("Phát video: Xây trường Bản Mây")
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("Xây trường Bản Mây")

    act(() => {
      playBtn.click()
    })

    const iframe = container.querySelector("iframe")
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute("title")).toBe("Xây trường Bản Mây")
  })

  it("mounts the youtube-nocookie.com iframe on click and resets to poster if youtubeId changes", () => {
    act(() => {
      root.render(
        createElement(CampaignVideo, {
          youtubeId: VALID_ID,
          title: "Xây trường Bản Mây",
          alt: "Video giới thiệu",
        })
      )
    })

    const playBtn = container.querySelector<HTMLButtonElement>('button[type="button"]')!
    act(() => {
      playBtn.click()
    })

    expect(container.querySelector("button")).toBeNull()
    expect(container.querySelector("img")).toBeNull()

    const iframe = container.querySelector("iframe")
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute("src")).toBe(`https://www.youtube-nocookie.com/embed/${VALID_ID}?autoplay=1&rel=0`)
    expect(iframe?.getAttribute("title")).toBe("Video giới thiệu")
    expect(iframe?.getAttribute("allow")).toBe(
      "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
    )
    expect(iframe?.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin")
    // External watch fallback stays available when embeds are blocked.
    expect(container.querySelector(`a[href="https://www.youtube.com/watch?v=${VALID_ID}"]`)).not.toBeNull()

    // Navigating to another campaign video resets back to the privacy poster.
    act(() => {
      root.render(
        createElement(CampaignVideo, {
          youtubeId: ALT_VALID_ID,
          title: "Dự án mới",
          alt: null,
        })
      )
    })
    expect(container.querySelector("iframe")).toBeNull()
    expect(container.querySelector<HTMLButtonElement>('button[type="button"]')?.getAttribute("aria-label")).toBe(
      "Phát video: Dự án mới"
    )
  })
})
