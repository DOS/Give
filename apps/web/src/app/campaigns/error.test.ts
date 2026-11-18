// @vitest-environment happy-dom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { default: CampaignsErrorPage } = await import("./error")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("/campaigns ErrorPage (DOS/Give#240)", () => {
  it("renders a whole-page EmptyState with secondary discovery link before primary retry button and forwards retry()", () => {
    const retry = vi.fn()

    act(() => {
      root.render(createElement(CampaignsErrorPage, { error: new Error("timeout"), retry }))
    })

    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain("container-page")

    const icon = container.querySelector("svg")
    expect(icon?.getAttribute("width")).toBe("40")
    expect(icon?.getAttribute("height")).toBe("40")

    expect(container.querySelector("h1")?.textContent).toBe("Không tải được chiến dịch")
    expect(container.querySelector("p")?.textContent).toBe(
      "Không đọc được dữ liệu chiến dịch lúc này. Hãy thử lại sau ít phút."
    )

    const discoveryLink = container.querySelector<HTMLAnchorElement>('a[href="/campaigns"]')!
    expect(discoveryLink).toBeTruthy()
    expect(discoveryLink.textContent).toBe("Khám phá chiến dịch")
    expect(discoveryLink.className).toContain("btn-secondary")

    const retryButton = container.querySelector<HTMLButtonElement>('button[type="button"]')!
    expect(retryButton).toBeTruthy()
    expect(retryButton.textContent).toBe("Thử lại")
    expect(retryButton.className).toContain("btn-primary")
    expect(retry).not.toHaveBeenCalled()

    // DESIGN.md 6: whole-page empty state places secondary button before primary.
    const actionGroup = discoveryLink.parentElement!
    expect([...actionGroup.children]).toEqual([discoveryLink, retryButton])

    act(() => {
      retryButton.click()
    })
    expect(retry).toHaveBeenCalledTimes(1)

    act(() => {
      retryButton.click()
    })
    expect(retry).toHaveBeenCalledTimes(2)
  })
})
