// @vitest-environment happy-dom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import { CreateInviteForm } from "./CreateInviteForm"
import type { CreateInviteResult } from "../member-actions"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const INVITE_ID = "44444444-4444-4444-8444-444444444444"
const TOKEN = "ab".repeat(32)

describe("CreateInviteForm (DOS/Give#253)", () => {
  it("keeps the one-time invite link visible even when limitNotice activates right after creating the 20th pending invite", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    const action = vi.fn(async (): Promise<CreateInviteResult> => ({
      ok: true,
      message: "Đã tạo liên kết mời.",
      invite: {
        inviteId: INVITE_ID,
        path: `/invites/${TOKEN}`,
        expiresAt: "2026-12-01T00:00:00Z",
      },
    }))

    try {
      await act(async () => {
        root.render(createElement(CreateInviteForm, { action, origin: "https://beta.give.vn", limitNotice: null }))
      })

      const form = container.querySelector("form")
      expect(form).not.toBeNull()

      await act(async () => {
        form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      })

      expect(action).toHaveBeenCalledTimes(1)
      const urlInput = container.querySelector(
        'input[aria-label="Liên kết mời đồng tổ chức"]'
      ) as HTMLInputElement | null
      expect(urlInput?.value).toBe(`https://beta.give.vn/invites/${TOKEN}`)

      // Simulate RSC revalidation returning limitNotice (20/20 pending invites reached).
      await act(async () => {
        root.render(
          createElement(CreateInviteForm, {
            action,
            origin: "https://beta.give.vn",
            limitNotice: "Chiến dịch đang có 20 lời mời chờ chấp nhận.",
          })
        )
      })

      // Creation form is hidden behind the warning notice, while the one-time link stays copyable.
      expect(container.querySelector("form")).toBeNull()
      expect(container.textContent).toContain("Chiến dịch đang có 20 lời mời chờ chấp nhận.")
      const persistedInput = container.querySelector(
        'input[aria-label="Liên kết mời đồng tổ chức"]'
      ) as HTMLInputElement | null
      expect(persistedInput?.value).toBe(`https://beta.give.vn/invites/${TOKEN}`)
      expect(container.textContent).toContain("Sao chép liên kết")
    } finally {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  })
})
