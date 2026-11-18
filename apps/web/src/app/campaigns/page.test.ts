/**
 * Covers the `/campaigns` discovery RSC (DESIGN.md 6 and 8, DOS/Give#209):
 * filter-bar URL preservation and page-1 reset, `categoriesFor` narrowing when
 * `type` changes, active `"Đang lọc:"` chips and `"Xoá tất cả"`, pagination at
 * ordinary pages and `DISCOVERY_MAX_PAGE`, and the filtered `EmptyState`.
 */
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DISCOVERY_MAX_PAGE,
  DISCOVERY_PAGE_SIZE,
  discoveryHref,
  type CampaignType,
  type Category,
} from "@/lib/campaigns"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const CATEGORIES: Category[] = [
  {
    id: "cat-give",
    slug: "y-te",
    name: "Y tế",
    description: null,
    icon: null,
    color: null,
    applies_to: "give",
    sort_order: 1,
  },
  {
    id: "cat-back",
    slug: "cong-nghe",
    name: "Công nghệ",
    description: null,
    icon: null,
    color: null,
    applies_to: "back",
    sort_order: 2,
  },
  {
    id: "cat-both",
    slug: "cong-dong",
    name: "Cộng đồng",
    description: null,
    icon: null,
    color: null,
    applies_to: "both",
    sort_order: 3,
  },
]

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
}))

vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.handler(call), state.calls),
}))

const { default: CampaignsPage, metadata } = await import("./page")

function campaignRow(n: number, type: CampaignType = "give") {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    slug: `chien-dich-${n}`,
    type,
    title: `Chiến dịch số ${n}`,
    goal_amount: 100_000_000,
    ends_at: "2999-01-01T00:00:00.000Z",
    status: "live",
    display_options: { progress_bar: true, backers_count: true, time_remaining: true },
    cover: null,
  }
}

function totalsRow(id: string, type: CampaignType = "give") {
  return {
    id,
    type,
    asset: "VND",
    goal_amount: 100_000_000,
    pledged_amount: 40_000_000,
    paid_amount: 50_000_000,
    disbursable_amount: 50_000_000,
    disbursed_amount: 0,
    refunded_amount: 0,
    unexplained_out_amount: 0,
    unexplained_out_count: 0,
    supporters_count: 12,
    other_in_amount: 0,
    refund_owed_amount: 0,
    backers_count: 7,
    payments_stopped_at: null,
    payments_stopped_note: null,
    own_transfer_amount: 0,
  }
}

function setupDiscovery({ shown = 2, total = 5 }: { shown?: number; total?: number } = {}) {
  const rows = Array.from({ length: shown }, (_, i) => campaignRow(i + 1))
  state.handler = (call) => {
    if (call.target === "categories") return { data: CATEGORIES }
    if (call.target === "rpc:discover_campaigns") {
      return { data: rows.map((r) => ({ campaign_id: r.id, total_count: total })) }
    }
    if (call.target === "campaigns") return { data: rows }
    if (call.target === "rpc:public_campaign_organizers") {
      return {
        data: rows.map((r) => ({
          campaign_id: r.id,
          display_name: "Quỹ Mùa Xuân",
          kind: "organization",
          verification_status: "verified",
        })),
      }
    }
    if (call.target === "public_campaigns") return { data: rows.map((r) => totalsRow(r.id, r.type)) }
    return undefined
  }
}

const parser = new new Window().DOMParser()

async function renderDiscovery(params: Record<string, string | string[] | undefined> = {}) {
  const element = await CampaignsPage({ searchParams: Promise.resolve(params) })
  const html = renderToStaticMarkup(element).replace(/\u00a0/g, " ")
  const doc = parser.parseFromString(html, "text/html")
  return { html, doc }
}

function navLinks(doc: ReturnType<typeof parser.parseFromString>, label: string) {
  const nav = doc.querySelector(`nav[aria-label="${label}"]`)
  expect(nav, `missing nav[aria-label="${label}"]`).toBeTruthy()
  return Array.from(nav!.querySelectorAll("a")).map((a) => ({
    label: a.textContent.trim(),
    href: a.getAttribute("href"),
    current: a.getAttribute("aria-current") === "page",
  }))
}

beforeEach(() => {
  state.calls.length = 0
  setupDiscovery()
})

describe("CampaignsPage (/campaigns, DOS/Give#209)", () => {
  it("exports discovery canonical, description, and complete OpenGraph metadata (DOS/Give#232)", () => {
    expect(metadata).toEqual({
      title: "Khám phá chiến dịch",
      description: "Khám phá các chiến dịch từ thiện và dự án sáng tạo minh bạch từng đồng trên Give.",
      alternates: { canonical: "/campaigns" },
      openGraph: {
        type: "website",
        siteName: "Give",
        locale: "vi_VN",
        title: "Khám phá chiến dịch",
        description: "Khám phá các chiến dịch từ thiện và dự án sáng tạo minh bạch từng đồng trên Give.",
        url: "/campaigns",
      },
    })
  })

  describe("filter bar links and categoriesFor narrowing", () => {
    it("preserves active keep filters, resets page to 1 across type/category/status/sort links, and clears category when switching type", async () => {
      const { doc } = await renderDiscovery({
        type: "give",
        category: "y-te",
        q: "trường học",
        status: "ended",
        sort: "ending",
        page: "3",
      })

      const discoverCall = state.calls.find((c) => c.target === "rpc:discover_campaigns")
      expect(op(discoverCall, "args")?.[0]).toEqual({
        p_type: "give",
        p_category_id: "cat-give",
        p_search: "trường học",
        p_status: "ended",
        p_sort: "ending",
        p_limit: 3 * DISCOVERY_PAGE_SIZE,
      })

      const hiddenInputs = Array.from(doc.querySelectorAll('form[role="search"] input[type="hidden"]')).map((i) => [
        i.getAttribute("name"),
        i.getAttribute("value"),
      ])
      expect(hiddenInputs).toEqual([
        ["type", "give"],
        ["category", "y-te"],
        ["status", "ended"],
        ["sort", "ending"],
      ])
      const mobileSearch = doc.querySelector('form[role="search"] input#q')
      expect(mobileSearch?.getAttribute("minlength")).toBe("2")
      expect(mobileSearch?.getAttribute("maxlength")).toBe("80")

      const keep = {
        type: "give" as const,
        category: "y-te",
        q: "trường học",
        status: "ended" as const,
        sort: "ending" as const,
      }

      // Type segmented control clears category and resets page to 1 while keeping q, status and sort.
      expect(navLinks(doc, "Loại chiến dịch")).toEqual([
        { label: "Tất cả", href: discoveryHref({ ...keep, type: null, category: null }), current: false },
        { label: "Từ thiện", href: discoveryHref({ ...keep, type: "give", category: null }), current: true },
        { label: "Dự án sáng tạo", href: discoveryHref({ ...keep, type: "back", category: null }), current: false },
      ])

      // Category menu narrows via categoriesFor("give") (excludes back-only "Công nghệ") and resets page to 1.
      expect(navLinks(doc, "Danh mục")).toEqual([
        { label: "Mọi danh mục", href: discoveryHref({ ...keep, category: null }), current: false },
        { label: "Y tế", href: discoveryHref({ ...keep, category: "y-te" }), current: true },
        { label: "Cộng đồng", href: discoveryHref({ ...keep, category: "cong-dong" }), current: false },
      ])

      // Status menu preserves keep and resets page to 1 (default "live" omitted from query string).
      expect(navLinks(doc, "Trạng thái")).toEqual([
        { label: "Đang gây quỹ", href: discoveryHref({ ...keep, status: "live" }), current: false },
        { label: "Đã kết thúc", href: discoveryHref({ ...keep, status: "ended" }), current: true },
        { label: "Tất cả", href: discoveryHref({ ...keep, status: "all" }), current: false },
      ])

      // Sort menu preserves keep and resets page to 1 (default "featured" omitted from query string).
      expect(navLinks(doc, "Sắp xếp")).toEqual([
        { label: "Nổi bật", href: discoveryHref({ ...keep, sort: "featured" }), current: false },
        { label: "Mới nhất", href: discoveryHref({ ...keep, sort: "newest" }), current: false },
        { label: "Sắp kết thúc", href: discoveryHref({ ...keep, sort: "ending" }), current: true },
        { label: "Gần đạt mục tiêu", href: discoveryHref({ ...keep, sort: "near_goal" }), current: false },
      ])
    })

    it("narrows category options for back campaigns and lists every category when type is unfiltered", async () => {
      const back = await renderDiscovery({ type: "back" })
      expect(navLinks(back.doc, "Danh mục").map((item) => item.label)).toEqual([
        "Mọi danh mục",
        "Công nghệ",
        "Cộng đồng",
      ])

      const all = await renderDiscovery({})
      expect(navLinks(all.doc, "Danh mục").map((item) => item.label)).toEqual([
        "Mọi danh mục",
        "Y tế",
        "Công nghệ",
        "Cộng đồng",
      ])
    })

    it("falls back to 'Mọi danh mục' on unknown or cross-type category slugs without ghost filter strips or unchecked menus (DOS/Give#240)", async () => {
      // Unknown ?category=foo: falls back to null, checks "Mọi danh mục", and omits ghost "Đang lọc:" strip.
      state.calls.length = 0
      const unknown = await renderDiscovery({ category: "foo" })
      const unknownCall = state.calls.find((c) => c.target === "rpc:discover_campaigns")
      expect(op(unknownCall, "args")?.[0]).toMatchObject({ p_type: null, p_category_id: null })
      expect(unknown.html).not.toContain("Đang lọc:")
      expect(unknown.html).not.toContain("Xoá tất cả")
      expect(unknown.doc.querySelector('form[role="search"] input[name="category"]')).toBeNull()
      expect(navLinks(unknown.doc, "Danh mục")).toEqual([
        { label: "Mọi danh mục", href: "/campaigns", current: true },
        { label: "Y tế", href: "/campaigns?category=y-te", current: false },
        { label: "Công nghệ", href: "/campaigns?category=cong-nghe", current: false },
        { label: "Cộng đồng", href: "/campaigns?category=cong-dong", current: false },
      ])

      // Unknown ?category=foo with active q: shows only the q chip under "Đang lọc:".
      const unknownWithQ = await renderDiscovery({ category: "foo", q: "trường" })
      expect(unknownWithQ.html).toContain("Đang lọc:")
      expect(unknownWithQ.doc.querySelector('a[aria-label^="Bỏ lọc danh mục"]')).toBeNull()
      expect(unknownWithQ.doc.querySelector('a[aria-label="Bỏ tìm “trường”"]')?.getAttribute("href")).toBe("/campaigns")

      // Cross-type ?type=give&category=cong-nghe ("Công nghệ" applies only to back):
      // drops category so summary does not claim "Danh mục: Công nghệ" while omitting it from the menu.
      state.calls.length = 0
      const crossType = await renderDiscovery({ type: "give", category: "cong-nghe" })
      const crossCall = state.calls.find((c) => c.target === "rpc:discover_campaigns")
      expect(op(crossCall, "args")?.[0]).toMatchObject({ p_type: "give", p_category_id: null })
      expect(crossType.html).not.toContain("Công nghệ")
      expect(crossType.html).not.toContain("Đang lọc:")
      expect(crossType.doc.querySelector('form[role="search"] input[name="category"]')).toBeNull()
      expect(navLinks(crossType.doc, "Danh mục")).toEqual([
        { label: "Mọi danh mục", href: "/campaigns?type=give", current: true },
        { label: "Y tế", href: "/campaigns?type=give&category=y-te", current: false },
        { label: "Cộng đồng", href: "/campaigns?type=give&category=cong-dong", current: false },
      ])
      expect(navLinks(crossType.doc, "Trạng thái")[1]).toEqual({
        label: "Đã kết thúc",
        href: "/campaigns?type=give&status=ended",
        current: false,
      })
    })
  })

  describe("active filter chips ('Đang lọc:' and 'Xoá tất cả')", () => {
    it("omits 'Đang lọc:' and 'Xoá tất cả' when neither category nor q is active, even with non-default type/status/sort/page", async () => {
      const { html } = await renderDiscovery({
        type: "back",
        status: "ended",
        sort: "newest",
        page: "2",
      })

      expect(html).not.toContain("Đang lọc:")
      expect(html).not.toContain("Xoá tất cả")
    })

    it("renders 'Đang lọc:' and 'Xoá tất cả' when category alone, q alone, or both are active", async () => {
      // Category only
      const catOnly = await renderDiscovery({
        type: "give",
        category: "y-te",
        sort: "newest",
        page: "2",
      })
      expect(catOnly.html).toContain("Đang lọc:")
      expect(catOnly.doc.querySelector('a[aria-label="Bỏ lọc danh mục Y tế"]')?.getAttribute("href")).toBe(
        "/campaigns?type=give&sort=newest"
      )
      expect(catOnly.doc.querySelector('a[aria-label^="Bỏ tìm"]')).toBeNull()
      const catClearAll = Array.from(catOnly.doc.querySelectorAll("a")).find(
        (a) => a.textContent.trim() === "Xoá tất cả"
      )
      expect(catClearAll?.getAttribute("href")).toBe("/campaigns?type=give&sort=newest")

      // Search q only
      const qOnly = await renderDiscovery({
        q: "bữa trưa",
        status: "all",
        page: "2",
      })
      expect(qOnly.html).toContain("Đang lọc:")
      expect(qOnly.doc.querySelector('a[aria-label="Bỏ tìm “bữa trưa”"]')?.getAttribute("href")).toBe(
        "/campaigns?status=all"
      )
      expect(qOnly.doc.querySelector('a[aria-label^="Bỏ lọc danh mục"]')).toBeNull()
      const qClearAll = Array.from(qOnly.doc.querySelectorAll("a")).find((a) => a.textContent.trim() === "Xoá tất cả")
      expect(qClearAll?.getAttribute("href")).toBe("/campaigns?status=all")

      // Both category and q active: each chip removes only itself, while "Xoá tất cả" clears both and keeps type/status/sort.
      const both = await renderDiscovery({
        type: "give",
        category: "y-te",
        q: "bữa trưa",
        status: "ended",
        sort: "ending",
        page: "2",
      })
      expect(both.doc.querySelector('a[aria-label="Bỏ lọc danh mục Y tế"]')?.getAttribute("href")).toBe(
        discoveryHref({ type: "give", q: "bữa trưa", status: "ended", sort: "ending" })
      )
      expect(both.doc.querySelector('a[aria-label="Bỏ tìm “bữa trưa”"]')?.getAttribute("href")).toBe(
        discoveryHref({ type: "give", category: "y-te", status: "ended", sort: "ending" })
      )
      const bothClearAll = Array.from(both.doc.querySelectorAll("a")).find((a) => a.textContent.trim() === "Xoá tất cả")
      expect(bothClearAll?.getAttribute("href")).toBe(discoveryHref({ type: "give", status: "ended", sort: "ending" }))
    })
  })

  describe("pagination and EmptyState", () => {
    it("renders 'Đang xem X trên Y chiến dịch' and 'Xem thêm' pointing to #chien-dich-<shown+1> while shown < total && page < DISCOVERY_MAX_PAGE", async () => {
      setupDiscovery({ shown: 3, total: 128 })
      const { html, doc } = await renderDiscovery({
        type: "give",
        q: "trường",
        status: "all",
        sort: "newest",
        page: "2",
      })

      expect(doc.querySelector("#chien-dich-1")).toBeTruthy()
      expect(doc.querySelector("#chien-dich-3")).toBeTruthy()
      expect(html).toContain("Đang xem 3 trên 128 chiến dịch")

      const loadMore = Array.from(doc.querySelectorAll("a")).find((a) => a.textContent.trim() === "Xem thêm")
      expect(loadMore?.getAttribute("href")).toBe(
        discoveryHref({ type: "give", q: "trường", status: "all", sort: "newest", page: 3 }, "chien-dich-4")
      )
      expect(html).not.toContain("Chọn thêm bộ lọc để xem các chiến dịch còn lại.")
      expect(html).not.toContain("Không có chiến dịch nào khớp bộ lọc")
    })

    it("omits both 'Xem thêm' and the max-page hint when all matching campaigns are already shown", async () => {
      setupDiscovery({ shown: 2, total: 2 })
      const { html, doc } = await renderDiscovery({})

      expect(html).toContain("Đang xem 2 trên 2 chiến dịch")
      expect(Array.from(doc.querySelectorAll("a")).find((a) => a.textContent.trim() === "Xem thêm")).toBeUndefined()
      expect(html).not.toContain("Chọn thêm bộ lọc để xem các chiến dịch còn lại.")
    })

    it("shows 'Chọn thêm bộ lọc để xem các chiến dịch còn lại.' without 'Xem thêm' at DISCOVERY_MAX_PAGE when more rows exist", async () => {
      setupDiscovery({ shown: 2, total: 500 })
      const { html, doc } = await renderDiscovery({ page: String(DISCOVERY_MAX_PAGE) })

      expect(html).toContain("Đang xem 2 trên 500 chiến dịch")
      expect(Array.from(doc.querySelectorAll("a")).find((a) => a.textContent.trim() === "Xem thêm")).toBeUndefined()
      expect(html).toContain("Chọn thêm bộ lọc để xem các chiến dịch còn lại.")

      // At DISCOVERY_MAX_PAGE with no remaining rows, the cap hint is also omitted.
      setupDiscovery({ shown: 2, total: 2 })
      const exact = await renderDiscovery({ page: String(DISCOVERY_MAX_PAGE) })
      expect(exact.html).not.toContain("Chọn thêm bộ lọc để xem các chiến dịch còn lại.")
    })

    it("renders unfiltered EmptyState with /start CTA instead of self-linking 'Xoá bộ lọc' when zero live campaigns exist (DOS/Give#240)", async () => {
      setupDiscovery({ shown: 0, total: 0 })

      for (const params of [{}, { sort: "newest" }, { category: "khong-ton-tai" }]) {
        const { html, doc } = await renderDiscovery(params)
        expect(doc.querySelector("h3")?.textContent.trim()).toBe("Chưa có chiến dịch nào đang gây quỹ")
        expect(html).toContain("Chiến dịch hiện ở đây ngay khi được duyệt.")
        const startCta = doc.querySelector('a[href="/start"]')
        expect(startCta?.textContent.trim()).toBe("Tạo chiến dịch của bạn")
        expect(startCta?.className).toContain("btn-primary")
        expect(html).not.toContain("Không có chiến dịch nào khớp bộ lọc")
        expect(html).not.toContain("Xoá bộ lọc")
        expect(html).not.toContain("Đang xem")
        expect(html).not.toContain("Xem thêm")
      }
    })

    it("renders filtered EmptyState ('Không có chiến dịch nào khớp bộ lọc') and hides pagination when shown === 0 under active filters", async () => {
      setupDiscovery({ shown: 0, total: 0 })

      for (const params of [{ q: "không có" }, { type: "give" }, { category: "y-te" }, { status: "ended" }]) {
        const { html, doc } = await renderDiscovery(params)

        expect(doc.querySelector("h3")?.textContent.trim()).toBe("Không có chiến dịch nào khớp bộ lọc")
        expect(html).toContain("Thử từ khoá ngắn hơn, chọn danh mục hoặc trạng thái khác.")
        const resetLink = Array.from(doc.querySelectorAll("a")).find((a) => a.textContent.trim() === "Xoá bộ lọc")
        expect(resetLink?.getAttribute("href")).toBe("/campaigns")
        expect(resetLink?.className).toContain("btn-secondary")
        expect(html).not.toContain("Chưa có chiến dịch nào đang gây quỹ")
        expect(html).not.toContain("Đang xem")
        expect(html).not.toContain("Xem thêm")
      }
    })
  })
})
