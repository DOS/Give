// @vitest-environment happy-dom
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignStatus, PublicCampaign } from "@/lib/campaigns"
import { fakeDb, type Call, type Handler } from "@/test/fake-db"

const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333"
const SLUG = "xay-truong-ban-may"

const state = vi.hoisted(() => ({
  anonHandler: (() => undefined) as Handler,
  anonCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

const getSessionSpy = vi.fn(async () => {
  throw new Error("getSession must NEVER be called by /embed/[slug]")
})
vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionSpy,
}))

vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) => {
    if (token) throw new Error("embed/[slug] must NEVER pass a user token to dbAs()")
    return fakeDb((call) => state.anonHandler(call), state.anonCalls)
  },
  dbService: () => {
    state.serviceCalls.push({ target: "dbService", ops: [] })
    throw new Error("embed/[slug] must NEVER use dbService()")
  },
}))

const { default: EmbedCampaignPage, generateMetadata } = await import("./page")

function campaignFixture(overrides: Partial<PublicCampaign> = {}): PublicCampaign {
  return {
    id: CAMPAIGN_ID,
    slug: SLUG,
    type: "give",
    funding_model: "flexible",
    category_id: "cat-1",
    title: "Xây trường Bản Mây",
    summary: "Cùng dựng lớp học mới cho các em nhỏ vùng cao.",
    story: "Nội dung chi tiết",
    beneficiary_name: null,
    beneficiary_relation: null,
    cover_media_id: "cov-1",
    asset: "VND",
    goal_amount: 100_000_000,
    min_contribution: 20_000,
    stretch_goal_amount: null,
    display_options: { progress_bar: true, backers_count: true, time_remaining: true },
    starts_at: "2026-11-01T00:00:00.000Z",
    ends_at: "2099-12-31T00:00:00.000Z",
    payment_window_days: 7,
    status: "live",
    prelaunch_public: false,
    submitted_at: "2026-11-10T00:00:00.000Z",
    approved_at: "2026-11-11T00:00:00.000Z",
    outcome_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-11T00:00:00.000Z",
    category: { id: "cat-1", slug: "giao-duc", name: "Giáo dục", icon: null, color: null },
    cover: { storage_path: "campaigns/33333333/cover.webp", alt: "Ảnh trường Bản Mây" },
    ...overrides,
  }
}

function totalsFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN_ID,
    type: "give",
    asset: "VND",
    goal_amount: 100_000_000,
    pledged_amount: 0,
    paid_amount: 45_000_000,
    disbursable_amount: 45_000_000,
    disbursed_amount: 0,
    refunded_amount: 0,
    unexplained_out_amount: 0,
    unexplained_out_count: 0,
    supporters_count: 18,
    other_in_amount: 0,
    refund_owed_amount: 0,
    backers_count: 0,
    payments_stopped_at: null,
    payments_stopped_note: null,
    own_transfer_amount: 0,
    ...overrides,
  }
}

function parseDoc(html: string) {
  const win = new Window()
  win.document.body.innerHTML = html
  return win.document
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://give.vn")
  state.anonCalls.length = 0
  state.serviceCalls.length = 0
  getSessionSpy.mockClear()
  state.anonHandler = (call) => {
    if (call.target === "campaigns") return { data: campaignFixture() }
    if (call.target === "rpc:public_organizer") {
      return { data: [{ display_name: "Quỹ Bản Mây", kind: "organization", verification_status: "verified" }] }
    }
    if (call.target === "public_campaigns") return { data: totalsFixture() }
    return undefined
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("/embed/[slug] metadata (DOS/Give#335)", () => {
  it("sets noindex/nofollow and canonical for public campaigns and hides unpublished slugs", async () => {
    const publicMeta = await generateMetadata({ params: Promise.resolve({ slug: SLUG }) })
    expect(publicMeta.title).toBe("Xây trường Bản Mây")
    expect(publicMeta.robots).toEqual({ index: false, follow: false })
    expect(publicMeta.alternates?.canonical).toBe(`/campaigns/${SLUG}`)

    state.anonHandler = () => ({ data: campaignFixture({ status: "draft" }) })
    const draftMeta = await generateMetadata({ params: Promise.resolve({ slug: SLUG }) })
    expect(draftMeta.title).toBe("Không tìm thấy")
    expect(draftMeta.robots).toEqual({ index: false, follow: false })
    expect(draftMeta.alternates).toBeUndefined()

    const badSlugMeta = await generateMetadata({ params: Promise.resolve({ slug: 'bad"><script>' }) })
    expect(badSlugMeta.title).toBe("Không tìm thấy")
    expect(badSlugMeta.robots).toEqual({ index: false, follow: false })
  })
})

describe("/embed/[slug] page (DOS/Give#335)", () => {
  it("renders read-only live give campaign widget with zero forms, zero sessions, and zero QR/transfer UI", async () => {
    const html = renderToStaticMarkup(await EmbedCampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    const doc = parseDoc(html)

    expect(getSessionSpy).not.toHaveBeenCalled()
    expect(state.serviceCalls).toEqual([])
    expect(doc.querySelectorAll("form")).toHaveLength(0)
    expect(html).not.toContain("VietQR")
    expect(html).not.toContain("Chuyển khoản")

    const root = doc.querySelector("article[data-embed-theme]")!
    expect(root.getAttribute("data-embed-theme")).toBe("light")

    const coverSrc = doc.querySelector("img")?.getAttribute("src") ?? ""
    expect(decodeURIComponent(coverSrc)).toContain("/media/public/campaigns/33333333/cover.webp")
    expect(doc.body.textContent).toContain("Từ thiện")
    expect(doc.body.textContent).toContain("Đang gây quỹ")
    expect(doc.querySelector("h1")?.textContent).toBe("Xây trường Bản Mây")
    expect(doc.body.textContent).toContain("Quỹ Bản Mây")
    expect(doc.querySelector('[aria-label="Đã xác minh"]')).not.toBeNull()
    expect(doc.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("45")
    expect(doc.body.textContent).toContain("45.000.000")
    expect(doc.body.textContent).toContain("100.000.000")
    expect(doc.body.textContent).toContain("18 người ủng hộ")

    const links = [...doc.querySelectorAll("a")]
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute("href")).toBe(`https://give.vn/campaigns/${SLUG}`)
    expect(links[0].getAttribute("target")).toBe("_blank")
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer")
    expect(links[0].textContent).toContain("Ủng hộ ngay")
  })

  it("renders back campaign labels and ended campaign CTA cleanly", async () => {
    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        return { data: campaignFixture({ type: "back", funding_model: "all_or_nothing", status: "succeeded" }) }
      }
      if (call.target === "rpc:public_organizer") {
        return { data: [{ display_name: "Studio Xanh", kind: "individual", verification_status: "unverified" }] }
      }
      if (call.target === "public_campaigns") {
        return { data: totalsFixture({ type: "back", pledged_amount: 120_000_000, paid_amount: 0, backers_count: 42 }) }
      }
      return undefined
    }

    const doc = parseDoc(renderToStaticMarkup(await EmbedCampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(doc.body.textContent).toContain("Dự án sáng tạo")
    expect(doc.body.textContent).toContain("Thành công")
    expect(doc.body.textContent).toContain("đã cam kết")
    expect(doc.body.textContent).toContain("42 người đồng hành")
    expect(doc.querySelector('[aria-label="Đã xác minh"]')).toBeNull()
    expect(doc.querySelector("a")?.textContent).toContain("Xem chi tiết")
  })

  it("enforces strict query allowlists for theme, compact, and ref without CSS/URL injection", async () => {
    const darkCompactDoc = parseDoc(
      renderToStaticMarkup(
        await EmbedCampaignPage({
          params: Promise.resolve({ slug: SLUG }),
          searchParams: Promise.resolve({ theme: "dark", compact: "1", ref: "AB23CD45EF" }),
        })
      )
    )
    expect(darkCompactDoc.querySelector("article")?.getAttribute("data-embed-theme")).toBe("dark")
    expect(darkCompactDoc.querySelector("article")?.className).toContain("rounded-md")
    expect(darkCompactDoc.querySelector("h1")?.className).toContain("truncate")
    expect(darkCompactDoc.body.textContent).not.toContain("Mục tiêu")
    expect(darkCompactDoc.querySelector("a")?.getAttribute("href")).toBe(
      `https://give.vn/campaigns/${SLUG}?ref=ab23cd45ef`
    )

    const autoDoc = parseDoc(
      renderToStaticMarkup(
        await EmbedCampaignPage({
          params: Promise.resolve({ slug: SLUG }),
          searchParams: Promise.resolve({ theme: "auto", compact: "0" }),
        })
      )
    )
    expect(autoDoc.querySelector("article")?.getAttribute("data-embed-theme")).toBe("auto")

    const injectedDoc = parseDoc(
      renderToStaticMarkup(
        await EmbedCampaignPage({
          params: Promise.resolve({ slug: SLUG }),
          searchParams: Promise.resolve({
            theme: 'dark" style="background:red',
            compact: "yes",
            ref: "javascript:alert(1)",
          }),
        })
      )
    )
    expect(injectedDoc.querySelector("article")?.getAttribute("data-embed-theme")).toBe("light")
    expect(injectedDoc.querySelector("article")?.getAttribute("style")).toBeNull()
    expect(injectedDoc.querySelector("a")?.getAttribute("href")).toBe(`https://give.vn/campaigns/${SLUG}`)
  })

  it("NEVER queries getMoneyTotals or renders amounts on pre-launch approved teasers", async () => {
    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: campaignFixture({
            status: "approved",
            prelaunch_public: true,
            starts_at: "2099-06-15T00:00:00.000Z",
            cover: null,
          }),
        }
      }
      if (call.target === "rpc:public_organizer") {
        return { data: [{ display_name: "Quỹ Bản Mây", kind: "organization", verification_status: "verified" }] }
      }
      return undefined
    }

    const html = renderToStaticMarkup(await EmbedCampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    const doc = parseDoc(html)

    expect(state.anonCalls.some((c) => c.target === "public_campaigns")).toBe(false)
    expect(doc.querySelector('[role="progressbar"]')).toBeNull()
    expect(doc.querySelector("img")).toBeNull()
    expect(html).not.toContain("₫")
    expect(html).not.toContain("Ủng hộ ngay")
    expect(doc.body.textContent).toContain("Sắp ra mắt")
    expect(doc.body.textContent).toContain("Dự kiến mở ngày 15/06/2099")
    expect(doc.querySelector("a")?.textContent).toContain("Xem chi tiết")
  })

  it.each<CampaignStatus>(["draft", "in_review", "changes_requested", "approved", "suspended", "cancelled"])(
    "calls notFound() for non-public status %s",
    async (status) => {
      state.anonHandler = () => ({ data: campaignFixture({ status, prelaunch_public: false }) })
      await expect(EmbedCampaignPage({ params: Promise.resolve({ slug: SLUG }) })).rejects.toThrow("NEXT_NOT_FOUND")
    }
  )

  it("calls notFound() for unknown, invalid/XSS, or oversized slugs", async () => {
    state.anonHandler = () => ({ data: null })
    await expect(EmbedCampaignPage({ params: Promise.resolve({ slug: SLUG }) })).rejects.toThrow("NEXT_NOT_FOUND")

    state.anonCalls.length = 0
    await expect(
      EmbedCampaignPage({ params: Promise.resolve({ slug: 'xay"><script>alert(1)</script>' }) })
    ).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(EmbedCampaignPage({ params: Promise.resolve({ slug: "a".repeat(81) }) })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    )
    expect(state.anonCalls).toEqual([])
  })

  it("calls notFound() when prelaunch_public=true approved campaign has past starts_at", async () => {
    state.anonHandler = () => ({
      data: campaignFixture({
        status: "approved",
        prelaunch_public: true,
        starts_at: "2020-01-01T00:00:00.000Z",
      }),
    })
    await expect(EmbedCampaignPage({ params: Promise.resolve({ slug: SLUG }) })).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("handles missing totals, goal_amount=0, expired live campaigns, and display_options=false safely", async () => {
    // 1. totals === null on live campaign omits 0 ₫ and progressbar
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture({ status: "live" }) }
      if (call.target === "rpc:public_organizer") return { data: [] }
      if (call.target === "public_campaigns") return { data: null }
      return undefined
    }
    const noTotalsDoc = parseDoc(
      renderToStaticMarkup(await EmbedCampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    )
    expect(noTotalsDoc.querySelector('[role="progressbar"]')).toBeNull()
    expect(noTotalsDoc.body.textContent).not.toContain("đã nhận")
    expect(noTotalsDoc.body.textContent).toContain("Mục tiêu 100.000.000")

    // 2. Expired live campaign shows "Đã hết hạn" and "Xem chi tiết" instead of "Ủng hộ ngay"
    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: campaignFixture({
            status: "live",
            ends_at: "2020-01-01T00:00:00.000Z",
            goal_amount: 0,
            display_options: { progress_bar: false, backers_count: false, time_remaining: true },
          }),
        }
      }
      if (call.target === "rpc:public_organizer") return { data: [] }
      if (call.target === "public_campaigns") return { data: totalsFixture({ paid_amount: 0, supporters_count: 5 }) }
      return undefined
    }
    const expiredDoc = parseDoc(
      renderToStaticMarkup(await EmbedCampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    )
    expect(expiredDoc.querySelector('[role="progressbar"]')).toBeNull()
    expect(expiredDoc.body.textContent).not.toContain("5 người ủng hộ")
    expect(expiredDoc.body.textContent).toContain("Đã hết hạn")
    expect(expiredDoc.querySelector("a")?.textContent).toContain("Xem chi tiết")
    expect(expiredDoc.querySelector("a")?.textContent).not.toContain("Ủng hộ ngay")
  })
})
