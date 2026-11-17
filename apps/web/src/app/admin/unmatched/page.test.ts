// @vitest-environment happy-dom
/**
 * Covers the "Tiền vào không thuộc chiến dịch nào" section of the
 * `/admin/unmatched` RSC (`AdminUnmatchedPage`) for DOS/Give#138: each
 * unattributed transaction shows why it was not given to a campaign, read
 * through give.bank_transaction_refusal_reasons, with a link to the campaign;
 * a database without the function, or a failing read, shows no reason and no
 * error; non-staff get a 404.
 */
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const FINANCE_USER = "11111111-1111-4111-8111-111111111111"
const TX_MISMATCH = "aaaaaaaa-0000-4000-8000-000000000001"
const TX_PLAIN = "aaaaaaaa-0000-4000-8000-000000000002"
const ACCOUNT = "bbbbbbbb-0000-4000-8000-000000000001"
const REFUSED_CAMPAIGN = "cccccccc-0000-4000-8000-000000000001"
const CLOSED_CAMPAIGN = "cccccccc-0000-4000-8000-000000000002"
const BINDING = "dddddddd-0000-4000-8000-000000000001"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  session: null as { user: { id: string; email: string | null; name: string | null }; accessToken: string } | null,
}))

const notFoundMock = vi.hoisted(() =>
  vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND")
  })
)

const requireSessionMock = vi.hoisted(() =>
  vi.fn(async (_next?: string) => {
    if (!state.session) throw new Error("NEXT_REDIRECT:/auth/login")
    return state.session
  })
)

const dbAsMock = vi.hoisted(() => vi.fn((_token?: string) => fakeDb((call) => state.handler(call), state.calls)))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: vi.fn(),
  usePathname: () => "/admin/unmatched",
}))
vi.mock("@/lib/auth/session", () => ({
  requireSession: requireSessionMock,
  getSession: vi.fn(async () => state.session),
}))
vi.mock("@/lib/supabase", () => ({ dbAs: dbAsMock }))
vi.mock("./actions", () => ({
  correctExplanation: vi.fn(async () => null),
  explainTransaction: vi.fn(async () => null),
  linkReturnedTransfer: vi.fn(async () => null),
  returnToUnmatched: vi.fn(async () => null),
}))
vi.mock("@/app/me/campaigns/[id]/unmatched/actions", () => ({ matchTransaction: vi.fn(async () => null) }))

const { default: AdminUnmatchedPage } = await import("./page")

function unattributedRow(id: string, providerTxId: string) {
  return {
    id,
    receiving_account_id: ACCOUNT,
    provider_tx_id: providerTxId,
    amount: "300000",
    booked_at: "2026-11-16T02:00:00.000Z",
    booked_date_only: false,
    description: "CHUYEN TIEN",
    counterparty_name: "NGUYEN VAN A",
    counterparty_account_masked: "****1234",
    source: "statement_import",
  }
}

const MISMATCH_ROW = {
  bank_transaction_id: TX_MISMATCH,
  action: "bank_transaction.account_owner_mismatch",
  campaign_id: REFUSED_CAMPAIGN,
  binding_id: BINDING,
  created_at: "2026-11-16T02:00:01.000Z",
}

/** Every read answers empty except the staff check, the unattributed list and what `extra` answers. */
function handlerWith(extra: Handler): Handler {
  return (call) => {
    const answer = extra(call)
    if (answer) return answer
    if (call.target === "rpc:is_admin") return { data: true }
    if (call.target === "bank_transactions" && call.ops.some(([n, col]) => n === "is" && col === "campaign_id")) {
      return { data: [unattributedRow(TX_MISMATCH, "FT-MISMATCH"), unattributedRow(TX_PLAIN, "FT-PLAIN")], count: 2 }
    }
    return { data: [], count: 0 }
  }
}

function unattributedSection(html: string) {
  const win = new Window()
  win.document.body.innerHTML = html
  const section = win.document.querySelector('section[aria-labelledby="unattributed"]')
  if (!section) throw new Error("no #unattributed section")
  const rows = [...section.querySelectorAll("li")]
  const row = (providerTxId: string) => rows.find((li) => li.textContent?.includes(providerTxId))
  return { section, row }
}

beforeEach(() => {
  notFoundMock.mockClear()
  requireSessionMock.mockClear()
  dbAsMock.mockClear()
  state.calls.length = 0
  state.session = {
    user: { id: FINANCE_USER, email: "tai.chinh@give.vn", name: "Tài chính" },
    accessToken: "finance-access-token",
  }
})

describe("AdminUnmatchedPage: refusal reasons of unattributed transactions (DOS/Give#138)", () => {
  it("404s a signed-in user without a finance or admin role and never reads the reasons", async () => {
    state.handler = (call) => (call.target === "rpc:is_admin" ? { data: false } : { data: [] })
    await expect(AdminUnmatchedPage()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(requireSessionMock).toHaveBeenCalledWith("/admin/unmatched")
    expect(op(state.calls[0], "args")?.[0]).toEqual({ p_roles: FINANCE_ROLES })
    expect(state.calls.some((c) => c.target === "rpc:bank_transaction_refusal_reasons")).toBe(false)
  })

  it("shows the account-owner reason with a link to the refused campaign, and no reason on a row without one", async () => {
    state.handler = handlerWith((call) => {
      if (call.target === "rpc:bank_transaction_refusal_reasons") return { data: [MISMATCH_ROW] }
      if (
        call.target === "campaigns" &&
        JSON.stringify(op(call, "in")) === JSON.stringify(["id", [REFUSED_CAMPAIGN]])
      ) {
        return { data: [{ id: REFUSED_CAMPAIGN, slug: "quy-bi-tu-choi", title: "Quỹ bị từ chối", status: "live" }] }
      }
      return undefined
    })

    const { row } = unattributedSection(renderToStaticMarkup(await AdminUnmatchedPage()))

    // Read with the finance user's own token, for exactly the listed transactions.
    expect(dbAsMock).toHaveBeenCalledWith("finance-access-token")
    const rpc = state.calls.filter((c) => c.target === "rpc:bank_transaction_refusal_reasons")
    expect(rpc).toHaveLength(1)
    expect(op(rpc[0], "args")?.[0]).toEqual({ p_bank_transaction_ids: [TX_MISMATCH, TX_PLAIN] })

    const mismatch = row("FT-MISMATCH")
    expect(mismatch?.textContent).toContain("Lý do: Tài khoản nhận không thuộc người tổ chức chiến dịch.")
    const link = mismatch?.querySelector('a[href="/campaigns/quy-bi-tu-choi"]')
    expect(link?.textContent).toBe("Quỹ bị từ chối")
    expect(link?.getAttribute("target")).toBe("_blank")

    const plain = row("FT-PLAIN")
    expect(plain).toBeDefined()
    expect(plain?.textContent).not.toContain("Lý do:")
    expect(plain?.querySelector("a")).toBeNull()
  })

  it("words the after-close reason, and names the campaign by id when its title cannot be read", async () => {
    state.handler = handlerWith((call) => {
      if (call.target === "rpc:bank_transaction_refusal_reasons") {
        return {
          data: [
            {
              bank_transaction_id: TX_PLAIN,
              action: "bank_transaction.after_close",
              campaign_id: CLOSED_CAMPAIGN,
              binding_id: null,
              created_at: "2026-11-16T02:00:01.000Z",
            },
          ],
        }
      }
      if (call.target === "campaigns" && JSON.stringify(op(call, "in")) === JSON.stringify(["id", [CLOSED_CAMPAIGN]])) {
        return { error: { code: "PGRST301", message: "JWT expired" } }
      }
      return undefined
    })
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    const { row } = unattributedSection(renderToStaticMarkup(await AdminUnmatchedPage()))

    const late = row("FT-PLAIN")
    expect(late?.textContent).toContain("Lý do: Chiến dịch đã đóng khi tiền về.")
    expect(late?.textContent).toContain(CLOSED_CAMPAIGN)
    expect(late?.querySelector("a")).toBeNull()
    expect(row("FT-MISMATCH")?.textContent).not.toContain("Lý do:")
    expect(consoleError).toHaveBeenCalledWith("refused campaign refs failed", "PGRST301", "JWT expired")
    consoleError.mockRestore()
  })

  it.each([
    [
      "the database does not have the function yet",
      { code: "PGRST202", message: "Could not find the function" },
      false,
    ],
    ["the read fails", { code: "PGRST301", message: "JWT expired" }, true],
  ])("shows the list without any reason or error when %s", async (_case, error, logged) => {
    state.handler = handlerWith((call) =>
      call.target === "rpc:bank_transaction_refusal_reasons" ? { error } : undefined
    )
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    const { section, row } = unattributedSection(renderToStaticMarkup(await AdminUnmatchedPage()))

    expect(row("FT-MISMATCH")).toBeDefined()
    expect(row("FT-PLAIN")).toBeDefined()
    expect(section.textContent).not.toContain("Lý do:")
    expect(section.textContent).not.toContain("Chưa tải được danh sách này.")
    expect(consoleError.mock.calls.some(([msg]) => msg === "bank_transaction_refusal_reasons failed")).toBe(logged)
    consoleError.mockRestore()
  })
})
