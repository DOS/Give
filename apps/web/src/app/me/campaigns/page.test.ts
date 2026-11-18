import { Writable } from "node:stream"
import { createElement, type ReactNode } from "react"
import { renderToPipeableStream } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignStatus, CampaignType, CampaignWithRefs } from "@/lib/campaigns"
import { privateCoverUrl } from "@/lib/cover-urls"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN_A = "22222222-2222-4222-8222-222222222222"
const CAMPAIGN_B = "33333333-3333-4333-8333-333333333333"
const CAMPAIGN_C = "44444444-4444-4444-8444-444444444444"
const CAMPAIGN_D = "55555555-5555-4555-8555-555555555555"

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
    user: { id: USER, email: "organizer@example.vn", name: "Lan" },
    accessToken: "organizer-jwt",
  }))
)

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}))
vi.mock("@/lib/auth/session", () => ({
  requireSession: requireSessionMock,
}))
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

const { default: MyCampaignsPage } = await import("./page")

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
      if (!failed) resolve(html.replace(/\u00a0/g, " "))
    })
    sink.on("error", reject)
  })
}

function makeCampaign(
  overrides: Partial<CampaignWithRefs> & { id: string; slug: string; type: CampaignType; status: CampaignStatus }
): CampaignWithRefs {
  return {
    organizer_id: USER,
    funding_model: overrides.type === "give" ? "flexible" : "all_or_nothing",
    category_id: null,
    title: `Chiến dịch ${overrides.slug}`,
    summary: "Tóm tắt",
    story: "Câu chuyện",
    beneficiary_name: null,
    beneficiary_relation: null,
    cover_media_id: null,
    asset: "VND",
    goal_amount: 15_000_000,
    min_contribution: 20_000,
    stretch_goal_amount: null,
    display_options: { progress_bar: true, backers_count: true, time_remaining: true },
    starts_at: null,
    ends_at: "2026-12-31T00:00:00Z",
    payment_window_days: 7,
    review_note: null,
    submitted_at: null,
    approved_at: null,
    outcome_at: null,
    created_at: "2026-11-10T03:00:00Z",
    updated_at: "2026-11-10T03:00:00Z",
    category: null,
    cover: null,
    ...overrides,
  }
}

beforeEach(() => {
  redirectMock.mockClear()
  requireSessionMock.mockClear()
  state.calls.length = 0
  state.tokens.length = 0
  state.serviceUsed = false
})

describe("MyCampaignsPage (DOS/Give#217, DOS/Give#260)", () => {
  it("requires /me/campaigns session, queries managed_campaigns via dbAs(accessToken), and renders level-2 EmptyState with PageHeader as sole CTA", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: [] }
      return undefined
    }

    const html = await renderAsync(await MyCampaignsPage())

    expect(requireSessionMock).toHaveBeenCalledTimes(1)
    expect(requireSessionMock).toHaveBeenCalledWith("/me/campaigns")
    expect(state.tokens).toEqual(["organizer-jwt"])
    expect(state.serviceUsed).toBe(false)

    const call = state.calls.find((c) => c.target === "rpc:managed_campaigns")
    expect(call).toBeDefined()
    expect(op(call, "eq")).toEqual(["organizer_id", USER])

    expect(html).toContain('data-section="campaigns"')
    expect(html).toMatch(/<h1[^>]*>Chiến dịch của tôi<\/h1>/)
    expect(html).toMatch(/<h2[^>]*>Bạn chưa có chiến dịch nào\.<\/h2>/)
    expect([...html.matchAll(/href="\/start"/g)]).toHaveLength(1)
    expect(html).toContain(">Tạo chiến dịch<")
    expect(html).not.toContain("<ul")
  })

  it.each(["PGRST301", "PGRST303"])(
    "redirects to /auth/login?return_path=%2Fme%2Fcampaigns when listMyCampaigns rejects an expired JWT (%s)",
    async (code) => {
      state.handler = (call) => {
        if (call.target === "rpc:managed_campaigns") {
          return { error: { code, message: "JWT expired" } }
        }
        return undefined
      }

      const expectedLogin = "/auth/login?return_path=%2Fme%2Fcampaigns"
      await expect(renderAsync(await MyCampaignsPage())).rejects.toThrow(`NEXT_REDIRECT:${expectedLogin}`)
      expect(redirectMock).toHaveBeenCalledWith(expectedLogin)
    }
  )

  it("rethrows non-JWT database errors instead of redirecting to login", async () => {
    const dbError = { code: "XX000", message: "database unavailable" }
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { error: dbError }
      return undefined
    }

    await expect(renderAsync(await MyCampaignsPage())).rejects.toBe(dbError)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("renders h2 titles, sr-only row link disambiguators, private cover vs placeholder, and changes_requested & suspended review notes", async () => {
    const coverPath = "campaigns/22222222-2222-4222-8222-222222222222/cover.webp"
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") {
        return {
          data: [
            makeCampaign({
              id: CAMPAIGN_A,
              slug: "bep-am-vung-cao",
              title: "Bếp ấm vùng cao",
              type: "give",
              status: "live",
              goal_amount: 25_000_000,
              review_note: "Ghi chú cũ không hiện khi đang gây quỹ",
              cover: { storage_path: coverPath, alt: "Ảnh bìa" },
            }),
            makeCampaign({
              id: CAMPAIGN_B,
              slug: "sach-anh-thieu-nhi",
              title: "Sách ảnh thiếu nhi",
              type: "back",
              status: "changes_requested",
              review_note: "Bổ sung dự toán in ấn,\ncần hỏi viết cho hi@give.vn",
              cover: null,
            }),
            makeCampaign({
              id: CAMPAIGN_C,
              slug: "album-nhac-indie",
              title: "Album nhạc indie",
              type: "back",
              status: "changes_requested",
              review_note: "   ",
              cover: { storage_path: null, alt: null },
            }),
            makeCampaign({
              id: CAMPAIGN_D,
              slug: "lop-hoc-vung-bien",
              title: "Lớp học vùng biên",
              type: "give",
              status: "suspended",
              review_note: "Đang xác minh chứng từ chi đợt 1.\nLiên hệ hi@give.vn để bổ sung.",
              cover: null,
            }),
          ],
        }
      }
      return undefined
    }

    const html = await renderAsync(await MyCampaignsPage())
    expect(state.serviceUsed).toBe(false)

    const items = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map((m) => m[0])
    expect(items).toHaveLength(4)

    // Row 0: public give campaign with h2 title, private cover thumbnail, and sr-only link names; stale review_note stays hidden.
    expect(items[0]).toContain(">Từ thiện<")
    expect(items[0]).toContain(">Đang gây quỹ<")
    expect(items[0]).toMatch(
      new RegExp(`<h2[^>]*><a[^>]*href="/me/campaigns/${CAMPAIGN_A}"[^>]*>Bếp ấm vùng cao</a></h2>`)
    )
    expect(items[0]).toContain("<img")
    expect(items[0]).toContain(`src="${privateCoverUrl(coverPath)}"`)
    expect(items[0]).toContain("25.000.000 ₫")
    expect(items[0]).toContain('href="/campaigns/bep-am-vung-cao"')
    expect(items[0]).toContain('Xem trang<span class="sr-only">: Bếp ấm vùng cao</span>')
    expect(items[0]).toContain(`href="/me/campaigns/${CAMPAIGN_A}"`)
    expect(items[0]).toContain('Quản lý<span class="sr-only">: Bếp ấm vùng cao</span>')
    expect(items[0]).not.toContain("Cần sửa:")
    expect(items[0]).not.toContain("Lý do tạm dừng:")

    // Row 1: non-public back campaign with CoverPlaceholder fallback and multiline changes_requested review_note.
    expect(items[1]).toContain(">Dự án sáng tạo<")
    expect(items[1]).toContain(">Cần chỉnh sửa<")
    expect(items[1]).toMatch(
      new RegExp(`<h2[^>]*><a[^>]*href="/me/campaigns/${CAMPAIGN_B}"[^>]*>Sách ảnh thiếu nhi</a></h2>`)
    )
    expect(items[1]).not.toContain("<img")
    expect(items[1]).toContain("<svg")
    expect(items[1]).toContain("max-w-[68ch]")
    expect(items[1]).toContain("whitespace-pre-line")
    expect(items[1]).toContain("text-warning")
    expect(items[1]).toContain("Cần sửa:")
    expect(items[1]).toContain("Bổ sung dự toán in ấn,\ncần hỏi viết cho ")
    expect(items[1]).toContain('href="mailto:hi@give.vn"')
    expect(items[1]).not.toContain(">Xem trang")
    expect(items[1]).toContain('Quản lý<span class="sr-only">: Sách ảnh thiếu nhi</span>')

    // Row 2: changes_requested with blank review_note omits "Cần sửa:" and falls back when storage_path is null.
    expect(items[2]).not.toContain("<img")
    expect(items[2]).toContain("<svg")
    expect(items[2]).not.toContain("Cần sửa:")
    expect(items[2]).not.toContain(">Xem trang")
    expect(items[2]).toContain('Quản lý<span class="sr-only">: Album nhạc indie</span>')

    // Row 3: suspended campaign shows moderator review_note with danger tone, max-w-[68ch], and whitespace-pre-line.
    expect(items[3]).toContain(">Tạm dừng<")
    expect(items[3]).toMatch(
      new RegExp(`<h2[^>]*><a[^>]*href="/me/campaigns/${CAMPAIGN_D}"[^>]*>Lớp học vùng biên</a></h2>`)
    )
    expect(items[3]).toContain("max-w-[68ch]")
    expect(items[3]).toContain("whitespace-pre-line")
    expect(items[3]).toContain("text-danger")
    expect(items[3]).toContain("Lý do tạm dừng:")
    expect(items[3]).toContain("Đang xác minh chứng từ chi đợt 1.\nLiên hệ ")
    expect(items[3]).toContain('href="mailto:hi@give.vn"')
    expect(items[3]).not.toContain(">Xem trang")
    expect(items[3]).toContain('Quản lý<span class="sr-only">: Lớp học vùng biên</span>')
  })

  it("shows 'Xem trang' strictly for public statuses and hides it for every non-public status", async () => {
    const statuses: CampaignStatus[] = [
      "draft",
      "in_review",
      "changes_requested",
      "approved",
      "live",
      "settling",
      "succeeded",
      "failed",
      "closed",
      "suspended",
      "cancelled",
    ]
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") {
        return {
          data: statuses.map((status, i) =>
            makeCampaign({
              id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
              slug: `camp-${status}`,
              type: "back",
              status,
            })
          ),
        }
      }
      return undefined
    }

    const html = await renderAsync(await MyCampaignsPage())
    const items = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map((m) => m[0])
    expect(items).toHaveLength(statuses.length)

    const publicSet = new Set<CampaignStatus>(["live", "settling", "succeeded", "failed", "closed"])
    statuses.forEach((status, index) => {
      const title = `Chiến dịch camp-${status}`
      expect(items[index]).toContain(`Quản lý<span class="sr-only">: ${title}</span>`)
      if (publicSet.has(status)) {
        expect(items[index]).toContain(`href="/campaigns/camp-${status}"`)
        expect(items[index]).toContain(`Xem trang<span class="sr-only">: ${title}</span>`)
      } else {
        expect(items[index]).not.toContain(">Xem trang")
      }
    })
  })
})
