import { revalidatePath } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler, type Result } from "@/test/fake-db"

const ORGANIZER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TX = "77777777-7777-4777-8777-777777777777"
const CONTRIBUTION = "88888888-8888-4888-8888-888888888888"
const OTHER = "99999999-9999-4999-8999-999999999999"

const state = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  responses: {} as Record<string, Result>,
  ledger: [] as Result[],
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: state.userId, email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () =>
    fakeDb(
      (call) => (call.target === "ledger_entries" ? state.ledger.shift() : state.responses[call.target]),
      state.userCalls
    ),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { matchTransaction } = await import("./actions")

/** formatVnd puts a no-break space before the đồng sign. */
const vnd = (text: string) => text.replace(/ ₫/g, " ₫")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const tx = (matches: unknown = null) => ({
  data: {
    id: TX,
    campaign_id: CAMPAIGN,
    receiving_account_id: "33333333-3333-4333-8333-333333333333",
    provider_tx_id: "FT26305",
    direction: "in",
    amount: 200000,
    booked_at: "2026-10-30T02:00:00Z",
    booked_date_only: false,
    description: "UNG HO CHAU BE",
    counterparty_name: "NGUYEN VAN A",
    counterparty_account_masked: "****6789",
    source: "statement_import",
    after_close: false,
    transaction_matches: matches,
  },
})

const contribution = (overrides: Record<string, unknown> = {}) => ({
  data: {
    id: CONTRIBUTION,
    kind: "donation",
    reference_code: "GV7K2M9QX",
    intended_amount: 200000,
    received_amount: 0,
    status: "awaiting_transfer",
    public_name: null,
    guest_name: "Nguyễn Văn A",
    is_anonymous: false,
    created_at: "2026-10-30T01:00:00Z",
    ...overrides,
  },
})

/** received 500k, unmatched_in 200k, before and after the reversal + post. */
const BEFORE = [
  { bucket: "received", amount: 500000 },
  { bucket: "unmatched_in", amount: 200000 },
]
const AFTER = [...BEFORE, { bucket: "unmatched_in", amount: -200000 }, { bucket: "received", amount: 200000 }]

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear()
  state.userId = ORGANIZER
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.responses = {
    bank_transactions: tx(),
    "rpc:managed_campaigns": { data: { id: CAMPAIGN, slug: "chau-be-abcde", organizer_id: ORGANIZER } },
    contributions: contribution(),
    "rpc:is_admin": { data: false },
  }
  state.ledger = [{ data: BEFORE }, { data: AFTER }]
  state.serviceHandler = () => ({ data: { outcome: "matched", contribution_id: CONTRIBUTION } })
})

describe("matchTransaction", () => {
  it("matches as the organizer and shows that the paid total did not move (test 14)", async () => {
    const result = await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION }))

    expect(result).toEqual({
      ok: true,
      message: vnd(
        "Đã khớp giao dịch 200.000 ₫ với lượt ủng hộ GV7K2M9QX. Tổng đã thanh toán không đổi: 700.000 ₫ (đã khớp 500.000 ₫ → 700.000 ₫, chưa khớp 200.000 ₫ → 0 ₫)."
      ),
    })
    expect(op(state.serviceCalls[0], "args")).toEqual([
      { p_bank_transaction_id: TX, p_contribution_id: CONTRIBUTION, p_actor_id: ORGANIZER },
    ])
    // Everything is read with the actor's own token before the service role acts.
    expect(state.userCalls.map((c) => c.target)).toEqual([
      "bank_transactions",
      "rpc:managed_campaigns",
      "contributions",
      "ledger_entries",
      "ledger_entries",
    ])
    expect(op(state.userCalls[2], "eq")).toEqual(["campaign_id", CAMPAIGN])
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/chau-be-abcde/statement")
  })

  it("finds the contribution by a typed reference code", async () => {
    const result = await matchTransaction(TX, null, form({ reference_code: " gv7k 2m9qx " }))
    expect(result?.ok).toBe(true)
    const lookup = state.userCalls.find((c) => c.target === "contributions")
    expect(lookup?.ops.filter(([name]) => name === "eq")).toEqual([
      ["eq", "campaign_id", CAMPAIGN],
      ["eq", "reference_code", "GV7K2M9QX"],
    ])
  })

  it("refuses a second match to another contribution without calling the database", async () => {
    state.responses.bank_transactions = tx({ contribution_id: OTHER })
    const result = await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION }))
    expect(result).toEqual({
      ok: false,
      message: "Giao dịch này đã được khớp với một lượt ủng hộ khác. Mỗi giao dịch chỉ được khớp một lần.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("words the database's refusal of a second match", async () => {
    state.serviceHandler = () => ({ error: { code: "23505", message: "GIVE_TRANSACTION_ALREADY_MATCHED" } })
    const result = await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION }))
    expect(result?.message).toContain("Mỗi giao dịch chỉ được khớp một lần")
  })

  it("treats the same match again as done", async () => {
    state.responses.bank_transactions = tx([{ contribution_id: CONTRIBUTION }])
    const result = await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION }))
    expect(result).toEqual({ ok: true, message: "Giao dịch đã được khớp với lượt ủng hộ GV7K2M9QX từ trước." })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("lets finance staff match another organizer's transaction", async () => {
    state.userId = "66666666-6666-4666-8666-666666666666"
    state.responses["rpc:is_admin"] = { data: true }
    const result = await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION }))
    expect(result?.ok).toBe(true)
    expect(op(state.serviceCalls[0], "args")?.[0]).toMatchObject({ p_actor_id: state.userId })
  })

  it("refuses someone who neither organizes the campaign nor is finance staff", async () => {
    state.userId = "44444444-4444-4444-8444-444444444444"
    const result = await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION }))
    expect(result?.message).toBe("Không tìm thấy giao dịch, hoặc bạn không có quyền với giao dịch này.")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses contributions that cannot take money and ones of other campaigns", async () => {
    state.responses.contributions = contribution({ status: "refunded" })
    expect((await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION })))?.message).toContain(
      "không nhận thêm tiền được"
    )
    state.responses.contributions = { data: null }
    expect((await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION })))?.message).toBe(
      "Không tìm thấy lượt ủng hộ này trong chiến dịch của giao dịch."
    )
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("checks the form before reading anything", async () => {
    expect((await matchTransaction(TX, null, form({})))?.ok).toBe(false)
    expect(
      (await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION, reference_code: "GV7K2M9QX" })))?.ok
    ).toBe(false)
    expect((await matchTransaction(TX, null, form({ reference_code: "ABC" })))?.message).toContain(
      "không phải mã ủng hộ hợp lệ"
    )
    expect((await matchTransaction("x", null, form({ contribution_id: CONTRIBUTION })))?.ok).toBe(false)
    expect(state.userCalls).toHaveLength(0)
  })

  it("refuses outgoing and unattributed transactions", async () => {
    state.responses.bank_transactions = { data: { ...tx().data, direction: "out" } }
    expect((await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION })))?.ok).toBe(false)
    state.responses.bank_transactions = { data: { ...tx().data, campaign_id: null } }
    expect((await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION })))?.message).toContain(
      "chưa thuộc chiến dịch nào"
    )
    expect(state.serviceCalls).toHaveLength(0)
  })
})
