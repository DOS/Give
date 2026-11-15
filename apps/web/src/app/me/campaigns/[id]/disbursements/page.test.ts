import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const PENDING = "33333333-3333-4333-8333-333333333333"
const RETURNED = "44444444-4444-4444-8444-444444444444"
const EXPLAINED = "55555555-5555-4555-8555-555555555555"

const state = vi.hoisted(() => ({ handler: (() => undefined) as Handler, calls: [] as Call[] }))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: USER, email: null, name: null }, accessToken: "token" })),
  requireSession: vi.fn(async () => ({
    user: { id: USER, email: "To.Chuc@Example.vn", name: null },
    accessToken: "token",
  })),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.handler(call), state.calls),
  dbService: () => fakeDb(() => undefined),
  MEDIA_BUCKET: "give-media",
}))

const { default: DisbursementsPage } = await import("./page")

const campaign = { id: CAMPAIGN, organizer_id: USER, slug: "quy-a", title: "Quỹ A", status: "live" }

const tx = (id: string, amount: number, booked_at: string) => ({
  id,
  campaign_id: CAMPAIGN,
  amount,
  asset: "VND",
  booked_at,
  booked_date_only: false,
  description: null,
  counterparty_name: `Người nhận ${id.slice(0, 4)}`,
  counterparty_account_masked: null,
})

const link = { linked_at: "2026-11-12T03:00:00Z", back: { amount: "289000", booked_at: "2026-11-10T03:00:00Z" } }

/** The campaign, its unexplained transfers and its explained ones, as the organizer reads them. */
function handler({ unexplained = [] as unknown[], explained = [] as unknown[] } = {}): Handler {
  return (call) => {
    if (call.target === "rpc:managed_campaigns") return { data: campaign }
    if (call.target === "bank_transactions") {
      const select = String(op(call, "select")?.[0])
      return { data: select.includes("disbursements!inner") ? explained : unexplained }
    }
    return { data: [] }
  }
}

async function render(): Promise<string> {
  const page = await DisbursementsPage({ params: Promise.resolve({ id: CAMPAIGN }) })
  return renderToStaticMarkup(page).replace(/ /g, " ")
}

/** The <li> card of one transaction, by its counterparty name. */
function card(html: string, id: string): string {
  const name = `Người nhận ${id.slice(0, 4)}`
  const start = html.lastIndexOf("<li", html.indexOf(name))
  return html.slice(start, html.indexOf("</li>", html.indexOf(name)) + 5)
}

/** The <section> with this heading id. */
function section(html: string, headingId: string): string {
  const at = html.indexOf(`id="${headingId}"`)
  if (at < 0) return ""
  return html.slice(html.lastIndexOf("<section", at), html.indexOf("</section>", at))
}

beforeEach(() => {
  state.calls.length = 0
  state.handler = handler({
    unexplained: [
      { ...tx(PENDING, 100_000, "2026-11-01T02:00:00Z"), disbursements: null, own_out: null, returned: null },
      { ...tx(RETURNED, 300_000, "2026-11-02T02:00:00Z"), disbursements: null, own_out: null, returned: link },
    ],
    explained: [
      {
        ...tx(EXPLAINED, 500_000, "2026-11-03T02:00:00Z"),
        disbursement: {
          purpose: "Mua sách",
          category: "goods",
          recipient: null,
          is_refund: false,
          refund_contribution_id: null,
          explained_at: "2026-11-04T02:00:00Z",
          evidence: [],
        },
        returned: { linked_at: "2026-11-12T03:00:00Z", back: { amount: 500_000, booked_at: "2026-11-11T03:00:00Z" } },
      },
    ],
  })
})

describe("disbursements page: transfers a bank returned (DOS/Give#194)", () => {
  it("marks a returned, unexplained transfer with the return day and never offers to explain it", async () => {
    const html = await render()
    const returned = section(html, "returned-heading")
    expect(returned).toContain("Bị ngân hàng trả lại")
    const row = card(html, RETURNED)
    expect(returned).toContain(row)
    expect(row).toContain('data-notice="returned"')
    expect(row).toContain('role="note"')
    expect(row).toContain("Give sẽ xử lý khoản này")
    expect(row).toContain("Ngân hàng đã trả lại +289.000 ₫ ngày 10/11/2026 và giữ 11.000 ₫ phí ngân hàng")
    // No explain form, no overdue reminder.
    expect(row).not.toContain("Gửi giải trình")
    expect(row).not.toContain("<form")
    expect(row).not.toContain("hãy giải trình ngay")
  })

  it("counts only what is still to explain under Chưa giải trình", async () => {
    const html = await render()
    const pending = section(html, "pending-heading")
    expect(pending).toContain(card(html, PENDING))
    expect(pending).not.toContain(`Người nhận ${RETURNED.slice(0, 4)}`)
    // The heading's badge counts one transaction, not two.
    expect(pending).toMatch(/Chưa giải trình<span[^>]*>1<\/span>/)
    expect(pending.match(/Gửi giải trình/g)).toHaveLength(1)
  })

  it("keeps the marker on an explained transfer the bank returned", async () => {
    const row = card(await render(), EXPLAINED)
    expect(row).toContain('data-notice="returned"')
    expect(row).toContain("Bị ngân hàng trả lại")
    expect(row).toContain("Ngân hàng đã trả lại +500.000 ₫ ngày 11/11/2026")
  })

  it("shows no returned section when nothing was returned", async () => {
    state.handler = handler({
      unexplained: [{ ...tx(PENDING, 100_000, "2026-11-01T02:00:00Z"), disbursements: null, returned: null }],
    })
    const html = await render()
    expect(section(html, "returned-heading")).toBe("")
    expect(html).not.toContain('data-notice="returned"')
    expect(section(html, "pending-heading")).toMatch(/Chưa giải trình<span[^>]*>1<\/span>/)
  })
})

describe("disbursements page: the organizer's own contributions (DOS/Give#199)", () => {
  it("leaves the organizer's own contributions out of the refund picker and says why", async () => {
    const base = handler({
      unexplained: [{ ...tx(PENDING, 100_000, "2026-11-01T02:00:00Z"), disbursements: null, returned: null }],
    })
    state.handler = (call) =>
      call.target === "contributions"
        ? {
            data: [
              {
                id: "c1",
                kind: "donation",
                reference_code: "GVMINE001",
                public_name: "Tôi",
                is_anonymous: false,
                received_amount: 100_000,
                contributor_user_id: USER,
                guest_email: null,
              },
              {
                id: "c2",
                kind: "donation",
                reference_code: "GVMINE002",
                public_name: null,
                is_anonymous: true,
                received_amount: 100_000,
                contributor_user_id: null,
                guest_email: " to.chuc@EXAMPLE.vn ",
              },
              {
                id: "c3",
                kind: "donation",
                reference_code: "GVLAN0003",
                public_name: "Lan",
                is_anonymous: false,
                received_amount: 100_000,
                contributor_user_id: null,
                guest_email: "lan@example.vn",
              },
            ],
          }
        : base(call)
    const html = await render()
    expect(html).toContain("GVLAN0003")
    expect(html).not.toContain("GVMINE001")
    expect(html).not.toContain("GVMINE002")
    // The guest email is read only to filter: it never reaches the page.
    expect(html).not.toContain("lan@example.vn")
    expect(html).toContain(
      "Lượt ủng hộ của chính bạn (lượt bạn ủng hộ khi đăng nhập, hoặc khi không đăng nhập nhưng dùng email của bạn) không có trong danh sách"
    )
  })
})
