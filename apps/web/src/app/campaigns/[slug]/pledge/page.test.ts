// @vitest-environment happy-dom
/** PledgePage RSC routing, defaults and visibility (DOS/Give#216). */
import type { ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { PublicCampaign } from "@/lib/campaigns"
import { formatVnd } from "@/lib/format"
import { NO_REWARD, PLEDGE_STATUS_LABELS, type PublicRewardTier } from "@/lib/pledges"
import type { OwnPledge } from "@/server/pledges"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TIER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTHER_TIER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const UNKNOWN_TIER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const SLUG = "du-an-den"
const RETURN_PATH = `/campaigns/${SLUG}/pledge`
const SHIPPING = { recipient: "Nguyễn Lan", phone: "0901234567", address: "12 Lý Thường Kiệt, Hà Nội" }

const state = vi.hoisted(() => ({ handler: (() => undefined) as Handler, calls: [] as Call[] }))
const requireSessionMock = vi.hoisted(() =>
  vi.fn(async (_returnPath: string) => ({
    user: { id: USER, email: null, name: "Lan Nguyễn" as string | null },
    accessToken: "backer-token",
  }))
)
const dbAsMock = vi.hoisted(() => vi.fn((_token: string) => fakeDb((call) => state.handler(call), state.calls)))
const notFoundMock = vi.hoisted(() =>
  vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND")
  })
)
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  })
)

vi.mock("next/navigation", () => ({ notFound: notFoundMock, redirect: redirectMock }))
vi.mock("@/lib/auth/session", () => ({ requireSession: requireSessionMock }))
vi.mock("@/lib/supabase", () => ({ dbAs: dbAsMock }))
vi.mock("./actions", () => ({ savePledge: vi.fn(async () => null), cancelPledge: vi.fn(async () => null) }))
// Keep the real form markup while observing the defaults the RSC passes across the client boundary.
vi.mock("./PledgeForm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./PledgeForm")>()
  return { ...actual, PledgeForm: vi.fn(actual.PledgeForm) }
})

const { default: PledgePage } = await import("./page")
const { PledgeForm } = await import("./PledgeForm")

function campaignRow(overrides: Partial<PublicCampaign> = {}): PublicCampaign {
  return {
    id: CAMPAIGN,
    slug: SLUG,
    type: "back",
    funding_model: "all_or_nothing",
    category_id: null,
    title: "Dự án đèn",
    summary: null,
    story: null,
    beneficiary_name: null,
    beneficiary_relation: null,
    cover_media_id: null,
    asset: "VND",
    goal_amount: 50_000_000,
    min_contribution: 20_000,
    stretch_goal_amount: null,
    display_options: { progress_bar: true, backers_count: true, time_remaining: true },
    starts_at: null,
    ends_at: "2999-01-01T00:00:00.000Z",
    payment_window_days: 7,
    status: "live",
    submitted_at: null,
    approved_at: null,
    outcome_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    category: null,
    cover: null,
    ...overrides,
  }
}

function tierRow(id = TIER, overrides: Partial<PublicRewardTier> = {}): PublicRewardTier {
  return {
    id,
    campaign_id: CAMPAIGN,
    title: "Đèn bàn",
    description: null,
    min_amount: 200_000,
    quantity_limit: null,
    quantity_claimed: 0,
    quantity_remaining: null,
    estimated_delivery: null,
    requires_shipping: false,
    shipping_note: null,
    sort_order: 0,
    is_early_bird: false,
    available_until: null,
    ...overrides,
  }
}

function pledgeRow(overrides: Partial<OwnPledge> = {}): OwnPledge {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    campaign_id: CAMPAIGN,
    kind: "pledge",
    intended_amount: 350_000,
    received_amount: 0,
    reference_code: "GVABCDEFG",
    status: "pledged",
    reward_tier_id: TIER,
    shipping_address: SHIPPING,
    public_name: "Lan",
    is_anonymous: true,
    message: "Chúc dự án thành công",
    payment_due_at: null,
    refund_due_at: null,
    fulfillment_status: null,
    fulfillment_note: null,
    fulfillment_updated_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  }
}

function setup({
  campaign = campaignRow() as PublicCampaign | null,
  tiers = [tierRow()],
  pledges = [] as OwnPledge[],
  organizerId = null as string | null,
} = {}) {
  state.handler = (call) => {
    if (call.target === "campaigns") return { data: campaign }
    if (call.target === "public_reward_tiers") return { data: tiers }
    if (call.target === "contributions") return { data: pledges }
    if (call.target === "rpc:managed_campaigns") return { data: organizerId ? { organizer_id: organizerId } : null }
    throw new Error(`Unexpected read: ${call.target}`)
  }
}

function page(query: Record<string, string | string[] | undefined> = {}, slug = SLUG) {
  return PledgePage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(query) })
}

async function renderPage(query: Record<string, string | string[] | undefined> = {}) {
  const html = renderToStaticMarkup(await page(query))
  return new DOMParser().parseFromString(html, "text/html")
}

function formProps(): ComponentProps<typeof PledgeForm> {
  expect(PledgeForm).toHaveBeenCalledTimes(1)
  return vi.mocked(PledgeForm).mock.calls[0][0]
}

beforeEach(() => {
  vi.clearAllMocks()
  state.calls.length = 0
  setup()
})

describe("PledgePage (/campaigns/[slug]/pledge, DOS/Give#216)", () => {
  describe("routing and session", () => {
    it.each(["", "Du-an", "du--an", "-du-an", "du-an-", "du_an", "dự-án", "a".repeat(81)])(
      "rejects invalid slug %j before authenticating or reading the database",
      async (slug) => {
        await expect(page({}, slug)).rejects.toThrow("NEXT_NOT_FOUND")
        expect(notFoundMock).toHaveBeenCalledOnce()
        expect(requireSessionMock).not.toHaveBeenCalled()
        expect(dbAsMock).not.toHaveBeenCalled()
        expect(state.calls).toEqual([])
      }
    )

    it("accepts an 80-character slug", async () => {
      const slug = "a".repeat(80)
      await page({}, slug)
      expect(requireSessionMock).toHaveBeenCalledWith(`/campaigns/${slug}/pledge`)
      expect(op(state.calls[0], "eq")).toEqual(["slug", slug])
    })

    it.each([
      { query: {}, suffix: "" },
      { query: { tier: TIER.toUpperCase() }, suffix: `?tier=${TIER}` },
      { query: { tier: "not-a-uuid" }, suffix: "" },
      { query: { tier: "" }, suffix: "" },
      { query: { tier: [TIER, OTHER_TIER] }, suffix: "" },
    ])("authenticates with the sanitized return path for $query", async ({ query, suffix }) => {
      await page(query)
      expect(requireSessionMock).toHaveBeenCalledWith(`${RETURN_PATH}${suffix}`)
      expect(dbAsMock).toHaveBeenCalledWith("backer-token")
      const ownRead = state.calls.find((call) => call.target === "contributions")
      expect(ownRead?.ops).toContainEqual(["eq", "contributor_user_id", USER])
      expect(ownRead?.ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
    })

    it.each(["campaigns", "public_reward_tiers", "contributions"])(
      "redirects a rejected session from %s to login with the normalized tier return path",
      async (target) => {
        const read = state.handler
        state.handler = (call) => (call.target === target ? { error: { code: "PGRST301" } } : read(call))
        const path = `${RETURN_PATH}?tier=${TIER}`
        const login = `/auth/login?return_path=${encodeURIComponent(path)}`
        await expect(page({ tier: TIER.toUpperCase() })).rejects.toThrow(`NEXT_REDIRECT:${login}`)
        expect(redirectMock).toHaveBeenCalledWith(login)
      }
    )

    it("drops an invalid tier when returning to login for PGRST303", async () => {
      state.handler = () => ({ error: { code: "PGRST303" } })
      await expect(page({ tier: "bad" })).rejects.toThrow(
        `NEXT_REDIRECT:/auth/login?return_path=${encodeURIComponent(RETURN_PATH)}`
      )
    })

    it("propagates database errors that do not reject the session", async () => {
      const error = { code: "XX000", message: "database unavailable" }
      state.handler = () => ({ error })
      await expect(page()).rejects.toBe(error)
      expect(redirectMock).not.toHaveBeenCalled()
      expect(notFoundMock).not.toHaveBeenCalled()
    })

    it.each([null, "draft", "in_review", "changes_requested", "approved", "suspended", "cancelled"] as const)(
      "returns notFound for a missing or non-public campaign (%s)",
      async (status) => {
        setup({ campaign: status ? campaignRow({ status }) : null })
        await expect(page()).rejects.toThrow("NEXT_NOT_FOUND")
        expect(notFoundMock).toHaveBeenCalledOnce()
        expect(state.calls.map((call) => call.target)).toEqual(["campaigns"])
      }
    )

    it("redirects a give campaign to its campaign page", async () => {
      setup({ campaign: campaignRow({ type: "give" }) })
      await expect(page()).rejects.toThrow(`NEXT_REDIRECT:/campaigns/${SLUG}`)
      expect(redirectMock).toHaveBeenCalledWith(`/campaigns/${SLUG}`)
      expect(state.calls.map((call) => call.target)).toEqual(["campaigns"])
    })
  })

  describe("pledge defaults", () => {
    it("uses the session name and an unselected tier for a new pledge with rewards", async () => {
      const doc = await renderPage()
      expect(formProps().defaults).toEqual({
        tier: "",
        amount: null,
        public_name: "Lan Nguyễn",
        anonymous: false,
        message: "",
        shipping: null,
      })
      expect(formProps().changing).toBe(false)
      expect(formProps().minContribution).toBe(20_000)
      expect(doc.querySelector('input[name="tier"]:checked')).toBeNull()
      expect(doc.querySelector('button[type="submit"]')?.textContent).toBe("Cam kết ủng hộ")
    })

    it("uses an empty display name when the session has no name", async () => {
      requireSessionMock.mockResolvedValueOnce({
        user: { id: USER, email: null, name: null },
        accessToken: "backer-token",
      })
      await renderPage()
      expect(formProps().defaults.public_name).toBe("")
    })

    it("defaults to NO_REWARD when no tiers exist, even with an unknown tier query", async () => {
      setup({ tiers: [] })
      const doc = await renderPage({ tier: UNKNOWN_TIER })
      expect(formProps().defaults.tier).toBe(NO_REWARD)
      expect(doc.querySelector('input[name="tier"]:checked')?.getAttribute("value")).toBe(NO_REWARD)
    })

    it("preselects an existing available tier from a lowercased UUID query", async () => {
      const doc = await renderPage({ tier: TIER.toUpperCase() })
      expect(formProps().defaults.tier).toBe(TIER)
      expect(doc.querySelector('input[name="tier"]:checked')?.getAttribute("value")).toBe(TIER)
    })

    it.each(["unknown", "sold out"])("ignores an %s query tier for a new pledge", async (kind) => {
      setup({ tiers: [tierRow(TIER, { quantity_remaining: kind === "sold out" ? 0 : null })] })
      await renderPage({ tier: kind === "unknown" ? UNKNOWN_TIER : TIER })
      expect(formProps().defaults).toMatchObject({ tier: "", amount: null })
    })

    it.each([
      { label: "absent", query: {} },
      { label: "same", query: { tier: TIER } },
      { label: "unknown", query: { tier: UNKNOWN_TIER } },
      { label: "sold out", query: { tier: OTHER_TIER } },
    ])("preserves an open pledge's tier, amount and profile for a $label query", async ({ query }) => {
      setup({ tiers: [tierRow(), tierRow(OTHER_TIER, { quantity_remaining: 0 })], pledges: [pledgeRow()] })
      await renderPage(query)
      expect(formProps().defaults).toEqual({
        tier: TIER,
        amount: 350_000,
        public_name: "Lan",
        anonymous: true,
        message: "Chúc dự án thành công",
        shipping: SHIPPING,
      })
    })

    it("keeps an open pledge's sold-out tier as the fallback", async () => {
      setup({ tiers: [tierRow(TIER, { quantity_remaining: 0 })], pledges: [pledgeRow()] })
      await renderPage({ tier: TIER })
      expect(formProps().defaults).toMatchObject({ tier: TIER, amount: 350_000 })
    })

    it("uses NO_REWARD and empty nullable profile fields for an open pledge without a reward", async () => {
      setup({
        pledges: [
          pledgeRow({
            reward_tier_id: null,
            public_name: null,
            message: null,
            shipping_address: null,
            is_anonymous: false,
          }),
        ],
      })
      await renderPage()
      expect(formProps().defaults).toEqual({
        tier: NO_REWARD,
        amount: 350_000,
        public_name: "",
        anonymous: false,
        message: "",
        shipping: null,
      })
    })

    it("resets the amount when a query switches an open pledge to another available tier", async () => {
      setup({ tiers: [tierRow(), tierRow(OTHER_TIER)], pledges: [pledgeRow()] })
      await renderPage({ tier: OTHER_TIER })
      expect(formProps().defaults).toMatchObject({ tier: OTHER_TIER, amount: null })
    })
  })

  describe("page branches", () => {
    it.each([true, false])(
      "shows an open pledge with RefCode and cancellation only while accepting=%s",
      async (accepting) => {
        setup({ campaign: campaignRow({ status: accepting ? "live" : "settling" }), pledges: [pledgeRow()] })
        const doc = await renderPage()
        const title = Array.from(doc.querySelectorAll("p")).find(
          (p) => p.textContent === `Bạn đã cam kết ${formatVnd(350_000)}`
        )!
        expect(title).toBeTruthy()
        const callout = title.closest("div.rounded-md")!
        expect(callout.querySelector(".text-primary svg")).toBeTruthy()
        const code = callout.querySelector('span[translate="no"]')!
        expect(code.textContent).toBe("GVABCDEFG")
        for (const token of [
          "font-mono",
          "font-semibold",
          "tracking-wide",
          "whitespace-nowrap",
          "text-fg",
          "text-[length:max(1.125em,1rem)]",
        ])
          expect(code.classList.contains(token)).toBe(true)
        const link = callout.querySelector('a[href="/me/pledges/GVABCDEFG"]')!
        expect(link.textContent).toBe("Xem cam kết")
        expect(Array.from(callout.querySelectorAll("button")).some((b) => b.textContent === "Hủy cam kết")).toBe(
          accepting
        )
        if (accepting) {
          expect(formProps().changing).toBe(true)
          expect(doc.body.textContent).toContain("Lưu thay đổi")
        } else {
          expect(PledgeForm).not.toHaveBeenCalled()
          expect(doc.body.textContent).toContain("Dự án hiện không nhận cam kết")
        }
      }
    )

    it("hides the form for the campaign's organizer", async () => {
      setup({ organizerId: USER })
      const doc = await renderPage()
      expect(PledgeForm).not.toHaveBeenCalled()
      expect(doc.querySelector("form")).toBeNull()
      expect(doc.body.textContent).toContain("Đây là dự án của bạn")
      expect(doc.body.textContent).not.toContain("Dự án hiện không nhận cam kết")
    })

    it("allows a user who is not this campaign's organizer to pledge", async () => {
      setup({ organizerId: "another-organizer" })
      await renderPage()
      expect(formProps().changing).toBe(false)
    })

    it.each(["payment_due", "partially_paid", "paid", "lapsed", "refund_due", "refunded"] as const)(
      "shows a later %s pledge with its status badge instead of a form or closed notice",
      async (status) => {
        setup({ campaign: campaignRow({ status: "settling" }), pledges: [pledgeRow({ status })] })
        const doc = await renderPage()
        expect(PledgeForm).not.toHaveBeenCalled()
        expect(doc.body.textContent).toContain("Bạn đã có cam kết cho dự án này")
        expect(doc.body.textContent).toContain(formatVnd(350_000))
        const badge = Array.from(doc.querySelectorAll("span.inline-flex")).find(
          (s) => s.textContent === PLEDGE_STATUS_LABELS[status]
        )
        expect(badge).toBeTruthy()
        expect(doc.querySelector('a[href="/me/pledges/GVABCDEFG"]')?.textContent).toBe("Xem cam kết")
        expect(doc.body.textContent).not.toContain("Hủy cam kết")
        expect(doc.body.textContent).not.toContain("Dự án hiện không nhận cam kết")
      }
    )

    it("blocks a new pledge for a later pledge even while the campaign is accepting", async () => {
      setup({ pledges: [pledgeRow({ status: "paid" })] })
      const doc = await renderPage()
      expect(PledgeForm).not.toHaveBeenCalled()
      expect(doc.querySelector("form")).toBeNull()
      expect(doc.body.textContent).toContain("Bạn đã có cam kết cho dự án này")
      expect(doc.body.textContent).not.toContain("Dự án hiện không nhận cam kết")
    })

    it("ignores cancelled pledges when deciding whether to render the form", async () => {
      setup({ pledges: [pledgeRow({ status: "cancelled" })] })
      const doc = await renderPage()
      expect(formProps().changing).toBe(false)
      expect(doc.body.textContent).not.toContain("Bạn đã có cam kết cho dự án này")
    })

    it("prefers an open pledge over an older later pledge", async () => {
      setup({ pledges: [pledgeRow({ status: "paid", reference_code: "GVOLDPAID" }), pledgeRow()] })
      const doc = await renderPage()
      expect(formProps().changing).toBe(true)
      expect(doc.body.textContent).not.toContain("Bạn đã có cam kết cho dự án này")
      expect(doc.body.textContent).not.toContain("GVOLDPAID")
    })

    it.each([
      { status: "settling" },
      { status: "succeeded" },
      { status: "failed" },
      { status: "closed" },
      { ends_at: "2000-01-01T00:00:00.000Z" },
      { ends_at: null },
      { starts_at: "2998-01-01T00:00:00.000Z" },
    ] satisfies Partial<PublicCampaign>[])(
      "hides the form when the campaign is not accepting: %j",
      async (overrides) => {
        setup({ campaign: campaignRow(overrides) })
        const doc = await renderPage()
        expect(PledgeForm).not.toHaveBeenCalled()
        expect(doc.querySelector("form")).toBeNull()
        expect(doc.body.textContent).toContain("Dự án hiện không nhận cam kết")
        expect(doc.body.textContent).not.toContain("Bạn đã có cam kết cho dự án này")
      }
    )

    it("ignores ?tier for an expired Early Bird tier (DOS/Give#317)", async () => {
      const expiredTier = tierRow(TIER, {
        title: "Early Bird Hết Hạn",
        is_early_bird: true,
        available_until: "2020-01-01T00:00:00.000Z",
        quantity_remaining: 5,
      })
      const activeTier = tierRow(OTHER_TIER, { title: "Mức Thường", min_amount: 300_000 })
      setup({ tiers: [expiredTier, activeTier], pledges: [] })
      await renderPage({ tier: TIER })
      expect(formProps().defaults.tier).toBe("")
    })

    it("reassures a backer holding an existing open pledge on an expired Early Bird tier while allowing cancel or switch (DOS/Give#317)", async () => {
      const expiredTier = tierRow(TIER, {
        title: "Early Bird Hết Hạn",
        is_early_bird: true,
        available_until: "2020-01-01T00:00:00.000Z",
        quantity_remaining: 5,
      })
      const activeTier = tierRow(OTHER_TIER, { title: "Mức Thường", min_amount: 300_000 })
      setup({ tiers: [expiredTier, activeTier], pledges: [pledgeRow({ reward_tier_id: TIER })] })
      const doc = await renderPage()
      expect(doc.body.textContent).toContain("vẫn giữ nguyên hiệu lực")
      expect(doc.querySelector('a[href="/me/pledges/GVABCDEFG"]')?.textContent).toBe("Xem cam kết")
      expect(doc.body.textContent).toContain("Hủy cam kết")
      expect(formProps().changing).toBe(true)
      expect(formProps().currentTierId).toBe(TIER)
      expect(formProps().defaults.tier).toBe("")
    })

    it("preserves valid ?ref= across requireSession returnPath, shows attribution note, and passes hidden field (DOS/Give#319)", async () => {
      const baseHandler = state.handler
      state.handler = (call) => {
        if (call.target === "rpc:public_ambassador_ref") {
          return { data: [{ ref_code: "ab23cd45ef", display_name: "Minh Anh KOL" }] }
        }
        return baseHandler(call)
      }
      const doc = await renderPage({ tier: TIER, ref: "AB23CD45EF" })
      expect(requireSessionMock).toHaveBeenCalledWith(`/campaigns/${SLUG}/pledge?tier=${TIER}&ref=ab23cd45ef`)
      expect(doc.body.textContent).toContain("Bạn đang ủng hộ qua lời kêu gọi của Minh Anh KOL.")
      expect(doc.querySelector('input[name="ambassador_ref"]')?.getAttribute("value")).toBe("ab23cd45ef")
    })

    it("fails open silently when ?ref= is malformed or unknown (DOS/Give#319)", async () => {
      const doc = await renderPage({ ref: "invalid!!<script>" })
      expect(requireSessionMock).toHaveBeenCalledWith(`/campaigns/${SLUG}/pledge`)
      expect(doc.querySelector('input[name="ambassador_ref"]')).toBeNull()
      expect(doc.body.textContent).not.toContain("qua lời kêu gọi của")
      expect(state.calls.some((c) => c.target === "rpc:public_ambassador_ref")).toBe(false)
    })
  })
})
