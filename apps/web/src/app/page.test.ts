/**
 * Covers the `/` home page RSC and its static metadata (DESIGN.md 8, DOS/Give#233):
 * canonical and OpenGraph metadata, empty-site rendering (keeping "Hai cách gây quỹ"
 * discovery links visible per the 2026-11-16 owner decision), live campaign hero
 * receipt and up-to-three "Đang được quan tâm" cards, and `login_error` alert banners.
 */
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { discoveryHref, type CampaignType, type Category } from "@/lib/campaigns"
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
]

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
}))

vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.handler(call), state.calls),
}))

const { default: HomePage, metadata } = await import("./page")

interface FixtureRow {
  n: number
  type?: CampaignType
  status?: string
  goal?: number
  raised?: number
  supporters?: number
  backers?: number
  lastStatementAt?: string
}

function campaignRow(n: number, type: CampaignType = "give", goal_amount = 100_000_000, status = "live") {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    slug: `chien-dich-${n}`,
    type,
    title: `Chiến dịch số ${n}`,
    goal_amount,
    starts_at: "2026-01-01T00:00:00.000Z",
    ends_at: "2999-01-01T00:00:00.000Z",
    status,
    prelaunch_public: false,
    display_options: { progress_bar: true, backers_count: true, time_remaining: true },
    cover: null,
  }
}

function totalsRow(
  id: string,
  { type = "give", goal = 100_000_000, raised = 0, supporters = 5, backers = 3 }: Omit<FixtureRow, "n"> = {}
) {
  return {
    id,
    type,
    asset: "VND",
    goal_amount: goal,
    pledged_amount: type === "back" ? raised : 0,
    paid_amount: type === "give" ? raised : 0,
    disbursable_amount: type === "give" ? raised : 0,
    disbursed_amount: 0,
    refunded_amount: 0,
    unexplained_out_amount: 0,
    unexplained_out_count: 0,
    supporters_count: supporters,
    other_in_amount: 0,
    refund_owed_amount: 0,
    backers_count: backers,
    payments_stopped_at: null,
    payments_stopped_note: null,
    own_transfer_amount: 0,
  }
}

function setupHome(
  fixtures: FixtureRow[] = [],
  { almostFunded = [], recentlyAudited = [] }: { almostFunded?: FixtureRow[]; recentlyAudited?: FixtureRow[] } = {}
) {
  const bySort = {
    newest: fixtures,
    almost_funded: almostFunded,
    recently_audited: recentlyAudited,
  }
  const allFixtures = new Map<number, FixtureRow>()
  for (const f of [...fixtures, ...almostFunded, ...recentlyAudited]) {
    if (!allFixtures.has(f.n)) allFixtures.set(f.n, f)
  }
  const rowsById = new Map(
    [...allFixtures.values()].map((f) => {
      const row = campaignRow(f.n, f.type ?? "give", f.goal ?? 100_000_000, f.status ?? "live")
      return [row.id, { row, fixture: f }] as const
    })
  )

  state.handler = (call) => {
    if (call.target === "categories") return { data: CATEGORIES }
    if (call.target === "rpc:discover_campaigns") {
      const args = (op(call, "args")?.[0] ?? {}) as { p_sort?: keyof typeof bySort }
      const selected = bySort[args.p_sort ?? "newest"] ?? []
      return {
        data: selected.map((f) => ({
          campaign_id: `00000000-0000-4000-8000-${String(f.n).padStart(12, "0")}`,
          total_count: selected.length,
        })),
      }
    }
    if (call.target === "campaigns") {
      const ids = (op(call, "in")?.[1] as string[]) ?? []
      return { data: ids.map((id) => rowsById.get(id)?.row).filter(Boolean) }
    }
    if (call.target === "rpc:public_campaign_organizers") {
      const ids = ((op(call, "args")?.[0] as { p_campaign_ids?: string[] })?.p_campaign_ids ?? []) as string[]
      return {
        data: ids.map((id) => ({
          campaign_id: id,
          display_name: "Quỹ Mùa Xuân",
          kind: "organization",
          verification_status: "verified",
        })),
      }
    }
    if (call.target === "rpc:public_campaign_statement_freshness") {
      const ids = ((op(call, "args")?.[0] as { p_campaign_ids?: string[] })?.p_campaign_ids ?? []) as string[]
      return {
        data: ids
          .map((id) => {
            const ts = rowsById.get(id)?.fixture.lastStatementAt
            return ts ? { campaign_id: id, last_statement_at: ts } : null
          })
          .filter(Boolean),
      }
    }
    if (call.target === "public_campaigns") {
      const ids = (op(call, "in")?.[1] as string[]) ?? []
      return {
        data: ids
          .map((id) => {
            const entry = rowsById.get(id)
            return entry ? totalsRow(id, entry.fixture) : null
          })
          .filter(Boolean),
      }
    }
    return undefined
  }
}

const parser = new new Window().DOMParser()

async function renderHome(params: { login_error?: string } = {}) {
  const element = await HomePage({ searchParams: Promise.resolve(params) })
  const html = renderToStaticMarkup(element).replace(/\u00a0/g, " ")
  const doc = parser.parseFromString(html, "text/html")
  return { html, doc }
}

beforeEach(() => {
  state.calls.length = 0
  setupHome([])
})

describe("HomePage (/, DOS/Give#233)", () => {
  it("exports canonical and OpenGraph metadata for the front door", () => {
    expect(metadata).toEqual({
      alternates: { canonical: "/" },
      openGraph: {
        type: "website",
        siteName: "Give",
        locale: "vi_VN",
        title: "Give – Gây quỹ minh bạch",
        description: "Gây quỹ từ thiện và dự án sáng tạo, minh bạch từng đồng. Một sản phẩm của DOS.",
        url: "/",
      },
    })
  })

  describe("empty-site state (0 live campaigns)", () => {
    it("points the hero CTA to /start, renders the empty state instead of 'Đang được quan tâm', and keeps 'Hai cách gây quỹ' links pointing to /campaigns", async () => {
      const { html, doc } = await renderHome()

      const discoverCall = state.calls.find((c) => c.target === "rpc:discover_campaigns")
      expect(op(discoverCall, "args")?.[0]).toEqual({
        p_type: null,
        p_category_id: null,
        p_search: null,
        p_status: "live",
        p_sort: "newest",
        p_limit: 10,
      })

      // First section is the hero: one primary CTA to /start, no discovery CTA and no FeaturedReceipt.
      const hero = doc.querySelector("section")!
      const heroLinks = Array.from(hero.querySelectorAll("a")).map((a) => ({
        label: a.textContent.trim(),
        href: a.getAttribute("href"),
      }))
      expect(heroLinks).toEqual([{ label: "Tạo chiến dịch của bạn", href: "/start" }])
      expect(html).not.toContain("Khám phá chiến dịch")
      expect(html).not.toContain("Xem sao kê của chiến dịch")

      // Empty state replaces "Đang được quan tâm".
      expect(doc.querySelector("#quan-tam-heading")).toBeNull()
      expect(html).not.toContain("Đang được quan tâm")
      expect(html).not.toContain("Xem tất cả")
      const headings = Array.from(doc.querySelectorAll("h2")).map((h) => h.textContent.trim())
      expect(headings).toContain("Chưa có chiến dịch nào đang gây quỹ")
      expect(html).toContain("Chiến dịch hiện ở đây ngay khi được duyệt.")

      // Per docs/product-owner-config.md (2026-11-16 decision), "Hai cách gây quỹ" keeps its /campaigns links.
      const ways = doc.querySelector("#hai-hinh-thuc")
      expect(ways).toBeTruthy()
      const wayLinks = Array.from(ways!.querySelectorAll("a")).map((a) => ({
        label: a.textContent.trim(),
        href: a.getAttribute("href"),
      }))
      expect(wayLinks).toEqual([
        { label: "Xem chiến dịch từ thiện", href: discoveryHref({ type: "give" }) },
        { label: "Xem dự án sáng tạo", href: discoveryHref({ type: "back" }) },
      ])
      expect(wayLinks.every((l) => l.href?.startsWith("/campaigns"))).toBe(true)

      // Trust strip and bottom organizer band still render.
      expect(doc.querySelector("#minh-bach")).toBeTruthy()
      expect(doc.querySelector("#to-chuc-heading")?.textContent.trim()).toBe("Bạn có một việc cần gây quỹ?")
    })
  })

  describe("live campaigns state", () => {
    it("renders FeaturedReceipt for featured, up to 3 CampaignCard items in 'Đang được quan tâm', and hero CTA to /campaigns", async () => {
      // Campaign 2 (give, 80M) is featured; remaining 4 supply 3 cards (closest-to-goal trending first, then newest).
      setupHome([
        { n: 1, type: "give", goal: 100_000_000, raised: 30_000_000, supporters: 11 },
        { n: 2, type: "give", goal: 100_000_000, raised: 80_000_000, supporters: 40 },
        { n: 3, type: "back", goal: 100_000_000, raised: 90_000_000, backers: 25 },
        { n: 4, type: "give", goal: 100_000_000, raised: 0, supporters: 0 },
        { n: 5, type: "back", goal: 100_000_000, raised: 0, backers: 0 },
      ])

      const { html, doc } = await renderHome()

      // Hero primary CTA points to /campaigns, secondary link to /start, and FeaturedReceipt shows campaign 2.
      const hero = doc.querySelector("section")!
      const heroLinks = Array.from(hero.querySelectorAll("a")).map((a) => ({
        label: a.textContent.trim(),
        href: a.getAttribute("href"),
      }))
      expect(heroLinks).toEqual([
        { label: "Khám phá chiến dịch", href: "/campaigns" },
        { label: "Tạo chiến dịch của bạn", href: "/start" },
        { label: "Chiến dịch số 2", href: "/campaigns/chien-dich-2" },
        { label: "Xem sao kê của chiến dịch", href: "/campaigns/chien-dich-2/statement" },
      ])
      expect(html).not.toContain("Chưa có chiến dịch nào đang gây quỹ")

      // "Đang được quan tâm" shows "Xem tất cả" -> /campaigns and caps cards at 3: #3 (90%), #1 (30%), #4 (newest).
      const interesting = doc.querySelector('section[aria-labelledby="quan-tam-heading"]')
      expect(interesting).toBeTruthy()
      const seeAll = Array.from(interesting!.querySelectorAll("a")).find((a) => a.textContent.trim() === "Xem tất cả")
      expect(seeAll?.getAttribute("href")).toBe("/campaigns")

      const cards = Array.from(interesting!.querySelectorAll("article"))
      expect(cards).toHaveLength(3)
      expect(cards.map((c) => c.querySelector("h3 a")?.getAttribute("href"))).toEqual([
        "/campaigns/chien-dich-3",
        "/campaigns/chien-dich-1",
        "/campaigns/chien-dich-4",
      ])
      expect(cards[0].textContent).toContain("25 người đồng hành")
      expect(cards[1].textContent).toContain("11 người ủng hộ")
      expect(interesting!.innerHTML).not.toContain("/campaigns/chien-dich-5")
    })

    it("omits both the empty state and 'Đang được quan tâm' when the sole live campaign is featured in the hero", async () => {
      setupHome([{ n: 1, type: "give", goal: 50_000_000, raised: 20_000_000, supporters: 4 }])

      const { html, doc } = await renderHome()

      expect(doc.querySelector('a[href="/campaigns"]')?.textContent.trim()).toBe("Khám phá chiến dịch")
      expect(doc.querySelector('a[href="/campaigns/chien-dich-1/statement"]')).toBeTruthy()
      expect(doc.querySelector("#quan-tam-heading")).toBeNull()
      expect(doc.querySelector("#sap-dat-muc-tieu-heading")).toBeNull()
      expect(doc.querySelector("#minh-bach-sao-ke-heading")).toBeNull()
      expect(state.calls.some((c) => c.target === "rpc:public_campaign_statement_freshness")).toBe(false)
      expect(html).not.toContain("Chưa có chiến dịch nào đang gây quỹ")
    })

    it("renders dynamic 'Sắp đạt mục tiêu' and 'Minh bạch sao kê gần đây' highlight strips with verified dates, distinct aria-labels, deduplicated totals, and zero prelaunch leakage (DOS/Give#318)", async () => {
      setupHome(
        [
          { n: 1, type: "give", goal: 100_000_000, raised: 80_000_000, supporters: 20 },
          { n: 2, type: "give", goal: 100_000_000, raised: 25_000_000, supporters: 6 },
        ],
        {
          almostFunded: [
            // Campaign 1 overlaps with newest; campaign 99 is an approved prelaunch row that must be excluded.
            { n: 1, type: "give", goal: 100_000_000, raised: 80_000_000, supporters: 20 },
            { n: 11, type: "back", goal: 100_000_000, raised: 74_000_000, backers: 18 },
            { n: 99, type: "give", status: "approved", goal: 100_000_000, raised: 0 },
          ],
          recentlyAudited: [
            {
              n: 20,
              type: "give",
              status: "closed",
              goal: 50_000_000,
              raised: 50_000_000,
              supporters: 42,
              lastStatementAt: "2026-11-22T09:00:00Z",
            },
            {
              n: 21,
              type: "give",
              status: "live",
              goal: 80_000_000,
              raised: 40_000_000,
              supporters: 15,
              lastStatementAt: "2026-11-20T15:00:00Z",
            },
            {
              n: 99,
              type: "give",
              status: "approved",
              goal: 100_000_000,
              raised: 0,
              lastStatementAt: "2026-11-22T10:00:00Z",
            },
          ],
        }
      )

      const { doc } = await renderHome()

      // Verify the three discover_campaigns calls include almost_funded and recently_audited (status: all).
      const discoverArgs = state.calls
        .filter((c) => c.target === "rpc:discover_campaigns")
        .map((c) => op(c, "args")?.[0])
      expect(discoverArgs).toEqual([
        { p_status: "live", p_type: null, p_category_id: null, p_search: null, p_sort: "newest", p_limit: 10 },
        { p_status: "live", p_type: null, p_category_id: null, p_search: null, p_sort: "almost_funded", p_limit: 3 },
        { p_status: "all", p_type: null, p_category_id: null, p_search: null, p_sort: "recently_audited", p_limit: 3 },
      ])

      // public_campaigns totals IDs are deduplicated (campaign 1 asked once) and exclude prelaunch #99.
      const totalsCall = state.calls.find((c) => c.target === "public_campaigns")
      const totalsIds = op(totalsCall, "in")?.[1] as string[]
      expect(new Set(totalsIds).size).toBe(totalsIds.length)
      expect(totalsIds).not.toContain("00000000-0000-4000-8000-000000000099")

      // public_campaign_statement_freshness excludes prelaunch #99.
      const freshnessCall = state.calls.find((c) => c.target === "rpc:public_campaign_statement_freshness")
      expect(op(freshnessCall, "args")?.[0]).toEqual({
        p_campaign_ids: ["00000000-0000-4000-8000-000000000020", "00000000-0000-4000-8000-000000000021"],
      })

      // "Sắp đạt mục tiêu" strip
      const almostSection = doc.querySelector('section[aria-labelledby="sap-dat-muc-tieu-heading"]')
      expect(almostSection).toBeTruthy()
      expect(almostSection!.querySelector("#sap-dat-muc-tieu-heading")?.textContent.trim()).toBe("Sắp đạt mục tiêu")
      const almostLink = Array.from(almostSection!.querySelectorAll("a")).find(
        (a) => a.textContent.trim() === "Xem tất cả"
      )
      expect(almostLink?.getAttribute("href")).toBe("/campaigns?sort=almost_funded")
      expect(almostLink?.getAttribute("aria-label")).toBe("Xem tất cả Sắp đạt mục tiêu")
      const almostCards = Array.from(almostSection!.querySelectorAll("article"))
      expect(almostCards).toHaveLength(2)
      expect(almostCards.map((c) => c.querySelector("h3 a")?.getAttribute("href"))).toEqual([
        "/campaigns/chien-dich-1",
        "/campaigns/chien-dich-11",
      ])
      expect(almostSection!.textContent).not.toContain("Sao kê mới nhất:")

      // "Minh bạch sao kê gần đây" strip
      const auditedSection = doc.querySelector('section[aria-labelledby="minh-bach-sao-ke-heading"]')
      expect(auditedSection).toBeTruthy()
      expect(auditedSection!.querySelector("#minh-bach-sao-ke-heading")?.textContent.trim()).toBe(
        "Minh bạch sao kê gần đây"
      )
      const auditedLink = Array.from(auditedSection!.querySelectorAll("a")).find(
        (a) => a.textContent.trim() === "Xem tất cả"
      )
      expect(auditedLink?.getAttribute("href")).toBe("/campaigns?status=all&sort=recently_audited")
      expect(auditedLink?.getAttribute("aria-label")).toBe("Xem tất cả Minh bạch sao kê gần đây")
      const auditedCards = Array.from(auditedSection!.querySelectorAll("article"))
      expect(auditedCards).toHaveLength(2)
      expect(auditedCards[0].textContent).toContain("Sao kê mới nhất: 22/11/2026")
      expect(auditedCards[1].textContent).toContain("Sao kê mới nhất: 20/11/2026")
      expect(auditedSection!.textContent).not.toContain("Sắp ra mắt")
    })
  })

  describe("login_error alert banner", () => {
    it("omits role='alert' when login_error is absent", async () => {
      const { doc } = await renderHome()
      expect(doc.querySelector('[role="alert"]')).toBeNull()
    })

    it.each([
      ["denied", "Bạn đã hủy đăng nhập."],
      ["state", "Phiên đăng nhập đã hết hạn. Hãy thử lại."],
      ["tokens", "Không nhận được phiên đăng nhập từ DOS.Me. Hãy thử lại."],
      ["exchange", "Đăng nhập DOS.Me không thành công. Hãy thử lại."],
      ["unavailable", "Đăng nhập DOS.Me chưa được cấu hình trên môi trường này."],
    ] as const)("renders the %s alert message inside role='alert'", async (code, expectedMessage) => {
      const { doc } = await renderHome({ login_error: code })
      const alert = doc.querySelector('[role="alert"]')
      expect(alert).toBeTruthy()
      expect(alert!.textContent.trim()).toBe(expectedMessage)
    })

    it.each(["unknown_reason", "toString"])(
      "falls back to the exchange error message for unrecognized login_error %s",
      async (code) => {
        const { doc } = await renderHome({ login_error: code })
        const alert = doc.querySelector('[role="alert"]')
        expect(alert).toBeTruthy()
        expect(alert!.textContent.trim()).toBe("Đăng nhập DOS.Me không thành công. Hãy thử lại.")
      }
    )
  })
})
