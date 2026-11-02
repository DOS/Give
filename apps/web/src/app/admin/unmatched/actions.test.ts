import { revalidatePath } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler, type Result } from "@/test/fake-db"

const FINANCE = "66666666-6666-4666-8666-666666666666"
const ORGANIZER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TX = "77777777-7777-4777-8777-777777777777"

const state = vi.hoisted(() => ({
  userId: "66666666-6666-4666-8666-666666666666",
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

const { explainTransaction } = await import("./actions")

/** formatVnd puts a no-break space before the đồng sign. */
const vnd = (text: string) => text.replace(/ ₫/g, " ₫")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const VALID = {
  kind: "organizer_top_up",
  reason: "  Organizer topped up from their own account  ",
  evidence: "Statement line of 2026-10-30, sender is the organizer",
}

const tx = (extra: Record<string, unknown> = {}) => ({
  data: {
    id: TX,
    campaign_id: CAMPAIGN,
    receiving_account_id: "33333333-3333-4333-8333-333333333333",
    provider_tx_id: "FT26306",
    direction: "in",
    amount: 300000,
    booked_at: "2026-10-30T02:00:00Z",
    booked_date_only: false,
    description: "NAP THEM",
    counterparty_name: "HOANG VAN GIAI",
    counterparty_account_masked: "****6789",
    source: "statement_import",
    after_close: true,
    transaction_matches: null,
    inbound_explanations: null,
    ...extra,
  },
})

/** received 500k, unmatched_in 300k; then the reversal and the other_in post. */
const BEFORE = [
  { bucket: "received", amount: 500000 },
  { bucket: "unmatched_in", amount: 300000 },
]
const AFTER = [...BEFORE, { bucket: "unmatched_in", amount: -300000 }, { bucket: "other_in", amount: 300000 }]

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear()
  state.userId = FINANCE
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.responses = {
    "rpc:is_admin": { data: true },
    bank_transactions: tx(),
    "rpc:managed_campaigns": { data: { id: CAMPAIGN, slug: "chau-be-abcde", organizer_id: ORGANIZER } },
  }
  state.ledger = [{ data: BEFORE }, { data: AFTER }]
  state.serviceHandler = () => ({ data: "explained" })
})

describe("explainTransaction", () => {
  it("explains as finance staff and shows that the paid total did not move", async () => {
    const result = await explainTransaction(TX, null, form(VALID))

    expect(result).toEqual({
      ok: true,
      message: vnd(
        'Đã giải trình giao dịch 300.000 ₫ là "Người tổ chức nạp thêm tiền". Giao dịch không còn chặn việc nhả tài khoản nhận. Tổng đã thanh toán không đổi: 800.000 ₫ (chưa khớp 300.000 ₫ → 0 ₫, không phải tiền ủng hộ 0 ₫ → 300.000 ₫).'
      ),
    })
    expect(state.serviceCalls[0].target).toBe("rpc:explain_inbound_transaction")
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_bank_transaction_id: TX,
        p_actor_id: FINANCE,
        p_kind: "organizer_top_up",
        p_reason: "Organizer topped up from their own account",
        p_evidence: "Statement line of 2026-10-30, sender is the organizer",
      },
    ])
    // The role and the transaction are read with the actor's own token before the service role acts.
    expect(state.userCalls.map((c) => c.target)).toEqual([
      "rpc:is_admin",
      "bank_transactions",
      "rpc:managed_campaigns",
      "ledger_entries",
      "ledger_entries",
    ])
    expect(op(state.userCalls[0], "args")?.[0]).toEqual({ p_roles: ["finance", "admin"] })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/unmatched")
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/chau-be-abcde/statement")
  })

  it("refuses anyone who is not finance or admin staff, the organizer included", async () => {
    state.userId = ORGANIZER
    state.responses["rpc:is_admin"] = { data: false }
    const result = await explainTransaction(TX, null, form(VALID))
    expect(result).toEqual({
      ok: false,
      message: "Chỉ nhân viên tài chính hoặc quản trị viên mới giải trình được tiền vào.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("checks the form before reading anything", async () => {
    expect((await explainTransaction(TX, null, form({ ...VALID, kind: "donation" })))?.message).toBe(
      "Chọn loại khoản tiền."
    )
    expect((await explainTransaction(TX, null, form({ ...VALID, reason: "   " })))?.message).toContain("Ghi lý do")
    expect((await explainTransaction(TX, null, form({ ...VALID, evidence: "" })))?.message).toContain("Ghi bằng chứng")
    expect((await explainTransaction(TX, null, form({ ...VALID, evidence: "x".repeat(1001) })))?.message).toContain(
      "tối đa 1000 ký tự"
    )
    expect((await explainTransaction("x", null, form(VALID)))?.ok).toBe(false)
    expect(state.userCalls).toHaveLength(0)
  })

  it("refuses outgoing, unattributed, unknown and matched transactions without calling the database", async () => {
    state.responses.bank_transactions = tx({ direction: "out" })
    expect((await explainTransaction(TX, null, form(VALID)))?.message).toContain(
      "Chỉ giải trình được các khoản tiền vào"
    )
    state.responses.bank_transactions = tx({ campaign_id: null })
    expect((await explainTransaction(TX, null, form(VALID)))?.message).toContain("chưa thuộc chiến dịch nào")
    state.responses.bank_transactions = { data: null }
    expect((await explainTransaction(TX, null, form(VALID)))?.message).toBe(
      "Không tìm thấy giao dịch, hoặc bạn không có quyền với giao dịch này."
    )
    state.responses.bank_transactions = tx({ transaction_matches: { contribution_id: "c" } })
    expect((await explainTransaction(TX, null, form(VALID)))?.message).toContain("đã được khớp với một lượt ủng hộ")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("words the database's refusals", async () => {
    state.serviceHandler = () => ({ error: { code: "23505", message: "GIVE_TRANSACTION_ALREADY_EXPLAINED" } })
    expect((await explainTransaction(TX, null, form(VALID)))?.message).toContain("đã được giải trình với nội dung khác")
    state.ledger = [{ data: BEFORE }]
    state.serviceHandler = () => ({ error: { code: "42501", message: "GIVE_NOT_ALLOWED" } })
    expect((await explainTransaction(TX, null, form(VALID)))?.message).toContain("Chỉ nhân viên tài chính")
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("explains a closed campaign's late transfer and still answers when the totals cannot be re-read", async () => {
    state.ledger = [{ data: BEFORE }, { error: { code: "57014", message: "timeout" } }]
    const result = await explainTransaction(TX, null, form({ ...VALID, kind: "bank_adjustment" }))
    expect(result).toEqual({
      ok: true,
      message: vnd(
        'Đã giải trình giao dịch 300.000 ₫ là "Ngân hàng hoàn phí hoặc điều chỉnh". Giao dịch không còn chặn việc nhả tài khoản nhận.'
      ),
    })
  })
})
