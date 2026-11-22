import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { FollowButton } from "./FollowButton"

function render(props: Parameters<typeof FollowButton>[0]) {
  const html = renderToStaticMarkup(createElement(FollowButton, props))
  const win = new Window()
  win.document.body.innerHTML = html
  return { html, doc: win.document }
}

describe("FollowButton (DOS/Give#315)", () => {
  const noopAction = vi.fn(async (s) => s)

  it("renders a login redirect link with return_path for guests (no form submit)", () => {
    const { doc } = render({
      following: false,
      count: 12,
      signedIn: false,
      loginHref: "/auth/login?return_path=%2Fcampaigns%2Fsap-ra-mat",
      action: noopAction,
      followLabel: "Nhận thông báo khi mở",
      countNoun: "người đang chờ",
      primary: true,
      full: true,
    })

    const link = doc.querySelector("a")
    expect(link?.getAttribute("href")).toBe("/auth/login?return_path=%2Fcampaigns%2Fsap-ra-mat")
    expect(link?.textContent).toContain("Nhận thông báo khi mở")
    expect(doc.querySelector("form")).toBeNull()
    expect(doc.body.textContent).toContain("12 người đang chờ")
  })

  it("renders an accessible toggle form for signed-in users with aria-pressed and hidden intent", () => {
    const notFollowing = render({
      following: false,
      count: 0,
      signedIn: true,
      loginHref: "/auth/login",
      action: noopAction,
    })
    expect(notFollowing.doc.querySelector('input[name="intent"]')?.getAttribute("value")).toBe("follow")
    expect(notFollowing.doc.querySelector("button")?.getAttribute("aria-pressed")).toBe("false")
    expect(notFollowing.doc.querySelector("button")?.textContent).toContain("Theo dõi")
    expect(notFollowing.doc.body.textContent).not.toContain("người theo dõi")

    const following = render({
      following: true,
      count: 5,
      signedIn: true,
      loginHref: "/auth/login",
      action: noopAction,
      followingLabel: "Đã đăng ký nhận thông báo",
    })
    expect(following.doc.querySelector('input[name="intent"]')?.getAttribute("value")).toBe("unfollow")
    expect(following.doc.querySelector("button")?.getAttribute("aria-pressed")).toBe("true")
    expect(following.doc.querySelector("button")?.textContent).toContain("Đã đăng ký nhận thông báo")
    expect(following.doc.body.textContent).toContain("5 người theo dõi")
  })
})
