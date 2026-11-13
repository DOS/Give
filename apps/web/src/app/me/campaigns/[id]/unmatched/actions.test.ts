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
      (call) => (call.target === "rpc:campaign_paid" ? state.ledger.shift() : state.responses[call.target]),
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

/** give.campaign_paid: received 500k, unmatched 200k, before and after the match. */
const BEFORE = { received_amount: 500000, unmatched_amount: 200000, other_amount: 0, paid_amount: 700000 }
const AFTER = { received_amount: 700000, unmatched_amount: 0, other_amount: 0, paid_amount: 700000 }

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
      "rpc:campaign_paid",
      "rpc:campaign_paid",
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
    expect((await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION })))?.message).toBe(
      "Chỉ khớp được các khoản tiền vào."
    )
    state.responses.bank_transactions = { data: { ...tx().data, campaign_id: null } }
    // Both causes of a transaction with no campaign (DOS/Give#148).
    expect((await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION })))?.message).toBe(
      "Giao dịch này không thuộc chiến dịch nào, nên không khớp được. Lý do có thể là: khoản chuyển thử để xác minh tài khoản; tiền vào khi tài khoản chưa gắn với chiến dịch nào hoặc trước khi chiến dịch gửi duyệt; tiền vào sau khi tài khoản được nhả, hoặc được ghi nhận khi tài khoản đã được nhả (ví dụ sao kê nhập muộn); hoặc tài khoản không thuộc về người tổ chức của chiến dịch được gắn."
    )
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a transaction explained as not a donation (DOS/Give#49)", async () => {
    state.responses.bank_transactions = { data: { ...tx().data, inbound_explanations: { kind: "organizer_top_up" } } }
    expect((await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION })))?.message).toContain(
      "không phải tiền ủng hộ"
    )
    expect(state.serviceCalls).toHaveLength(0)

    // Explained meanwhile: the database refuses, and the message says why.
    state.responses.bank_transactions = tx()
    state.serviceHandler = () => ({ error: { code: "23505", message: "GIVE_TRANSACTION_EXPLAINED" } })
    expect((await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION })))?.message).toContain(
      "không khớp được nữa"
    )
  })

  it("says why when the account's owner is not the campaign's organizer (DOS/Give#136)", async () => {
    const happened =
      "Tài khoản nhận khoản tiền này không thuộc về người tổ chức của chiến dịch, nên giao dịch không khớp được."
    state.serviceHandler = () => ({ error: { code: "23514", message: "GIVE_ACCOUNT_OWNER_MISMATCH" } })
    const result = await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION }))
    expect(result).toEqual({
      ok: false,
      message: `${happened} Hãy liên hệ đội ngũ Give để kiểm tra lại tài khoản nhận và chiến dịch.`,
    })
    expect(result?.message).not.toContain("GIVE_")
    expect(state.serviceCalls).toHaveLength(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("sends finance staff to an admin for the same refusal (DOS/Give#136)", async () => {
    state.userId = OTHER
    state.responses["rpc:is_admin"] = { data: true }
    state.serviceHandler = () => ({ error: { code: "23514", message: "GIVE_ACCOUNT_OWNER_MISMATCH" } })
    const result = await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION }))
    expect(result).toEqual({
      ok: false,
      message:
        "Tài khoản nhận khoản tiền này không thuộc về người tổ chức của chiến dịch, nên giao dịch không khớp được. Hãy báo quản trị viên kiểm tra lại tài khoản nhận và người tổ chức của chiến dịch trước khi xử lý giao dịch này.",
    })
    expect(result?.message).not.toContain("GIVE_")
    expect(state.serviceCalls).toHaveLength(1)
    expect(revalidatePath).not.toHaveBeenCalled()

    // The other refusals read the same for staff as for the organizer.
    state.serviceHandler = () => ({ error: { code: "23505", message: "GIVE_TRANSACTION_ALREADY_MATCHED" } })
    expect((await matchTransaction(TX, null, form({ contribution_id: CONTRIBUTION })))?.message).toContain(
      "Mỗi giao dịch chỉ được khớp một lần"
    )
  })
})
