// @vitest-environment happy-dom
import { Writable } from "node:stream"

import { Window } from "happy-dom"
import type { ReactNode } from "react"
import { createElement } from "react"
import { renderToPipeableStream } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatVnd } from "@/lib/format"
import { NEW_CODE_EVERY_MONTH, PLAN_ENDED_REASON_LABELS } from "@/lib/plans"
import { fakeDb, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const OTHER_CAMPAIGN = "55555555-5555-4555-8555-555555555555"
const PLAN = "44444444-4444-4444-8444-444444444444"
const OLD_PLAN = "66666666-6666-4666-8666-666666666666"
// 10:00 on 20/11/2026 in Vietnam.
const NOW = new Date("2026-11-20T03:00:00.000Z")

const ACCOUNT = { channel: "statement_import", bank_bin: "970436", account_number: "0123456789", account_name: "A" }

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  // The service role's give.payment_account: the campaign's usable account.
  service: (() => undefined) as Handler,
}))

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: USER, email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.handler(call), state.calls),
  dbService: () => fakeDb((call) => state.service(call)),
}))
vi.mock("../_components/MePage", () => ({
  MePage: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}))
vi.mock("./actions", () => ({ updatePlan: vi.fn(async () => null), cancelPlan: vi.fn(async () => null) }))

const { default: MyContributionsPage } = await import("./page")

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

async function render() {
  const html = await renderAsync(await MyContributionsPage())
  const win = new Window()
  win.document.body.innerHTML = html
  return { html, doc: win.document }
}

const campaign = { slug: "bua-trua", title: "Bữa trưa cho em", status: "live", ends_at: "2027-06-30T17:00:00.000Z" }

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN,
    campaign_id: CAMPAIGN,
    amount: 200000,
    day_of_month: 5,
    status: "active",
    ended_reason: null,
    next_period: "2026-12-01",
    created_at: "2026-11-05T01:00:00.000Z",
    ended_at: null,
    campaign,
    ...overrides,
  }
}

function donation(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    kind: "donation",
    campaign_id: CAMPAIGN,
    reference_code: "GVPLAN234",
    intended_amount: 200000,
    received_amount: 0,
    status: "awaiting_transfer",
    is_anonymous: false,
    payment_due_at: null,
    fulfillment_status: null,
    reward_tier_id: null,
    created_at: "2026-11-05T01:00:00.000Z",
    plan_id: PLAN,
    plan_period: "2026-11-01",
    campaign: { slug: campaign.slug, title: campaign.title },
    ...overrides,
  }
}

function serve(plans: unknown[], contributions: unknown[]) {
  state.handler = (call) => {
    if (call.target === "donation_plans") return { data: plans }
    if (call.target === "contributions") return { data: contributions }
    return undefined
  }
}

const planSection = (doc: Window["document"]) =>
  doc.querySelector('section[aria-labelledby="monthly-plans-title"]') as unknown as Element | null

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  state.calls.length = 0
  state.service = (call) => (call.target === "rpc:payment_account" ? { data: ACCOUNT } : undefined)
})
afterEach(() => {
  vi.useRealTimers()
})

describe("MyContributionsPage monthly plans (DOS/Give#276)", () => {
  it("shows an active plan with this month's payable donation, the edit and stop forms, and marks the list", async () => {
    serve([plan()], [donation()])
    const { html, doc } = await render()

    const section = planSection(doc)!
    expect(section).not.toBeNull()
    expect(section.querySelector("h2")?.textContent).toBe("Ủng hộ hằng tháng")
    expect(html.split(NEW_CODE_EVERY_MONTH)).toHaveLength(2)
    expect(section.textContent).toContain("Bữa trưa cho em")
    expect(section.textContent).toContain(`${formatVnd(200000)} mỗi tháng · Ngày 5 hằng tháng`)
    expect(section.textContent).toContain("Đang nhắc hằng tháng")

    const pay = section.querySelector('a[href="/donations/GVPLAN234"]')
    expect(pay?.textContent).toBe("Chuyển khoản tháng này")
    expect(pay?.className).toContain("btn-primary")

    const edit = section.querySelector("details form")!
    expect(edit.querySelector('input[name="amount"]')?.getAttribute("value")).toBe("200.000")
    expect(edit.querySelector('select[name="day_of_month"] option[selected]')?.getAttribute("value")).toBe("5")
    expect(edit.textContent).toContain("Áp dụng từ tháng sau")

    const stop = [...section.querySelectorAll("button")].find((b) => b.textContent === "Dừng ủng hộ hằng tháng")
    expect(stop).toBeDefined()
    expect(stop!.closest("form")?.textContent).toContain("Mã ủng hộ đã có của tháng này vẫn dùng được.")

    expect(doc.body.textContent).toContain("Tất cả lượt ủng hộ")
    expect(doc.body.textContent).toContain("Hằng tháng · tháng 11/2026")
    for (const word of ["quá hạn", "nợ", "còn thiếu", "tự trừ"]) expect(html).not.toContain(word)

    const plansCall = state.calls.find((c) => c.target === "donation_plans")!
    expect(plansCall.ops).toContainEqual(["eq", "contributor_user_id", USER])
    const contributionsSelect = String(state.calls.find((c) => c.target === "contributions")?.ops[0][1])
    expect(contributionsSelect).toContain("plan_period")
  })

  it("offers no transfer while the campaign has no usable account (give.plan_donation_payable)", async () => {
    serve([plan()], [donation()])
    state.service = () => ({ data: null })
    const { doc } = await render()
    expect(planSection(doc)!.querySelector('a[href="/donations/GVPLAN234"]')?.textContent).not.toBe(
      "Chuyển khoản tháng này"
    )
  })

  it("shows this month's status instead of the pay button once received, or when the campaign stopped", async () => {
    serve([plan()], [donation({ status: "received", received_amount: 200000 })])
    let section = planSection((await render()).doc)!
    expect(section.textContent).toContain("Tháng 11/2026:")
    expect(section.textContent).toContain(`Đã nhận ${formatVnd(200000)}. Cảm ơn bạn!`)
    expect(section.querySelector('a[href="/donations/GVPLAN234"]')).toBeNull()

    serve([plan({ campaign: { ...campaign, status: "suspended" } })], [donation()])
    section = planSection((await render()).doc)!
    expect(section.textContent).toContain("Chiến dịch hiện không nhận chuyển khoản")
    expect(section.querySelector('a[href="/donations/GVPLAN234"]')?.textContent).toBe("Xem trạng thái")
  })

  it("says when this month's code comes while it is not issued yet", async () => {
    serve([plan({ day_of_month: 25, next_period: "2026-11-01" })], [])
    const { doc } = await render()
    const section = planSection(doc)!
    expect(section.textContent).toContain("Mã ủng hộ tháng 11/2026 sẽ có vào ngày 25/11/2026.")
    expect(section.textContent).toContain("Áp dụng từ mã ủng hộ tháng này.")
    // A plan without donations still shows; the list has nothing yet.
    expect(doc.body.textContent).not.toContain("Tất cả lượt ủng hộ")
  })

  it("never promises a past month: a next_period left behind (campaign suspended) shows this month", async () => {
    serve([plan({ day_of_month: 25, next_period: "2026-09-01" })], [])
    const { doc } = await render()
    const section = planSection(doc)!
    expect(section.textContent).toContain("Mã ủng hộ tháng 11/2026 sẽ có vào ngày 25/11/2026.")
    expect(section.textContent).not.toContain("09/2026")
    expect(section.textContent).toContain("Áp dụng từ mã ủng hộ tháng này.")
  })

  it("finds this month's donation kept from a plan cancelled and signed up again this month", async () => {
    serve(
      [plan(), plan({ id: OLD_PLAN, status: "ended", ended_reason: "donor_cancelled", ended_at: NOW.toISOString() })],
      [donation({ plan_id: OLD_PLAN })]
    )
    const section = planSection((await render()).doc)!
    const items = [...section.querySelectorAll("li")]
    expect(items).toHaveLength(2)
    expect(items[0].querySelector('a[href="/donations/GVPLAN234"]')?.textContent).toBe("Chuyển khoản tháng này")
    expect(items[1].textContent).toContain("Đã dừng")
    expect(items[1].textContent).toContain(PLAN_ENDED_REASON_LABELS.donor_cancelled)
    expect(items[1].querySelector("form")).toBeNull()
    expect(items[1].querySelector('a[href^="/donations/"]')).toBeNull()
  })

  it("lists ended plans after active ones, with why they ended", async () => {
    serve(
      [
        plan({ status: "ended", ended_reason: "organizer_disabled", ended_at: "2026-11-10T00:00:00.000Z" }),
        plan({ id: OLD_PLAN, campaign_id: OTHER_CAMPAIGN, amount: 50000 }),
      ],
      []
    )
    const items = [...planSection((await render()).doc)!.querySelectorAll("li")]
    expect(items[0].textContent).toContain(`${formatVnd(50000)} mỗi tháng`)
    expect(items[1].textContent).toContain(PLAN_ENDED_REASON_LABELS.organizer_disabled)
  })

  it("shows no plan section without plans, and the empty state when there is nothing at all", async () => {
    serve([], [donation({ plan_id: null, plan_period: null })])
    let { doc } = await render()
    expect(planSection(doc)).toBeNull()
    expect(doc.body.textContent).not.toContain("Hằng tháng · tháng")
    expect(doc.body.textContent).not.toContain("Tất cả lượt ủng hộ")

    serve([], [])
    ;({ doc } = await render())
    expect(doc.body.textContent).toContain("Bạn chưa ủng hộ chiến dịch hay dự án nào.")
  })
})
