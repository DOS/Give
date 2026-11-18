// @vitest-environment happy-dom
/**
 * Unit coverage for `/me/campaigns` error boundary (DOS/Give#234):
 * renders `MeError` alert/navigation copy and forwards the `retry` callback
 * when the retry button is activated.
 */
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

const { default: ErrorPage } = await import("./error")

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

describe("/me/campaigns ErrorPage (DOS/Give#234)", () => {
  it("renders MeError and invokes retry when 'Thử lại' is activated", () => {
    const retry = vi.fn()

    act(() => {
      root.render(createElement(ErrorPage, { error: new Error("Không thể kết nối"), retry }))
    })

    expect(container.querySelector("h1")?.textContent).toBe("Không tải được trang này")
    const alert = container.querySelector('[role="alert"]')!
    expect(alert).toBeTruthy()
    expect(alert.textContent).toContain("Dữ liệu của bạn không bị ảnh hưởng")

    const backLink = container.querySelector<HTMLAnchorElement>('a[href="/me/campaigns"]')!
    expect(backLink).toBeTruthy()
    expect(backLink.textContent).toBe("Về Chiến dịch của tôi")
    expect(backLink.className).toContain("btn-secondary")

    const retryButton = container.querySelector<HTMLButtonElement>('button[type="button"]')!
    expect(retryButton).toBeTruthy()
    expect(retryButton.textContent).toBe("Thử lại")
    expect(retryButton.className).toContain("btn-primary")
    expect(retry).not.toHaveBeenCalled()

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
