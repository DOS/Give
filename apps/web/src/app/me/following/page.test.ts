// @vitest-environment happy-dom
import { Writable } from "node:stream"

import { Window } from "happy-dom"
import { createElement, type ReactNode } from "react"
import { renderToPipeableStream } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { publicCoverUrl } from "@/lib/cover-urls"
import { formatVnd } from "@/lib/format"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN_LIVE = "22222222-2222-4222-8222-222222222222"
const CAMPAIGN_PRELAUNCH = "33333333-3333-4333-8333-333333333333"
const CAMPAIGN_SUSPENDED = "44444444-4444-4444-8444-444444444444"
const FORBIDDEN_ORG_ID = "99999999-9999-4999-8999-999999999999"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  tokens: [] as (string | undefined)[],
  serviceUsed: false,
}))

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  })
)

const requireSessionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    user: { id: USER, email: "donor@example.vn", name: "Minh" },
    accessToken: "donor-jwt",
  }))
)

vi.mock("next/navigation", () => ({ redirect: redirectMock }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))
vi.mock("next/image", () => ({
  default: ({
    fill: _fill,
    unoptimized: _unopt,
    ...rest
  }: {
    src: string
    alt: string
    fill?: boolean
    unoptimized?: boolean
  }) => createElement("img", rest),
}))
vi.mock("@/lib/auth/session", () => ({ requireSession: requireSessionMock }))
vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) => {
    state.tokens.push(token)
    return fakeDb((call) => state.handler(call), state.calls)
  },
  dbService: () => {
    state.serviceUsed = true
    return fakeDb(() => undefined)
  },
}))
vi.mock("../_components/MePage", () => ({
  MePage: ({ section, children }: { section: string; children: ReactNode }) =>
    createElement("main", { "data-section": section }, children),
}))
vi.mock("./actions", () => ({
  unfollowFollowedCampaign: vi.fn(async () => ({ ok: true, message: "ok" })),
  unfollowFollowedOrganizer: vi.fn(async () => ({ ok: true, message: "ok" })),
}))

const { default: MyFollowingPage, metadata } = await import("./page")

function renderAsync(node: ReactNode): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = ""
    let failed = false
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        html += chunk.toString()
        callback()
      },
    })
    const { pipe, abort } = renderToPipeableStream(node, {
      onAllReady() {
        if (!failed) pipe(sink)
      },
      onError(error) {
        failed = true
        abort()
        reject(error)
      },
    })
    sink.on("finish", () => {
      if (!failed) resolve(html)
    })
    sink.on("error", reject)
  })
}

async function render() {
  const html = await renderAsync(await MyFollowingPage())
  const doc = new Window().document
  doc.body.innerHTML = html
  return { html, doc }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.calls.length = 0
  state.tokens.length = 0
  state.serviceUsed = false
})

describe("MyFollowingPage (/me/following, DOS/Give#337)", () => {
  it("has non-indexed metadata", () => {
    expect(metadata).toEqual({ title: "Đang theo dõi", robots: { index: false } })
  })

  it.each(["PGRST301", "PGRST303"])(
    "redirects rejected JWT (%s) to /auth/login?return_path=%2Fme%2Ffollowing",
    async (code) => {
      state.handler = () => ({ error: { code, message: "JWT expired" } })
      await expect(renderAsync(await MyFollowingPage())).rejects.toThrow(
        "NEXT_REDIRECT:/auth/login?return_path=%2Fme%2Ffollowing"
      )
      expect(redirectMock).toHaveBeenCalledWith("/auth/login?return_path=%2Fme%2Ffollowing")
    }
  )

  it("renders empty state linking to /campaigns when following nothing", async () => {
    state.handler = () => ({ data: [] })

    const { html, doc } = await render()
    expect(requireSessionMock).toHaveBeenCalledWith("/me/following")
    expect(state.tokens).toEqual(["donor-jwt"])
    expect(state.serviceUsed).toBe(false)
    expect(doc.querySelector("main")?.getAttribute("data-section")).toBe("following")
    expect(doc.querySelector("h1")?.textContent).toBe("Đang theo dõi")
    expect(html).toContain("Bạn chưa theo dõi chiến dịch hay người tổ chức nào.")
    expect(doc.querySelector('a[href="/campaigns"]')?.textContent).toBe("Khám phá chiến dịch")
  })

  it("renders followed campaigns (live with progress & 'Đã ủng hộ', pre-launch teaser without raised totals, non-public without cover/totals) and handle-only organizers", async () => {
    const liveCover = `campaigns/${CAMPAIGN_LIVE}/cover.webp`
    const prelaunchCover = `campaigns/${CAMPAIGN_PRELAUNCH}/cover.webp`
    const suspendedCover = `campaigns/${CAMPAIGN_SUSPENDED}/cover.webp`

    state.handler = (call) => {
      if (call.target === "rpc:list_my_followed_campaigns") {
        return {
          data: [
            {
              campaign_id: CAMPAIGN_LIVE,
              slug: "bep-am-vung-cao",
              type: "give",
              title: "Bếp ấm vùng cao",
              summary: "Bữa ăn cho trẻ em",
              status: "live",
              goal_amount: 100_000_000,
              starts_at: "2026-11-01T00:00:00Z",
              ends_at: "2099-12-31T00:00:00Z",
              prelaunch_public: false,
              cover_storage_path: liveCover,
              cover_alt: null,
              organizer_display_name: "Quỹ Bản Mây",
              organizer_handle: "quy-ban-may",
              organizer_verification_status: "verified",
              received_amount: 45_000_000,
              followed_at: "2026-11-20T00:00:00Z",
              has_supported: true,
            },
            {
              campaign_id: CAMPAIGN_PRELAUNCH,
              slug: "den-hoc-thong-minh",
              type: "back",
              title: "Đèn học thông minh",
              summary: null,
              status: "approved",
              goal_amount: 80_000_000,
              starts_at: "2099-12-15T00:00:00Z",
              ends_at: "2100-01-15T00:00:00Z",
              prelaunch_public: true,
              cover_storage_path: prelaunchCover,
              cover_alt: null,
              organizer_display_name: "Xưởng Ánh Sáng",
              organizer_handle: "admin", // reserved handle -> must NOT link to /u/admin
              organizer_verification_status: "pending",
              received_amount: 9_999_999,
              followed_at: "2026-11-21T00:00:00Z",
              has_supported: false,
            },
            {
              campaign_id: CAMPAIGN_SUSPENDED,
              slug: "tam-dung-test",
              type: "give",
              title: "Chiến dịch tạm dừng",
              summary: null,
              status: "suspended",
              goal_amount: 50_000_000,
              starts_at: "2026-11-01T00:00:00Z",
              ends_at: "2026-12-01T00:00:00Z",
              prelaunch_public: false,
              cover_storage_path: suspendedCover,
              cover_alt: null,
              organizer_display_name: "Tổ chức X",
              organizer_handle: null,
              organizer_verification_status: "unverified",
              received_amount: 12_345_678,
              followed_at: "2026-11-19T00:00:00Z",
              has_supported: false,
            },
          ],
        }
      }
      if (call.target === "rpc:list_my_followed_organizers") {
        return {
          data: [
            {
              handle: "quy-ban-may",
              display_name: "Quỹ Bản Mây",
              avatar_url: "https://cdn.dos.me/avatar.png",
              kind: "organization",
              verification_status: "verified",
              followed_at: "2026-11-18T00:00:00Z",
              // Extra leaked field must never render anywhere in HTML.
              organizer_id: FORBIDDEN_ORG_ID,
              user_id: FORBIDDEN_ORG_ID,
            },
            {
              handle: "admin", // reserved handle must be excluded
              display_name: "Admin Fake",
              avatar_url: null,
              kind: "individual",
              verification_status: "unverified",
              followed_at: "2026-11-18T00:00:00Z",
            },
          ],
        }
      }
      return undefined
    }

    const { html, doc } = await render()
    expect(state.serviceUsed).toBe(false)
    expect(
      op(
        state.calls.find((c) => c.target === "rpc:list_my_followed_campaigns"),
        "args"
      )
    ).toEqual([{ p_limit: 100, p_offset: 0 }])

    // Security invariant: zero organizer_id or user_id anywhere in rendered HTML, URLs, or form inputs.
    expect(html).not.toContain("organizer_id")
    expect(html).not.toContain("user_id")
    expect(html).not.toContain(FORBIDDEN_ORG_ID)
    expect(html).not.toContain("/media/private/")
    expect(doc.querySelector('a[href="/u/admin"]')).toBeNull()

    const sections = [...doc.querySelectorAll("section")]
    expect(sections).toHaveLength(2)

    const campaignItems = [...sections[0].querySelectorAll("li")]
    expect(campaignItems).toHaveLength(3)

    // 1) Live supported campaign: public cover, progress bar, raised/goal, Đã ủng hộ, verified /u/<handle> link, unfollow input.
    const liveHtml = campaignItems[0].innerHTML
    const liveText = campaignItems[0].textContent ?? ""
    expect(liveHtml).toContain(`src="${publicCoverUrl(liveCover)}"`)
    expect(liveHtml).toContain(">Từ thiện<")
    expect(liveHtml).toContain(">Đang gây quỹ<")
    expect(liveHtml).toContain(">Đã ủng hộ<")
    expect(campaignItems[0].querySelector('a[href="/campaigns/bep-am-vung-cao"]')?.textContent).toBe("Bếp ấm vùng cao")
    const orgLink = campaignItems[0].querySelector('a[href="/u/quy-ban-may"]')
    expect(orgLink?.textContent).toBe("Quỹ Bản Mây")
    expect(orgLink?.className).toContain("hit-area")
    expect(liveHtml).toContain('aria-label="Đã xác minh"')
    expect(campaignItems[0].querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("45")
    expect(liveText).toContain(formatVnd(45_000_000))
    expect(liveText).toContain(formatVnd(100_000_000))
    expect(campaignItems[0].querySelector('input[name="campaign_id"]')?.getAttribute("value")).toBe(CAMPAIGN_LIVE)
    expect(campaignItems[0].querySelector('input[name="campaign_slug"]')?.getAttribute("value")).toBe("bep-am-vung-cao")
    expect(campaignItems[0].querySelector('button[type="submit"]')?.className).toBe("btn-secondary")

    // 2) Pre-launch teaser: public cover, "Sắp ra mắt", starts_at launch date, ZERO ProgressBar and ZERO raised totals.
    const prelaunchHtml = campaignItems[1].innerHTML
    const prelaunchText = campaignItems[1].textContent ?? ""
    expect(prelaunchHtml).toContain(`src="${publicCoverUrl(prelaunchCover)}"`)
    expect(prelaunchHtml).toContain(">Dự án sáng tạo<")
    expect(prelaunchHtml).toContain(">Sắp ra mắt<")
    expect(prelaunchHtml).not.toContain(">Đã ủng hộ<")
    expect(prelaunchText).toContain("Mở ngày 15/12/2099")
    expect(campaignItems[1].querySelector('[role="progressbar"]')).toBeNull()
    expect(prelaunchText).not.toContain("đã nhận")
    expect(prelaunchText).not.toContain("đã cam kết")
    expect(prelaunchText).not.toContain(formatVnd(9_999_999))
    expect(campaignItems[1].querySelector('a[href="/u/admin"]')).toBeNull()

    // 3) Suspended non-public campaign: hides cover URL and hides raised totals / progress bar.
    const suspendedHtml = campaignItems[2].innerHTML
    const suspendedText = campaignItems[2].textContent ?? ""
    expect(suspendedHtml).not.toContain(`src="${publicCoverUrl(suspendedCover)}"`)
    expect(suspendedHtml).toContain(">Tạm dừng<")
    expect(campaignItems[2].querySelector('[role="progressbar"]')).toBeNull()
    expect(suspendedText).not.toContain(formatVnd(12_345_678))

    // Followed organizers section: handle-only link, verification badge, kind, follow date, handle-only unfollow input.
    const orgItems = [...sections[1].querySelectorAll("li")]
    expect(orgItems).toHaveLength(1)
    expect(orgItems[0].querySelector('a[href="/u/quy-ban-may"]')?.textContent).toBe("Quỹ Bản Mây")
    expect(orgItems[0].innerHTML).toContain("Đã xác minh")
    expect(orgItems[0].innerHTML).toContain("Tổ chức")
    expect(orgItems[0].innerHTML).toContain("Theo dõi từ 18/11/2026")
    expect(orgItems[0].querySelector('input[name="handle"]')?.getAttribute("value")).toBe("quy-ban-may")
    expect(orgItems[0].textContent).toContain("Bỏ theo dõi")
    expect(orgItems[0].querySelector('button[type="submit"]')?.className).toBe("btn-secondary")
  })
})
