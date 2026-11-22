// @vitest-environment happy-dom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SelectAll } from "@/components/SelectAll"
import type { CampaignStatus, CampaignType } from "@/lib/campaigns"
import { FULFILLMENT_BATCH_MAX, type FulfillmentPledge } from "@/lib/fulfillment"
import type { RewardTier } from "@/lib/reward-tiers"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const OTHER_USER = "99999999-9999-4999-8999-999999999999"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TIER_EARLY = "33333333-3333-4333-8333-333333333333"
const TIER_DELUXE = "44444444-4444-4444-8444-444444444444"
const PLEDGE_1 = "55555555-5555-4555-8555-555555555555"
const PLEDGE_2 = "66666666-6666-4666-8666-666666666666"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  calls: [] as Call[],
  serviceCalls: [] as Call[],
  tokens: [] as (string | undefined)[],
  serviceUsed: false,
}))

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  })
)

const requireSessionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    user: { id: USER, email: "creator@example.vn", name: "Creator" },
    accessToken: "creator-jwt",
  }))
)

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  usePathname: () => `/me/campaigns/${CAMPAIGN}/fulfillment`,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: USER, email: "creator@example.vn", name: null }, accessToken: "tok" })),
  requireSession: requireSessionMock,
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) => {
    state.tokens.push(token)
    return fakeDb((call) => state.handler(call), state.calls)
  },
  dbService: () => {
    state.serviceUsed = true
    return fakeDb((call) => state.serviceHandler(call), state.serviceCalls)
  },
}))

const { default: FulfillmentPage } = await import("./page")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

function makeCampaign({
  organizer_id = USER,
  type = "back" as CampaignType,
  status = "succeeded" as CampaignStatus,
} = {}) {
  return {
    id: CAMPAIGN,
    organizer_id,
    slug: "den-go-thu-cong",
    title: "Đèn gỗ thủ công",
    type,
    funding_model: type === "give" ? "flexible" : "all_or_nothing",
    status,
  }
}

function makeTier(id: string, title: string, sort_order: number): RewardTier {
  return {
    id,
    campaign_id: CAMPAIGN,
    title,
    description: null,
    min_amount: 200_000,
    quantity_limit: null,
    quantity_claimed: 1,
    estimated_delivery: "2027-03-01",
    requires_shipping: true,
    shipping_note: null,
    status: "active",
    sort_order,
    retired_at: null,
    is_early_bird: false,
    available_until: null,
  }
}

function makePledge(overrides: Partial<FulfillmentPledge> & { id: string; reference_code: string }): FulfillmentPledge {
  return {
    public_name: "Nguyễn Minh",
    is_anonymous: false,
    intended_amount: 350_000,
    received_amount: 350_000,
    reward_tier_id: TIER_EARLY,
    shipping_address: null,
    fulfillment_status: null,
    fulfillment_note: null,
    fulfillment_updated_at: null,
    created_at: "2026-11-10T04:00:00Z",
    ...overrides,
  }
}

async function renderPage(
  id = CAMPAIGN,
  searchParams: Record<string, string | string[] | undefined> = {}
): Promise<string> {
  const page = await FulfillmentPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(searchParams),
  })
  return renderToStaticMarkup(page).replace(/\u00a0/g, " ")
}

beforeEach(() => {
  notFoundMock.mockClear()
  requireSessionMock.mockClear()
  state.calls.length = 0
  state.serviceCalls.length = 0
  state.tokens.length = 0
  state.serviceUsed = false
  state.serviceHandler = () => undefined
})

describe("FulfillmentPage (DOS/Give#217)", () => {
  describe("session and route guards", () => {
    it("calls requireSession with the fulfillment path and triggers notFound() on non-UUID id without querying DB", async () => {
      await expect(renderPage("not-a-uuid")).rejects.toThrow("NEXT_NOT_FOUND")
      expect(requireSessionMock).toHaveBeenCalledWith("/me/campaigns/not-a-uuid/fulfillment")
      expect(notFoundMock).toHaveBeenCalledTimes(1)
      expect(state.calls).toHaveLength(0)
    })

    it.each([
      ["missing campaign", () => null],
      ["foreign organizer_id", () => makeCampaign({ organizer_id: OTHER_USER })],
      ["give campaign", () => makeCampaign({ type: "give", status: "closed" })],
    ])("calls notFound() on %s", async (_case, getRow) => {
      state.handler = (call) => {
        if (call.target === "rpc:managed_campaigns") return { data: getRow() }
        return undefined
      }

      await expect(renderPage(CAMPAIGN)).rejects.toThrow("NEXT_NOT_FOUND")
      expect(requireSessionMock).toHaveBeenCalledWith(`/me/campaigns/${CAMPAIGN}/fulfillment`)
      expect(state.tokens).toEqual(["creator-jwt"])
      expect(state.serviceUsed).toBe(false)
      expect(notFoundMock).toHaveBeenCalledTimes(1)
    })
  })

  describe("when !canUpdateFulfillment(campaign)", () => {
    it.each([
      ["live", "Đang gây quỹ"],
      ["failed", "Không đạt mục tiêu"],
    ] as const)(
      "skips both listCampaignTiers and listFulfillmentPledges for a %s back campaign and renders the status Callout",
      async (status, badgeLabel) => {
        state.handler = (call) => {
          if (call.target === "rpc:managed_campaigns") return { data: makeCampaign({ status }) }
          return undefined
        }

        const html = await renderPage()
        expect(state.serviceUsed).toBe(false)
        expect(state.calls.map((c) => c.target)).toEqual(["rpc:managed_campaigns"])
        expect(html).toContain("Chỉ cập nhật giao quà được khi dự án đã gây quỹ thành công.")
        expect(html).toContain(`>${badgeLabel}<`)
        expect(html).not.toContain('aria-label="Lọc người ủng hộ"')
      }
    )
  })

  describe("succeeded back campaign", () => {
    it("renders the GET filter form, omits 'Bỏ lọc' when unfiltered, and shows level-2 unfiltered EmptyState", async () => {
      state.handler = (call) => {
        if (call.target === "rpc:managed_campaigns") return { data: makeCampaign({ status: "succeeded" }) }
        if (call.target === "reward_tiers") {
          return {
            data: [makeTier(TIER_DELUXE, "Bản đặc biệt", 2), makeTier(TIER_EARLY, "Bản sớm", 1)],
          }
        }
        if (call.target === "contributions") return { data: [], count: 0 }
        return undefined
      }

      const html = await renderPage()
      expect(state.calls.map((c) => c.target)).toContain("contributions")
      expect(html).toMatch(/<form[^>]*aria-label="Lọc người ủng hộ"[^>]*method="get"/)
      expect(html).toContain('name="tier"')
      expect(html).toContain('name="status"')
      // Tiers inside the filter select are ordered via sortTiers (Bản sớm before Bản đặc biệt).
      expect(html.indexOf("Bản sớm")).toBeLessThan(html.indexOf("Bản đặc biệt"))
      expect(html).toContain('<option value="none">Không nhận quà</option>')
      expect(html).toContain('<option value="none">Chưa cập nhật</option>')
      expect(html).not.toContain(">Bỏ lọc<")
      expect(html).toMatch(/<h2[^>]*>Chưa có người ủng hộ nào thanh toán đủ\.<\/h2>/)
    })

    it("shows 'Bỏ lọc' and the filtered level-2 EmptyState when a valid tier or status filter matches nothing", async () => {
      state.handler = (call) => {
        if (call.target === "rpc:managed_campaigns") return { data: makeCampaign({ status: "succeeded" }) }
        if (call.target === "reward_tiers") return { data: [makeTier(TIER_EARLY, "Bản sớm", 0)] }
        if (call.target === "contributions") return { data: [], count: 0 }
        return undefined
      }

      const html = await renderPage(CAMPAIGN, { tier: TIER_EARLY, status: "shipped" })
      expect(html).toContain(`href="/me/campaigns/${CAMPAIGN}/fulfillment"`)
      expect(html).toContain(">Bỏ lọc<")
      expect(html).toMatch(/<h2[^>]*>Không có lượt ủng hộ nào khớp bộ lọc\.<\/h2>/)
    })

    it("renders FULFILLMENT_BATCH_MAX batch summary, RefCode, formatted shippingLines <address>, and per-row controls", async () => {
      state.handler = (call) => {
        if (call.target === "rpc:managed_campaigns") return { data: makeCampaign({ status: "succeeded" }) }
        if (call.target === "reward_tiers") return { data: [makeTier(TIER_EARLY, "Bản sớm", 0)] }
        if (call.target === "contributions") {
          return {
            count: 620,
            data: [
              makePledge({
                id: PLEDGE_1,
                reference_code: "GVBK1001",
                public_name: "Trần Thu Hà",
                intended_amount: 450_000,
                reward_tier_id: TIER_EARLY,
                shipping_address: {
                  address: "12 Lê Lợi, Quận 1, TP.HCM",
                  recipient: "Trần Thu Hà",
                  phone: "0901234567",
                  note: "Giao giờ hành chính",
                },
                fulfillment_status: "shipped",
                fulfillment_note: "GHN-8899",
                fulfillment_updated_at: "2026-11-15T08:30:00Z",
              }),
              makePledge({
                id: PLEDGE_2,
                reference_code: "GVBK1002",
                public_name: null,
                is_anonymous: true,
                intended_amount: 100_000,
                reward_tier_id: null,
                shipping_address: null,
                fulfillment_status: null,
                fulfillment_note: null,
              }),
            ],
          }
        }
        return undefined
      }

      const html = await renderPage()

      expect(html).toContain(`Hiện 1–2 trong 620 lượt ủng hộ (tối đa ${FULFILLMENT_BATCH_MAX} mỗi trang).`)
      expect(html).toContain("1 chưa cập nhật.")
      expect(html).toContain("1 đã gửi đi")
      expect(html).toContain('aria-label="Phân trang người ủng hộ"')
      expect(html).toContain("Trang 1 / 2 (620 lượt ủng hộ)")
      expect(html).toContain(`href="/me/campaigns/${CAMPAIGN}/fulfillment?page=2"`)
      expect(html).toContain(">Trang sau<")
      expect(html).not.toContain(">Trang trước<")

      // Exclude <li> items inside anything else if any; the pledge list has 2 <li> items.
      const rows = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map((m) => m[0])
      expect(rows).toHaveLength(2)

      // Row 0: tier title, RefCode (translate="no" font-mono, DESIGN.md 3), ordered shippingLines <address>, and row controls.
      expect(rows[0]).toContain("Trần Thu Hà")
      expect(rows[0]).toContain("Bản sớm")
      expect(rows[0]).toContain("450.000 ₫")
      expect(rows[0]).toMatch(/<span[^>]*translate="no"[^>]*font-mono[^>]*>GVBK1001<\/span>/)
      expect(rows[0]).toContain("<address")
      const addrRecipient = rows[0].indexOf("Người nhận: Trần Thu Hà")
      const addrPhone = rows[0].indexOf("Số điện thoại: 0901234567")
      const addrStreet = rows[0].indexOf("Địa chỉ: 12 Lê Lợi, Quận 1, TP.HCM")
      const addrExtra = rows[0].indexOf("Giao giờ hành chính")
      expect(addrRecipient).toBeGreaterThan(-1)
      expect(addrRecipient).toBeLessThan(addrPhone)
      expect(addrPhone).toBeLessThan(addrStreet)
      expect(addrStreet).toBeLessThan(addrExtra)
      expect(rows[0]).toContain("Ghi chú: GHN-8899")
      expect(rows[0]).toContain(`name="contribution_id" value="${PLEDGE_1}"`)
      expect(rows[0]).toContain(`name="status_${PLEDGE_1}"`)
      expect(rows[0]).toContain(`name="note_${PLEDGE_1}"`)
      expect(rows[0]).toMatch(
        new RegExp(
          `<button[^>]*value="${PLEDGE_1}"[^>]*name="only"[^>]*>Lưu cho người này<span class="sr-only"> \\(GVBK1001\\)</span></button>`
        )
      )

      // Row 1: fallback supporter label, anonymous hint, no-reward copy, no <address>, and row controls.
      expect(rows[1]).toContain("Người ủng hộ")
      expect(rows[1]).toContain("(ẩn danh trên trang công khai)")
      expect(rows[1]).toContain("Không nhận quà")
      expect(rows[1]).toMatch(/<span[^>]*translate="no"[^>]*font-mono[^>]*>GVBK1002<\/span>/)
      expect(rows[1]).not.toContain("<address")
      expect(rows[1]).toContain(`name="status_${PLEDGE_2}"`)
      expect(rows[1]).toContain(`name="note_${PLEDGE_2}"`)
      expect(rows[1]).toMatch(
        new RegExp(
          `<button[^>]*value="${PLEDGE_2}"[^>]*name="only"[^>]*>Lưu cho người này<span class="sr-only"> \\(GVBK1002\\)</span></button>`
        )
      )
    })

    it("paginates 500+ filtered backers across pages while preserving tier/status filters and handling exhausted page > 1", async () => {
      state.handler = (call) => {
        if (call.target === "rpc:managed_campaigns") return { data: makeCampaign({ status: "succeeded" }) }
        if (call.target === "reward_tiers") return { data: [makeTier(TIER_EARLY, "Bản sớm", 0)] }
        if (call.target === "contributions") {
          return {
            count: 501,
            data: [
              makePledge({
                id: PLEDGE_2,
                reference_code: "GVBK1501",
                fulfillment_status: "shipped",
              }),
            ],
          }
        }
        return undefined
      }

      const page2Html = await renderPage(CAMPAIGN, { tier: TIER_EARLY, status: "shipped", page: "2" })
      const contribCall = state.calls.find((c) => c.target === "contributions")
      expect(op(contribCall, "range")).toEqual([500, 999])
      expect(page2Html).toContain(
        `Hiện 501–501 trong 501 lượt ủng hộ khớp bộ lọc (tối đa ${FULFILLMENT_BATCH_MAX} mỗi trang).`
      )
      expect(page2Html).toContain("Trang 2 / 2 (501 lượt ủng hộ)")
      expect(page2Html).toContain(`href="/me/campaigns/${CAMPAIGN}/fulfillment?tier=${TIER_EARLY}&amp;status=shipped"`)
      expect(page2Html).toContain(">Trang trước<")
      expect(page2Html).not.toContain(">Trang sau<")

      // When page 2 becomes empty after moving backers out of a filtered status, Trang trước stays available.
      state.calls.length = 0
      state.handler = (call) => {
        if (call.target === "rpc:managed_campaigns") return { data: makeCampaign({ status: "succeeded" }) }
        if (call.target === "reward_tiers") return { data: [makeTier(TIER_EARLY, "Bản sớm", 0)] }
        if (call.target === "contributions") {
          return op(call, "range")
            ? { error: { code: "PGRST103", message: "Requested range not satisfiable" } }
            : { count: 500 }
        }
        return undefined
      }
      const emptyPage2Html = await renderPage(CAMPAIGN, { status: "none", page: "2" })
      expect(emptyPage2Html).toContain("Trang này không còn lượt ủng hộ nào.")
      expect(emptyPage2Html).toContain(`href="/me/campaigns/${CAMPAIGN}/fulfillment?status=none"`)
      expect(emptyPage2Html).toContain(">Trang trước<")
    })
  })
})

describe("FulfillmentForm bulk save reset (DOS/Give#241)", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("resets checked rows, SelectAll, and #bulk_note after a successful bulk save, while keeping them on failure", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: makeCampaign({ status: "succeeded" }) }
      if (call.target === "reward_tiers") return { data: [makeTier(TIER_EARLY, "Bản sớm", 0)] }
      if (call.target === "contributions") {
        return {
          count: 2,
          data: [
            makePledge({ id: PLEDGE_1, reference_code: "GVBK1001" }),
            makePledge({ id: PLEDGE_2, reference_code: "GVBK1002" }),
          ],
        }
      }
      return undefined
    }

    const pageElement = await FulfillmentPage({
      params: Promise.resolve({ id: CAMPAIGN }),
      searchParams: Promise.resolve({}),
    })
    await act(async () => {
      root.render(pageElement)
    })

    const master = container.querySelector<HTMLInputElement>("fieldset label input[type='checkbox']")!
    const boxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="contribution_id"]')]
    const bulkStatus = container.querySelector<HTMLSelectElement>("#bulk_status")!
    const bulkNote = container.querySelector<HTMLInputElement>("#bulk_note")!
    const bulkSubmit = [...container.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find((b) =>
      b.textContent?.includes("Cập nhật những người đã chọn")
    )!

    expect(boxes).toHaveLength(2)

    // 1. Failed bulk update keeps selection and #bulk_note intact.
    state.serviceHandler = () => ({ error: { message: "network_error" } })
    act(() => {
      master.click()
      bulkStatus.value = "shipped"
      bulkNote.value = "GHN-BATCH-1"
    })
    expect(master.checked).toBe(true)
    expect(boxes.map((b) => b.checked)).toEqual([true, true])

    await act(async () => {
      bulkSubmit.click()
    })
    expect(master.checked).toBe(true)
    expect(boxes.map((b) => b.checked)).toEqual([true, true])
    expect(bulkNote.value).toBe("GHN-BATCH-1")

    // 2. Successful bulk update clears SelectAll, row checkboxes, and #bulk_note.
    state.serviceCalls.length = 0
    state.serviceHandler = () => ({ data: 2 })
    await act(async () => {
      bulkSubmit.click()
    })

    expect(state.serviceCalls).toHaveLength(1)
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_actor_id: USER,
        p_campaign_id: CAMPAIGN,
        p_contribution_ids: [PLEDGE_1, PLEDGE_2],
        p_status: "shipped",
        p_note: "GHN-BATCH-1",
      },
    ])
    expect(master.checked).toBe(false)
    expect(boxes.map((b) => b.checked)).toEqual([false, false])
    expect(bulkNote.value).toBe("")

    // 3. Ticking only PLEDGE_2 afterwards submits ONLY PLEDGE_2 with an empty note and never re-submits PLEDGE_1.
    state.serviceCalls.length = 0
    state.serviceHandler = () => ({ data: 1 })
    act(() => {
      boxes[1].click()
      bulkStatus.value = "in_progress"
    })
    await act(async () => {
      bulkSubmit.click()
    })

    expect(state.serviceCalls).toHaveLength(1)
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_actor_id: USER,
        p_campaign_id: CAMPAIGN,
        p_contribution_ids: [PLEDGE_2],
        p_status: "in_progress",
        p_note: null,
      },
    ])

    // 4. Re-rendering with refreshed RSC props remounts row status/note controls with the saved values while keeping checkboxes unchecked.
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: makeCampaign({ status: "succeeded" }) }
      if (call.target === "reward_tiers") return { data: [makeTier(TIER_EARLY, "Bản sớm", 0)] }
      if (call.target === "contributions") {
        return {
          count: 2,
          data: [
            makePledge({
              id: PLEDGE_1,
              reference_code: "GVBK1001",
              fulfillment_status: "shipped",
              fulfillment_note: "GHN-BATCH-1",
              fulfillment_updated_at: "2026-11-18T10:00:00Z",
            }),
            makePledge({
              id: PLEDGE_2,
              reference_code: "GVBK1002",
              fulfillment_status: "in_progress",
              fulfillment_note: null,
              fulfillment_updated_at: "2026-11-18T10:01:00Z",
            }),
          ],
        }
      }
      return undefined
    }
    const refreshedElement = await FulfillmentPage({
      params: Promise.resolve({ id: CAMPAIGN }),
      searchParams: Promise.resolve({}),
    })
    await act(async () => {
      root.render(refreshedElement)
    })

    expect(container.querySelector<HTMLSelectElement>(`select[name="status_${PLEDGE_1}"]`)?.value).toBe("shipped")
    expect(container.querySelector<HTMLInputElement>(`input[name="note_${PLEDGE_1}"]`)?.value).toBe("GHN-BATCH-1")
    expect(container.querySelector<HTMLSelectElement>(`select[name="status_${PLEDGE_2}"]`)?.value).toBe("in_progress")
    expect(container.querySelector<HTMLInputElement>(`input[name="note_${PLEDGE_2}"]`)?.value).toBe("")
    expect(
      [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="contribution_id"]')].map(
        (b) => b.checked
      )
    ).toEqual([false, false])
  })
})

describe("SelectAll (DOS/Give#217)", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("checks and clears every checkbox with matching name in its own <form> without affecting other names or other forms", () => {
    act(() => {
      root.render(
        createElement(
          "div",
          null,
          createElement(
            "form",
            { id: "target-form" },
            createElement(SelectAll, { name: "contribution_id", label: "Chọn tất cả trong danh sách" }),
            createElement("input", { id: "row-1", type: "checkbox", name: "contribution_id", defaultChecked: false }),
            createElement("input", { id: "row-2", type: "checkbox", name: "contribution_id", defaultChecked: true }),
            createElement("input", { id: "other-check", type: "checkbox", name: "keep_me", defaultChecked: true }),
            createElement("input", { id: "other-unchecked", type: "checkbox", name: "skip_me", defaultChecked: false })
          ),
          createElement(
            "form",
            { id: "sibling-form" },
            createElement("input", {
              id: "sibling-row-1",
              type: "checkbox",
              name: "contribution_id",
              defaultChecked: false,
            }),
            createElement("input", {
              id: "sibling-row-2",
              type: "checkbox",
              name: "contribution_id",
              defaultChecked: true,
            })
          )
        )
      )
    })

    const master = container.querySelector<HTMLInputElement>("#target-form label input[type='checkbox']")!
    const row1 = container.querySelector<HTMLInputElement>("#row-1")!
    const row2 = container.querySelector<HTMLInputElement>("#row-2")!
    const otherCheck = container.querySelector<HTMLInputElement>("#other-check")!
    const otherUnchecked = container.querySelector<HTMLInputElement>("#other-unchecked")!
    const siblingRow1 = container.querySelector<HTMLInputElement>("#sibling-row-1")!
    const siblingRow2 = container.querySelector<HTMLInputElement>("#sibling-row-2")!

    expect(master.checked).toBe(false)
    expect(row1.checked).toBe(false)
    expect(row2.checked).toBe(true)

    // Toggle ON: ticks all contribution_id checkboxes inside #target-form only.
    act(() => {
      master.click()
    })

    expect(master.checked).toBe(true)
    expect(row1.checked).toBe(true)
    expect(row2.checked).toBe(true)
    expect(otherCheck.checked).toBe(true)
    expect(otherUnchecked.checked).toBe(false)
    expect(siblingRow1.checked).toBe(false)
    expect(siblingRow2.checked).toBe(true)

    // Toggle OFF: clears all contribution_id checkboxes inside #target-form only.
    act(() => {
      master.click()
    })

    expect(master.checked).toBe(false)
    expect(row1.checked).toBe(false)
    expect(row2.checked).toBe(false)
    expect(otherCheck.checked).toBe(true)
    expect(otherUnchecked.checked).toBe(false)
    expect(siblingRow1.checked).toBe(false)
    expect(siblingRow2.checked).toBe(true)
  })

  it("does not throw when rendered outside a <form>", () => {
    act(() => {
      root.render(createElement(SelectAll, { name: "contribution_id", label: "Độc lập" }))
    })
    const box = container.querySelector<HTMLInputElement>("input[type='checkbox']")!
    expect(() => {
      act(() => {
        box.click()
      })
    }).not.toThrow()
    expect(box.checked).toBe(true)
  })
})
