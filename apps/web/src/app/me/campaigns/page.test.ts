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

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  tokens: [] as (string | undefined)[],
  serviceUsed: false,
}))

const requireSessionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    user: { id: USER, email: "organizer@example.vn", name: "Lan" },
    accessToken: "organizer-jwt",
  }))
)

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
    sink.on("finish", () => resolve(html.replace(/\u00a0/g, " ")))
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
  requireSessionMock.mockClear()
  state.calls.length = 0
  state.tokens.length = 0
  state.serviceUsed = false
})

describe("MyCampaignsPage (DOS/Give#217)", () => {
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

  it("renders badges, private cover vs placeholder, public link gating, always-on manage link, and changes_requested review note", async () => {
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
              review_note: "Bổ sung dự toán in ấn, cần hỏi viết cho hi@give.vn",
              cover: null,
            }),
            makeCampaign({
              id: CAMPAIGN_C,
              slug: "album-nhac-indie",
              title: "Album nhạc indie",
              type: "back",
              status: "changes_requested",
              review_note: null,
              cover: { storage_path: null, alt: null },
            }),
          ],
        }
      }
      return undefined
    }

    const html = await renderAsync(await MyCampaignsPage())
    expect(state.serviceUsed).toBe(false)

    const items = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map((m) => m[0])
    expect(items).toHaveLength(3)

    // Row 0: public give campaign with private cover thumbnail; stale review_note stays hidden.
    expect(items[0]).toContain(">Từ thiện<")
    expect(items[0]).toContain(">Đang gây quỹ<")
    expect(items[0]).toContain("<img")
    expect(items[0]).toContain(`src="${privateCoverUrl(coverPath)}"`)
    expect(items[0]).toContain("25.000.000 ₫")
    expect(items[0]).toContain('href="/campaigns/bep-am-vung-cao"')
    expect(items[0]).toContain(">Xem trang<")
    expect(items[0]).toContain(`href="/me/campaigns/${CAMPAIGN_A}"`)
    expect(items[0]).toContain(">Quản lý<")
    expect(items[0]).not.toContain("Cần sửa:")

    // Row 1: non-public back campaign with CoverPlaceholder fallback and changes_requested review_note.
    expect(items[1]).toContain(">Dự án sáng tạo<")
    expect(items[1]).toContain(">Cần chỉnh sửa<")
    expect(items[1]).not.toContain("<img")
    expect(items[1]).toContain("<svg")
    expect(items[1]).toContain("Cần sửa:")
    expect(items[1]).toContain("Bổ sung dự toán in ấn")
    expect(items[1]).toContain('href="mailto:hi@give.vn"')
    expect(items[1]).not.toContain(">Xem trang<")
    expect(items[1]).toContain(`href="/me/campaigns/${CAMPAIGN_B}"`)
    expect(items[1]).toContain(">Quản lý<")

    // Row 2: changes_requested without review_note omits "Cần sửa:" and falls back when storage_path is null.
    expect(items[2]).not.toContain("<img")
    expect(items[2]).toContain("<svg")
    expect(items[2]).not.toContain("Cần sửa:")
    expect(items[2]).not.toContain(">Xem trang<")
    expect(items[2]).toContain(`href="/me/campaigns/${CAMPAIGN_C}"`)
    expect(items[2]).toContain(">Quản lý<")
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
      if (publicSet.has(status)) {
        expect(items[index]).toContain(`href="/campaigns/camp-${status}"`)
        expect(items[index]).toContain(">Xem trang<")
      } else {
        expect(items[index]).not.toContain(">Xem trang<")
      }
    })
  })
})
