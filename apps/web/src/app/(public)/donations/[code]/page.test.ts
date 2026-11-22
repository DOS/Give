import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NEW_CODE_EVERY_MONTH } from "@/lib/plans"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TOKEN = "0123456789abcdef".repeat(4)
const TOKEN_SHA256 = "4884fdaafea47c29fea7159d0daddd9c085d6200e1359e85bb81736af6b7c837"

const state = vi.hoisted(() => ({
  session: null as { user: { id: string; email: null; name: null }; accessToken: string } | null,
  cookieMap: new Map<string, string>(),
  host: "give.dos.me",
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: state.host }),
  cookies: async () => ({
    get: (name: string) => {
      const value = state.cookieMap.get(name)
      return value === undefined ? undefined : { value }
    },
  }),
}))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => state.session) }))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { default: DonationPage, metadata } = await import("./page")

function guestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    campaign_id: CAMPAIGN,
    intended_amount: 250000,
    received_amount: 250000,
    reference_code: "GVABCDEFG",
    status: "received",
    created_at: "2026-11-10T00:00:00.000Z",
    status_token_hash: `\\x${TOKEN_SHA256}`,
    status_token_expires_at: "2999-11-17T00:00:00.000Z",
    guest_name: "Secret Donor",
    guest_email: "donor@example.com",
    public_name: "Minh",
    message: "Private donor message",
    ...overrides,
  }
}

function campaignRow() {
  return {
    id: CAMPAIGN,
    slug: "nuoi-em",
    title: "Bữa trưa cho em",
    type: "give",
    status: "live",
    starts_at: null,
    ends_at: null,
    payments_stopped_at: null,
    payments_stopped_note: null,
  }
}

beforeEach(() => {
  state.session = null
  state.cookieMap = new Map()
  state.host = "give.dos.me"
  state.userHandler = () => undefined
  state.serviceHandler = (call) => {
    if (call.target === "contributions") return { data: guestRow() }
    if (call.target === "campaigns") return { data: campaignRow() }
    if (call.target === "rpc:payment_account") {
      return {
        data: { channel: "statement_import", bank_bin: "970436", account_number: "0123456789", account_name: "QUY A" },
      }
    }
    return undefined
  }
  state.userCalls.length = 0
  state.serviceCalls.length = 0
})

describe("DonationPage (/donations/[code], DOS/Give#50)", () => {
  it("forbids search indexing", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it("shows status and the copyable tracking link to a guest holding the valid cookie, with no personal data", async () => {
    state.cookieMap.set("__Host-give_dn_GVABCDEFG", TOKEN)
    const html = renderToStaticMarkup(await DonationPage({ params: Promise.resolve({ code: "GVABCDEFG" }) }))

    expect(html).toContain("Bữa trưa cho em")
    expect(html).toContain("GVABCDEFG")
    expect(html).toContain("Đã nhận")
    expect(html).toContain("Tải thẻ “Tôi đã chung tay”")
    expect(html).toContain("Sao chép đường dẫn")
    expect(html).toContain("Lưu đường dẫn theo dõi")
    // Neither the SSR DOM attributes/text nor the DB select list exposes personal data or raw token.
    expect(html).not.toContain(TOKEN)
    for (const pii of ["Secret Donor", "donor@example.com", "Minh", "Private donor message"]) {
      expect(html).not.toContain(pii)
    }
    const contributionCall = state.serviceCalls.find((c) => c.target === "contributions")!
    const selected = String(op(contributionCall, "select")?.[0])
    for (const piiCol of ["guest_name", "guest_email", "public_name", "message", "is_anonymous"]) {
      expect(selected).not.toContain(piiCol)
    }
  })

  it("shows no guest tracking link to a signed-in donor viewing their own donation", async () => {
    state.session = { user: { id: USER, email: null, name: null }, accessToken: "jwt" }
    state.userHandler = (call) => (call.target === "contributions" ? { data: guestRow() } : undefined)
    const html = renderToStaticMarkup(await DonationPage({ params: Promise.resolve({ code: "GVABCDEFG" }) }))

    expect(html).toContain("Bữa trưa cho em")
    expect(html).not.toContain("Sao chép đường dẫn")
    expect(html).not.toContain("Lưu đường dẫn theo dõi")
  })

  it("returns 404 without rendering or minting a link for an unauthorized visitor, wrong token, or expired token", async () => {
    await expect(DonationPage({ params: Promise.resolve({ code: "GVABCDEFG" }) })).rejects.toThrow("NEXT_NOT_FOUND")

    state.cookieMap.set("__Host-give_dn_GVABCDEFG", "f".repeat(64))
    await expect(DonationPage({ params: Promise.resolve({ code: "GVABCDEFG" }) })).rejects.toThrow("NEXT_NOT_FOUND")

    state.cookieMap.set("__Host-give_dn_GVABCDEFG", TOKEN)
    state.serviceHandler = (call) =>
      call.target === "contributions"
        ? { data: guestRow({ status_token_expires_at: "2000-01-01T00:00:00.000Z" }) }
        : undefined
    await expect(DonationPage({ params: Promise.resolve({ code: "GVABCDEFG" }) })).rejects.toThrow("NEXT_NOT_FOUND")
  })
})

describe("DonationPage for a monthly plan's donation (DOS/Give#276)", () => {
  const PLAN = "44444444-4444-4444-8444-444444444444"
  // 10:00 on 20/11/2026 in Vietnam.
  const NOW = new Date("2026-11-20T03:00:00.000Z")

  function ownRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "33333333-3333-4333-8333-333333333333",
      campaign_id: CAMPAIGN,
      intended_amount: 200000,
      received_amount: 0,
      reference_code: "GVABCDEFG",
      status: "awaiting_transfer",
      // Days ago: a one-off donation's 24 hours would be over.
      created_at: "2026-11-05T01:00:00.000Z",
      plan_id: PLAN,
      plan_period: "2026-11-01",
      ...overrides,
    }
  }

  function setUp(row: Record<string, unknown>, campaign: Record<string, unknown> = {}) {
    state.session = { user: { id: USER, email: null, name: null }, accessToken: "jwt" }
    state.userHandler = (call) => (call.target === "contributions" ? { data: row } : undefined)
    const base = state.serviceHandler
    state.serviceHandler = (call) =>
      call.target === "campaigns"
        ? { data: { ...campaignRow(), ends_at: "2027-06-30T17:00:00.000Z", ...campaign } }
        : base(call)
  }

  async function render() {
    return renderToStaticMarkup(await DonationPage({ params: Promise.resolve({ code: "GVABCDEFG" }) }))
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows the QR for the whole month, the plan month and the new-code rule", async () => {
    setUp(ownRow())
    const html = await render()

    expect(html).toContain("Ủng hộ hằng tháng · tháng 11/2026")
    expect(html).toContain(NEW_CODE_EVERY_MONTH)
    expect(html).toContain('href="/me/contributions"')
    expect(html).toContain("0123456789")
    expect(html).toContain("Mã hiển thị tới hết ngày 30/11/2026.")
    const select = String(
      op(
        state.userCalls.find((c) => c.target === "contributions"),
        "select"
      )?.[0]
    )
    expect(select).toContain("plan_period")
  })

  it("stops the QR at the campaign's end when it comes before the month's end", async () => {
    setUp(ownRow(), { ends_at: "2026-11-25T10:00:00.000Z" })
    const html = await render()

    expect(html).toContain("0123456789")
    expect(html).toMatch(/Mã hiển thị tới 17:00,? 25\/11\/2026\./)
  })

  it("shows no payment details for a past month and points to the plan overview", async () => {
    setUp(ownRow({ plan_period: "2026-10-01", created_at: "2026-10-05T01:00:00.000Z" }))
    const html = await render()

    expect(html).toContain("Ủng hộ hằng tháng · tháng 10/2026")
    expect(html).toContain("Tháng 10/2026 đã qua nên Give không còn hiển thị mã QR của khoản này")
    // The plan may have stopped since: the next code is promised only while it is active.
    expect(html).toContain("Nếu kế hoạch ủng hộ hằng tháng của bạn còn hoạt động, mã của tháng mới")
    expect(html).toContain("Xem ủng hộ hằng tháng")
    expect(html).not.toContain("0123456789")
    for (const word of ["quá hạn", "nợ", "còn thiếu"]) expect(html).not.toContain(word)
  })

  it("keeps the 24-hour rule for a one-off donation", async () => {
    setUp(ownRow({ plan_id: null, plan_period: null }))
    const html = await render()

    expect(html).toContain("Ủng hộ chiến dịch")
    expect(html).not.toContain("Ủng hộ hằng tháng")
    expect(html).not.toContain(NEW_CODE_EVERY_MONTH)
    expect(html).toContain("Mã QR của khoản này đã hết hạn hiển thị")
    expect(html).not.toContain("0123456789")
  })

  it("shows the closed-campaign note instead of the QR when the campaign stopped taking donations", async () => {
    setUp(ownRow(), { status: "suspended" })
    const html = await render()

    expect(html).toContain("Chiến dịch hiện không nhận chuyển khoản")
    expect(html).not.toContain("0123456789")
    expect(html).not.toContain("Tải thẻ “Tôi đã chung tay”")
  })

  it("hides the thank-you card button while awaiting transfer and shows it once received (DOS/Give#313)", async () => {
    setUp(ownRow({ status: "awaiting_transfer", received_amount: 0 }))
    const awaitingHtml = await render()
    expect(awaitingHtml).not.toContain("Tải thẻ “Tôi đã chung tay”")

    setUp(ownRow({ status: "received", received_amount: 200000, public_name: "Nguyễn Minh", is_anonymous: false }))
    const receivedHtml = await render()
    expect(receivedHtml).toContain("Tải thẻ “Tôi đã chung tay”")
  })
})
