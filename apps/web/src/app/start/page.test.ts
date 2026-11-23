import { Window } from "happy-dom"
import { Writable } from "node:stream"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { renderToPipeableStream } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { requireSession } from "@/lib/auth/session"
import type { Organizer } from "@/lib/campaigns"
import { dbAs } from "@/lib/supabase"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const WARNING = "Đổi tên hoặc loại hồ sơ sẽ cần xác minh lại."

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))
vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn(), getSession: vi.fn() }))
vi.mock("@/lib/supabase", () => ({
  dbAs: vi.fn(() => fakeDb((call) => state.handler(call), state.calls)),
}))

const { default: StartPage } = await import("./page")

function renderAsync(node: ReactNode): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = ""
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        html += chunk.toString()
        callback()
      },
    })
    const { pipe } = renderToPipeableStream(node, {
      onAllReady() {
        pipe(sink)
      },
      onError(error) {
        reject(error)
      },
    })
    sink.on("finish", () => resolve(html))
    sink.on("error", reject)
  })
}

function organizer(verification_status: Organizer["verification_status"]): Organizer {
  return {
    user_id: USER,
    kind: "organization",
    legal_name: "Quỹ học bổng vùng cao",
    display_name: "Quỹ vùng cao",
    phone: "0901234567",
    verification_status,
    verified_at: verification_status === "verified" ? "2026-11-02T00:00:00Z" : null,
    created_at: "2026-11-01T00:00:00Z",
  }
}

function expectOrganizerRead() {
  expect(requireSession).toHaveBeenCalledExactlyOnceWith("/start")
  expect(dbAs).toHaveBeenCalledExactlyOnceWith("token")
  expect(state.calls).toHaveLength(1)
  expect(state.calls[0].target).toBe("organizers")
  expect(op(state.calls[0], "eq")).toEqual(["user_id", USER])
  expect(op(state.calls[0], "maybeSingle")).toEqual([])
}

beforeEach(() => {
  vi.clearAllMocks()
  state.calls.length = 0
  state.handler = () => undefined
  vi.mocked(requireSession).mockResolvedValue({ user: { id: USER, email: null, name: null }, accessToken: "token" })
})

describe("StartPage (DOS/Give#208)", () => {
  it("delegates anonymous visitors to requireSession('/start') and propagates its login redirect before querying", async () => {
    vi.mocked(requireSession).mockImplementationOnce(async () => redirect("/auth/login?return_path=%2Fstart"))
    await expect(StartPage()).rejects.toThrow("NEXT_REDIRECT /auth/login?return_path=%2Fstart")
    expect(requireSession).toHaveBeenCalledExactlyOnceWith("/start")
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/auth/login?return_path=%2Fstart")
    expect(dbAs).not.toHaveBeenCalled()
    expect(state.calls).toHaveLength(0)
  })

  it("renders organizer onboarding without draft creation for a user with no profile, with field hints and phone maxLength", async () => {
    const html = await renderAsync(await StartPage())
    expectOrganizerRead()
    expect(html).toContain("Hồ sơ người tổ chức")
    expect(html).toContain(">Tạo hồ sơ</button>")
    expect(html).not.toContain("Chiến dịch mới")
    expect(html).not.toContain("Tạo bản nháp")
    expect(html).not.toContain("<details")
    expect(html).not.toContain(WARNING)

    const doc = new Window().document
    doc.body.innerHTML = html
    expect(doc.querySelector("fieldset")?.getAttribute("aria-describedby")).toBeNull()
    expect(doc.querySelector("#legal_name")?.getAttribute("aria-describedby")).toBe("legal_name_hint")
    expect(doc.querySelector("#legal_name_hint")?.textContent).toBe(
      "Không công khai. Phải khớp tên chủ tài khoản nhận tiền."
    )
    expect(doc.querySelector("#display_name")?.getAttribute("aria-describedby")).toBe("display_name_hint")
    expect(doc.querySelector("#display_name_hint")?.textContent).toBe("Hiện trên trang chiến dịch.")
    const phone = doc.querySelector("#phone")
    expect(phone?.getAttribute("maxlength")).toBe("20")
    expect(phone?.getAttribute("aria-describedby")).toBe("phone_hint")
    expect(doc.querySelector("#phone_hint")?.textContent).toBe(
      "Không công khai. Kiểm duyệt viên dùng để liên hệ khi cần."
    )
    expect(doc.querySelector("#organizer_reverify_hint")).toBeNull()
  })

  it.each([
    ["verified", "Đã xác minh", true],
    ["pending", "Đang xác minh", true],
    ["unverified", "Chưa xác minh", false],
    ["rejected", "Bị từ chối xác minh", false],
  ] as const)(
    "renders a %s organizer's draft form, collapsed profile and verification badge",
    async (status, label, warns) => {
      state.handler = () => ({ data: organizer(status) })
      const html = await renderAsync(await StartPage())
      expectOrganizerRead()
      expect(html).toContain("Chiến dịch mới")
      expect(html).toContain(">Tạo bản nháp</button>")
      expect(html).toContain(">Lưu hồ sơ</button>")
      expect(html).not.toContain(">Tạo hồ sơ</button>")

      const details = /<details\b([^>]*)>([\s\S]*?)<\/details>/.exec(html)
      expect(details).not.toBeNull()
      expect(details?.[1]).not.toMatch(/\bopen\b/)
      const summary = /<summary\b[^>]*>([\s\S]*?)<\/summary>/.exec(details?.[2] ?? "")?.[1]
      expect(summary).toContain("Hồ sơ người tổ chức:")
      expect(summary).toContain("Quỹ vùng cao")
      expect(summary).toContain(label)
      expect(details?.[2]).toContain('name="legal_name"')
      expect(details?.[2]).toContain('value="Quỹ học bổng vùng cao"')
      expect(details?.[2]).toContain('value="Quỹ vùng cao"')
      expect(details?.[2]).toContain('value="0901234567"')
      expect(html.includes(WARNING)).toBe(warns)
      if (warns) expect(details?.[2]).toContain(WARNING)

      const doc = new Window().document
      doc.body.innerHTML = html
      const fieldsets = doc.querySelectorAll("fieldset")
      expect(fieldsets[0]?.getAttribute("aria-describedby")).toBe("campaign_type_hint")
      expect(doc.querySelector("#campaign_type_hint")?.textContent).toBe("Không đổi được loại sau khi gửi duyệt.")
      expect(fieldsets[1]?.getAttribute("aria-describedby")).toBe(warns ? "organizer_reverify_hint" : null)
      expect(doc.querySelector("#legal_name")?.getAttribute("aria-describedby")).toBe(
        warns ? "legal_name_hint organizer_reverify_hint" : "legal_name_hint"
      )
      expect(doc.querySelector("#display_name")?.getAttribute("aria-describedby")).toBe(
        warns ? "display_name_hint organizer_reverify_hint" : "display_name_hint"
      )
      expect(doc.querySelector("#phone")?.getAttribute("maxlength")).toBe("20")
      expect(doc.querySelector("#phone")?.getAttribute("aria-describedby")).toBe("phone_hint")
      expect(Boolean(doc.querySelector("#organizer_reverify_hint"))).toBe(warns)

      const templateGroup = doc.querySelector('[role="radiogroup"]')
      expect(templateGroup).not.toBeNull()
      expect(doc.querySelectorAll('button[role="radio"]')).toHaveLength(5)
      expect(doc.querySelector('input[type="hidden"][name="template_id"]')?.getAttribute("value")).toBe("blank")
    }
  )
})
