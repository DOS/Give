import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

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
