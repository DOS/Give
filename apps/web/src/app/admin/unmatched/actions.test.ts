import { revalidatePath } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler, type Result } from "@/test/fake-db"

const FINANCE = "66666666-6666-4666-8666-666666666666"
const ORGANIZER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TX = "77777777-7777-4777-8777-777777777777"
const CONTRIBUTION = "44444444-4444-4444-8444-444444444444"

const state = vi.hoisted(() => ({
  userId: "66666666-6666-4666-8666-666666666666",
  responses: {} as Record<string, Result | Handler>,
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
    fakeDb((call) => {
      if (call.target === "rpc:campaign_paid") return state.ledger.shift()
      const response = state.responses[call.target]
      return typeof response === "function" ? (response as Handler)(call) : response
    }, state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { correctExplanation, explainTransaction, linkReturnedTransfer } = await import("./actions")

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

/** give.campaign_paid: received 500k, unmatched 300k; then the 300k moves to other_in. */
const BEFORE = { received_amount: 500000, unmatched_amount: 300000, other_amount: 0, paid_amount: 800000 }
const AFTER = { received_amount: 500000, unmatched_amount: 0, other_amount: 300000, paid_amount: 800000 }

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
      "rpc:campaign_paid",
      "rpc:campaign_paid",
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

  it("counts a line break the browser sends as CRLF as one character", async () => {
    // Line breaks arrive as CRLF and count as one character each.
    expect(
      (await explainTransaction(TX, null, form({ ...VALID, reason: "a\r\n".repeat(400) + "x".repeat(199) })))?.message
    ).not.toContain("tối đa")
  })

  it("refuses outgoing, unattributed, unknown and matched transactions without calling the database", async () => {
    state.responses.bank_transactions = tx({ direction: "out" })
    expect((await explainTransaction(TX, null, form(VALID)))?.message).toContain(
      "Chỉ giải trình được các khoản tiền vào"
    )
    state.responses.bank_transactions = tx({ campaign_id: null })
    expect((await explainTransaction(TX, null, form(VALID)))?.message).toBe(
      "Giao dịch này không thuộc chiến dịch nào, nên không cần giải trình. Lý do có thể là: khoản chuyển thử để xác minh tài khoản; tiền vào khi tài khoản chưa gắn với chiến dịch nào hoặc khi chiến dịch chưa gửi duyệt; tiền vào tài khoản cũ sau khi chiến dịch đã đổi sang tài khoản khác; tiền vào sau khi tài khoản được nhả, hoặc tiền vào trước đó nhưng đến khi tài khoản đã được nhả mới được ghi nhận (ví dụ sao kê nhập muộn); hoặc tài khoản không thuộc về người tổ chức của chiến dịch được gắn."
    )
    state.responses.bank_transactions = { data: null }
    expect((await explainTransaction(TX, null, form(VALID)))?.message).toBe(
      "Không tìm thấy giao dịch, hoặc bạn không có quyền với giao dịch này."
    )
    state.responses.bank_transactions = tx({ transaction_matches: { contribution_id: "c" } })
    expect((await explainTransaction(TX, null, form(VALID)))?.message).toContain("đã được khớp với một lượt ủng hộ")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a transaction linked as returned money since the page loaded (DOS/Give#72)", async () => {
    state.responses.bank_transactions = tx({ returned_transfers: [{ original_transaction_id: "o1" }] })
    expect((await explainTransaction(TX, null, form(VALID)))?.message).toBe(
      "Giao dịch này đã được ghi nhận là tiền bị ngân hàng trả lại, nên không giải trình được nữa. Hãy tải lại trang."
    )
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

describe("explainTransaction replay and correction (DOS/Give#71)", () => {
  it("still answers an already-explained transaction's same-value retry as done", async () => {
    // Explained before, not corrected: the database answers the identical retry with 'explained' again.
    state.responses.bank_transactions = tx({ inbound_explanations: { kind: "organizer_top_up" } })
    state.ledger = [{ data: AFTER }, { data: AFTER }]
    const result = await explainTransaction(TX, null, form(VALID))
    expect(result?.ok).toBe(true)
    expect(result?.message).toContain("Đã giải trình giao dịch 300.000")
    expect(state.serviceCalls.map((c) => c.target)).toEqual(["rpc:explain_inbound_transaction"])
  })

  it("does not trust the explain replay once the explanation was corrected: the money is matched", async () => {
    state.responses.bank_transactions = tx({
      transaction_matches: { contribution_id: CONTRIBUTION },
      inbound_explanations: {
        kind: "organizer_top_up",
        inbound_explanation_corrections: { contribution_id: CONTRIBUTION },
      },
    })
    expect((await explainTransaction(TX, null, form(VALID)))?.message).toContain("đã được khớp với một lượt ủng hộ")
    expect(state.serviceCalls).toHaveLength(0)
  })
})

describe("correctExplanation (DOS/Give#71)", () => {
  const ADMIN = "99999999-9999-4999-8999-999999999999"
  const EXPLAINER = FINANCE
  const CORRECT = { contribution_id: CONTRIBUTION, reason: "  Donor sent proof: bank receipt for this transfer  " }
  /** The 300k moves from other_in to received; paid does not move. */
  const EXPLAINED = { received_amount: 500000, unmatched_amount: 0, other_amount: 300000, paid_amount: 800000 }
  const CORRECTED = { received_amount: 800000, unmatched_amount: 0, other_amount: 0, paid_amount: 800000 }
  const GENERIC = "Có lỗi xảy ra. Hãy thử lại sau."

  beforeEach(() => {
    state.userId = ADMIN
    state.responses = {
      "rpc:is_admin": { data: true },
      bank_transactions: tx({
        inbound_explanations: { kind: "organizer_top_up", inbound_explanation_corrections: null },
      }),
      "rpc:managed_campaigns": { data: { id: CAMPAIGN, slug: "chau-be-abcde", organizer_id: ORGANIZER } },
      contributions: {
        data: { id: CONTRIBUTION, reference_code: "GV7K2M9QX", status: "awaiting_transfer", contributor_user_id: null },
      },
      audit_log: { data: [{ entity_id: TX, actor_id: EXPLAINER }] },
    }
    state.ledger = [{ data: EXPLAINED }, { data: CORRECTED }]
    state.serviceHandler = () => ({ data: { outcome: "matched", contribution_id: CONTRIBUTION, replayed: false } })
  })

  it("corrects as an admin, credits the contribution and shows that the paid total did not move", async () => {
    const result = await correctExplanation(TX, null, form(CORRECT))
    expect(result).toEqual({
      ok: true,
      message: vnd(
        'Đã sửa giải trình: 300.000 ₫ nay là tiền của lượt ủng hộ GV7K2M9QX, không còn tính là "không phải tiền ủng hộ". Sao kê công khai hiện giao dịch này là tiền ủng hộ. Tổng đã thanh toán không đổi: 800.000 ₫ (đã khớp 500.000 ₫ → 800.000 ₫, không phải tiền ủng hộ 300.000 ₫ → 0 ₫).'
      ),
    })
    expect(state.serviceCalls.map((c) => c.target)).toEqual(["rpc:correct_inbound_explanation"])
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_bank_transaction_id: TX,
        p_actor_id: ADMIN,
        p_contribution_id: CONTRIBUTION,
        p_reason: "Donor sent proof: bank receipt for this transfer",
      },
    ])
    // Admin only, asked with the actor's own token, then everything read with that token before the service role acts.
    expect(op(state.userCalls[0], "args")?.[0]).toEqual({ p_roles: ["admin"] })
    expect(state.userCalls.map((c) => c.target)).toEqual([
      "rpc:is_admin",
      "bank_transactions",
      "rpc:managed_campaigns",
      "contributions",
      "audit_log",
      "rpc:campaign_paid",
      "rpc:campaign_paid",
    ])
    expect(String(op(state.userCalls[1], "select")?.[0])).toContain(
      "inbound_explanations(kind, inbound_explanation_corrections(contribution_id))"
    )
    expect(op(state.userCalls[3], "eq")).toEqual(["campaign_id", CAMPAIGN])
    expect(revalidatePath).toHaveBeenCalledWith("/admin/unmatched")
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/chau-be-abcde/statement")
  })

  it("refuses finance staff and everyone else who is not an admin", async () => {
    state.userId = FINANCE
    state.responses["rpc:is_admin"] = { data: false }
    expect(await correctExplanation(TX, null, form(CORRECT))).toEqual({
      ok: false,
      message: "Chỉ quản trị viên mới sửa được giải trình tiền vào.",
    })
    expect(op(state.userCalls[0], "args")?.[0]).toEqual({ p_roles: ["admin"] })
    expect(state.userCalls).toHaveLength(1)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses the campaign's organizer, the explainer and the contributor (self-review)", async () => {
    const SELF = "Bạn không sửa được giải trình này"
    state.userId = ORGANIZER
    expect((await correctExplanation(TX, null, form(CORRECT)))?.message).toContain(SELF)

    state.userId = EXPLAINER
    expect((await correctExplanation(TX, null, form(CORRECT)))?.message).toContain(SELF)

    state.userId = ADMIN
    state.responses.contributions = {
      data: { id: CONTRIBUTION, reference_code: "GV7K2M9QX", status: "awaiting_transfer", contributor_user_id: ADMIN },
    }
    expect((await correctExplanation(TX, null, form(CORRECT)))?.message).toContain(SELF)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("requires a contribution and a reason of at most 1000 characters, before reading anything", async () => {
    expect((await correctExplanation(TX, null, form({ ...CORRECT, contribution_id: "" })))?.message).toBe(
      "Chọn lượt ủng hộ mà khoản tiền này thực ra thuộc về."
    )
    expect((await correctExplanation(TX, null, form({ ...CORRECT, contribution_id: "x" })))?.message).toBe(
      "Lượt ủng hộ không hợp lệ."
    )
    expect((await correctExplanation(TX, null, form({ ...CORRECT, reason: " \r\n " })))?.message).toBe(
      "Ghi lý do vì sao giải trình trước là nhầm và bạn đã kiểm tra những gì."
    )
    expect((await correctExplanation(TX, null, form({ ...CORRECT, reason: "x".repeat(1001) })))?.message).toBe(
      "Lý do tối đa 1000 ký tự."
    )
    expect((await correctExplanation("x", null, form(CORRECT)))?.ok).toBe(false)
    expect(state.userCalls).toHaveLength(0)
    // Exactly 1000 characters, line breaks sent as CRLF counted once, passes.
    expect(
      (await correctExplanation(TX, null, form({ ...CORRECT, reason: "a\r\n".repeat(400) + "x".repeat(200) })))?.ok
    ).toBe(true)
  })

  it("refuses an explanation already corrected with another contribution without calling the database", async () => {
    const OTHER = "55555555-5555-4555-8555-555555555555"
    state.responses.bank_transactions = tx({
      transaction_matches: { contribution_id: OTHER },
      inbound_explanations: { kind: "organizer_top_up", inbound_explanation_corrections: { contribution_id: OTHER } },
    })
    expect((await correctExplanation(TX, null, form(CORRECT)))?.message).toContain("đã được sửa rồi")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("answers the same correction retried as a replay that changed nothing", async () => {
    state.responses.bank_transactions = tx({
      transaction_matches: { contribution_id: CONTRIBUTION },
      inbound_explanations: {
        kind: "organizer_top_up",
        inbound_explanation_corrections: { contribution_id: CONTRIBUTION },
      },
    })
    state.serviceHandler = () => ({ data: { outcome: "matched", contribution_id: CONTRIBUTION, replayed: true } })
    expect((await correctExplanation(TX, null, form(CORRECT)))?.message).toBe(
      "Giải trình này đã được sửa từ trước, với cùng lượt ủng hộ GV7K2M9QX và cùng lý do. Không có gì thay đổi."
    )
  })

  it("refuses a transaction that is matched or not explained, and a contribution of another campaign", async () => {
    state.responses.bank_transactions = tx({ transaction_matches: { contribution_id: CONTRIBUTION } })
    expect((await correctExplanation(TX, null, form(CORRECT)))?.message).toContain("đã được khớp")
    state.responses.bank_transactions = tx()
    expect((await correctExplanation(TX, null, form(CORRECT)))?.message).toContain("chưa được giải trình")
    state.responses.bank_transactions = tx({ inbound_explanations: { kind: "interest" } })
    state.responses.contributions = { data: null }
    expect((await correctExplanation(TX, null, form(CORRECT)))?.message).toContain("thuộc chiến dịch khác")
    expect(state.serviceCalls).toHaveLength(0)
  })

  // Every code give.correct_inbound_explanation raises (stage 1 handoff on DOS/Give#71).
  const RPC_ERRORS: [string, string, string][] = [
    ["42501", "GIVE_NOT_ALLOWED", "Chỉ quản trị viên mới sửa được"],
    ["42501", "GIVE_SELF_REVIEW", "Nhờ một quản trị viên khác"],
    ["23514", "GIVE_CONTRIBUTION_REQUIRED", "Chọn lượt ủng hộ"],
    ["23514", "GIVE_REASON_REQUIRED", "Ghi lý do"],
    ["23514", "GIVE_REASON_TOO_LONG", "Lý do tối đa 1000 ký tự."],
    ["P0002", "GIVE_TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch"],
    ["23514", "GIVE_TRANSACTION_NOT_INBOUND", "khoản tiền vào"],
    ["23514", "GIVE_TRANSACTION_UNATTRIBUTED", "không thuộc chiến dịch nào"],
    ["23514", "GIVE_TRANSACTION_NOT_EXPLAINED", "chưa được giải trình"],
    ["23505", "GIVE_TRANSACTION_ALREADY_MATCHED", "đã được khớp"],
    ["P0002", "GIVE_LEDGER_POST_MISSING", "Hãy tải lại trang"],
    ["23514", "GIVE_ACCOUNT_OWNER_MISMATCH", "Tài khoản nhận không thuộc về người tổ chức"],
    ["23514", "GIVE_CONTRIBUTION_CAMPAIGN_MISMATCH", "thuộc chiến dịch khác"],
    ["23514", "GIVE_CONTRIBUTION_NOT_MATCHABLE", "không nhận thêm tiền được"],
    ["23505", "GIVE_EXPLANATION_ALREADY_CORRECTED", "đã được sửa rồi"],
  ]

  it.each(RPC_ERRORS)("words %s %s", async (code, giveCode, text) => {
    state.ledger = [{ data: EXPLAINED }]
    state.serviceHandler = () => ({ error: { code, message: giveCode } })
    const result = await correctExplanation(TX, null, form(CORRECT))
    expect(result?.ok).toBe(false)
    expect(result?.message).not.toBe(GENERIC)
    expect(result?.message).toContain(text)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("covers every code the database raises", () => {
    expect(new Set(RPC_ERRORS.map(([, code]) => code)).size).toBe(15)
  })
})

describe("linkReturnedTransfer (DOS/Give#72)", () => {
  const ORIGINAL = "88888888-8888-4888-8888-888888888888"
  const LINK = {
    original_transaction_id: ORIGINAL,
    reason: "  Bank returned the refund: account closed  ",
    evidence: "Bank notice 2026-10-30, original FT26300",
  }
  /** The 300k return leaves unmatched_in and is no longer counted as paid. */
  const RETURNED = { received_amount: 500000, unmatched_amount: 0, other_amount: 0, paid_amount: 500000 }
  const GENERIC = "Có lỗi xảy ra. Hãy thử lại sau."

  beforeEach(() => {
    state.ledger = [{ data: BEFORE }, { data: RETURNED }]
    state.serviceHandler = () => ({ data: { outcome: "disbursement_returned", replayed: false } })
  })

  it("links as finance staff, says what changed and that the paid total dropped", async () => {
    const result = await linkReturnedTransfer(TX, null, form(LINK))

    expect(result).toEqual({
      ok: true,
      message: vnd(
        "Đã ghi nhận 300.000 ₫ là tiền bị ngân hàng trả lại của một khoản chi. Tổng đã chi của chiến dịch giảm 300.000 ₫. Sao kê công khai hiện hai giao dịch là một khoản chuyển bị trả lại. Tổng đã thanh toán giảm từ 800.000 ₫ xuống 500.000 ₫ (chưa khớp 300.000 ₫ → 0 ₫): tiền bị trả lại là tiền của chiến dịch quay về, không phải tiền ủng hộ mới."
      ),
    })
    expect(state.serviceCalls[0].target).toBe("rpc:link_returned_transfer")
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_bank_transaction_id: TX,
        p_original_transaction_id: ORIGINAL,
        p_actor_id: FINANCE,
        p_reason: "Bank returned the refund: account closed",
        p_evidence: "Bank notice 2026-10-30, original FT26300",
      },
    ])
    // The role and the transaction are read with the actor's own token before the service role acts.
    expect(state.userCalls.map((c) => c.target)).toEqual([
      "rpc:is_admin",
      "bank_transactions",
      "rpc:managed_campaigns",
      "rpc:campaign_paid",
      "rpc:campaign_paid",
    ])
    expect(op(state.userCalls[0], "args")?.[0]).toEqual({ p_roles: ["finance", "admin"] })
    for (const path of [
      "/admin/unmatched",
      `/me/campaigns/${CAMPAIGN}/unmatched`,
      `/me/campaigns/${CAMPAIGN}/disbursements`,
      `/me/campaigns/${CAMPAIGN}`,
      "/campaigns/chau-be-abcde",
      "/campaigns/chau-be-abcde/statement",
    ]) {
      expect(revalidatePath).toHaveBeenCalledWith(path)
    }
  })

  it("asks for a new refund when a refund came back", async () => {
    state.serviceHandler = () => ({ data: { outcome: "refund_returned", replayed: false } })
    state.ledger = [{ data: BEFORE }, { error: { code: "57014", message: "timeout" } }]
    expect(await linkReturnedTransfer(TX, null, form(LINK))).toEqual({
      ok: true,
      message: vnd(
        "Đã ghi nhận 300.000 ₫ là tiền bị ngân hàng trả lại của một khoản hoàn tiền. Tổng đã hoàn của chiến dịch giảm 300.000 ₫, và lượt ủng hộ đó lại cần được hoàn tiền: hãy báo người tổ chức hoàn lại cho người ủng hộ (kiểm tra lại số tài khoản nhận) rồi giải trình khoản hoàn mới. Nếu đó là một cam kết nay còn phải được hoàn tiền, Give đã gửi thông báo cho người tổ chức (và cho người ủng hộ nếu cam kết trở lại trạng thái Chờ hoàn tiền); các trường hợp khác (như một lượt ủng hộ trực tiếp) không có thông báo tự động. Sao kê công khai hiện hai giao dịch là một khoản chuyển bị trả lại."
      ),
    })
  })

  it("says the whole refund, fee included, no longer counts and must be sent in full again (DOS/Give#195)", async () => {
    state.serviceHandler = () => ({ data: { outcome: "refund_returned", replayed: false } })
    state.ledger = [{ data: BEFORE }, { error: { code: "57014", message: "timeout" } }]
    // The incoming 300k, then the original refund of 311k it returns.
    state.responses.bank_transactions = (call) =>
      call.ops.some(([name, column, value]) => name === "eq" && column === "id" && value === ORIGINAL)
        ? { data: { amount: "311000" } }
        : tx()
    const result = await linkReturnedTransfer(TX, null, form(LINK))
    expect(result?.ok).toBe(true)
    expect(result?.message).toContain(
      vnd(
        "Đã ghi nhận 300.000 ₫ là tiền bị ngân hàng trả lại của khoản hoàn tiền 311.000 ₫; ngân hàng giữ 11.000 ₫ phí. Cả khoản hoàn không còn tính là đã hoàn: tổng đã hoàn của chiến dịch giảm 311.000 ₫, phí 11.000 ₫ tính vào tổng đã chi, và người ủng hộ lại cần được hoàn đủ 311.000 ₫ (người tổ chức chịu phí)"
      )
    )
    // The original is read with the actor's own token, after the link.
    const reads = state.userCalls.filter((c) => c.target === "bank_transactions")
    expect(reads).toHaveLength(2)
    expect(op(reads[1], "select")).toEqual(["amount"])
  })

  it("names no amount for the refunded total when the original cannot be read", async () => {
    state.serviceHandler = () => ({ data: { outcome: "refund_returned", replayed: false } })
    state.responses.bank_transactions = (call) =>
      call.ops.some(([name, column, value]) => name === "eq" && column === "id" && value === ORIGINAL)
        ? { error: { code: "42501", message: "permission denied" } }
        : tx()
    const result = await linkReturnedTransfer(TX, null, form(LINK))
    expect(result?.ok).toBe(true)
    expect(result?.message).toContain(
      "Tổng đã hoàn của chiến dịch giảm đúng bằng số tiền của khoản hoàn tiền gốc (kể cả phần phí nếu ngân hàng giữ lại; phần phí tính vào tổng đã chi), và lượt ủng hộ đó lại cần được hoàn đủ"
    )
    expect(result?.message).not.toContain("giảm 300.000")
  })

  it("answers a replay as done without claiming a change", async () => {
    // The transaction reads as linked already; the action still asks the database, which answers the replay.
    state.responses.bank_transactions = tx({ returned_transfers: { original_transaction_id: ORIGINAL } })
    state.serviceHandler = () => ({ data: { outcome: "refund_returned", replayed: true } })
    const result = await linkReturnedTransfer(TX, null, form(LINK))
    expect(result?.ok).toBe(true)
    expect(result?.message).toBe(
      "Khoản tiền này đã được ghi nhận là tiền bị trả lại từ trước, với cùng khoản chuyển đi gốc, lý do và bằng chứng. Không có gì thay đổi."
    )
    // The totals are read once (before), not compared after a replay.
    expect(state.userCalls.filter((c) => c.target === "rpc:campaign_paid")).toHaveLength(1)
  })

  it("refuses anyone who is not finance or admin staff, the organizer included", async () => {
    state.userId = ORGANIZER
    state.responses["rpc:is_admin"] = { data: false }
    expect(await linkReturnedTransfer(TX, null, form(LINK))).toEqual({
      ok: false,
      message: "Chỉ nhân viên tài chính hoặc quản trị viên mới ghi nhận được tiền bị trả lại.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("checks the form before reading anything", async () => {
    const message = async (values: Record<string, string>, id = TX) =>
      (await linkReturnedTransfer(id, null, form(values)))?.message
    expect(await message({ ...LINK, original_transaction_id: "" })).toBe(
      "Chọn khoản chuyển đi gốc đã bị ngân hàng trả lại."
    )
    expect(await message({ ...LINK, original_transaction_id: "x" })).toBe(
      "Không tìm thấy khoản chuyển đi gốc, hoặc bạn không có quyền với giao dịch đó."
    )
    expect(await message({ ...LINK, reason: " \r\n " })).toBe(
      "Ghi lý do vì sao đây là tiền bị trả lại của khoản đã chọn."
    )
    expect(await message({ ...LINK, evidence: "" })).toContain("Ghi bằng chứng đã kiểm tra")
    expect(await message({ ...LINK, reason: "x".repeat(1001) })).toBe("Lý do và bằng chứng mỗi phần tối đa 1000 ký tự.")
    expect((await linkReturnedTransfer("x", null, form(LINK)))?.ok).toBe(false)
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("counts a line break the browser sends as CRLF as one character", async () => {
    const result = await linkReturnedTransfer(TX, null, form({ ...LINK, evidence: "a\r\n".repeat(500) }))
    expect(result?.ok).toBe(true)
    expect((op(state.serviceCalls[0], "args")?.[0] as { p_evidence: string }).p_evidence).toBe("a\n".repeat(499) + "a")
  })

  it("refuses outgoing, unattributed, unknown, matched and explained transactions without calling the database", async () => {
    const message = async () => (await linkReturnedTransfer(TX, null, form(LINK)))?.message
    state.responses.bank_transactions = tx({ direction: "out" })
    expect(await message()).toBe("Khoản bị trả lại phải là một khoản tiền vào.")
    state.responses.bank_transactions = tx({ campaign_id: null })
    expect(await message()).toContain("không ghi nhận được là tiền bị trả lại của chiến dịch. Lý do có thể là:")
    state.responses.bank_transactions = { data: null }
    expect(await message()).toBe("Không tìm thấy giao dịch, hoặc bạn không có quyền với giao dịch này.")
    state.responses.bank_transactions = tx({ transaction_matches: { contribution_id: "c" } })
    expect(await message()).toContain("đã được khớp với một lượt ủng hộ")
    state.responses.bank_transactions = tx({ inbound_explanations: [{ kind: "interest" }] })
    expect(await message()).toContain("đã được giải trình là không phải tiền ủng hộ")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("answers a failed read with the generic message, not a crash", async () => {
    state.responses.bank_transactions = { error: { code: "57014", message: "timeout" } }
    expect(await linkReturnedTransfer(TX, null, form(LINK))).toEqual({ ok: false, message: GENERIC })
    expect(state.serviceCalls).toHaveLength(0)
  })

  // Every code give.link_returned_transfer raises (stage 1 handoff on DOS/Give#72), worded in Vietnamese.
  const RPC_ERRORS: [string, string, string][] = [
    ["42501", "GIVE_NOT_ALLOWED", "Chỉ nhân viên tài chính hoặc quản trị viên mới ghi nhận được tiền bị trả lại."],
    ["23514", "GIVE_REASON_REQUIRED", "Ghi lý do vì sao đây là tiền bị trả lại của khoản đã chọn."],
    [
      "23514",
      "GIVE_EVIDENCE_REQUIRED",
      "Ghi bằng chứng đã kiểm tra (ví dụ: thông báo trả tiền của ngân hàng, dòng sao kê, mã giao dịch gốc).",
    ],
    ["23514", "GIVE_EXPLANATION_TOO_LONG", "Lý do và bằng chứng mỗi phần tối đa 1000 ký tự."],
    ["P0002", "GIVE_TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch, hoặc bạn không có quyền với giao dịch này."],
    ["23514", "GIVE_TRANSACTION_NOT_INBOUND", "Khoản bị trả lại phải là một khoản tiền vào."],
    [
      "23514",
      "GIVE_TRANSACTION_UNATTRIBUTED",
      "Giao dịch này không thuộc chiến dịch nào, nên không ghi nhận được là tiền bị trả lại của chiến dịch.",
    ],
    [
      "P0002",
      "GIVE_ORIGINAL_TRANSACTION_NOT_FOUND",
      "Không tìm thấy khoản chuyển đi gốc, hoặc bạn không có quyền với giao dịch đó.",
    ],
    ["23514", "GIVE_TRANSACTION_NOT_OUTBOUND", "Khoản chi gốc phải là một khoản tiền ra."],
    ["23514", "GIVE_ORIGINAL_NOT_EXPLAINED", "Khoản chuyển đi gốc chưa được giải trình."],
    ["23514", "GIVE_RETURN_CAMPAIGN_MISMATCH", "Khoản chuyển đi gốc thuộc chiến dịch khác."],
    ["23514", "GIVE_RETURN_ACCOUNT_MISMATCH", "Khoản chuyển đi gốc đi từ một tài khoản nhận khác."],
    ["23514", "GIVE_RETURN_ASSET_MISMATCH", "Khoản chuyển đi gốc dùng loại tiền khác với khoản tiền bị trả lại."],
    ["23514", "GIVE_RETURN_EXCEEDS_ORIGINAL", "Số tiền bị trả lại lớn hơn khoản chuyển đi gốc"],
    ["23514", "GIVE_RETURN_BEFORE_ORIGINAL", "Tiền bị trả lại được ghi trước ngày của khoản chuyển đi gốc"],
    ["23505", "GIVE_TRANSACTION_ALREADY_RETURNED", "Khoản tiền vào này đã được ghi nhận là tiền bị trả lại"],
    [
      "23505",
      "GIVE_ORIGINAL_ALREADY_RETURNED",
      "Khoản chuyển đi gốc này đã được ghi nhận là bị trả lại bởi một khoản tiền vào khác.",
    ],
    [
      "23505",
      "GIVE_TRANSACTION_ALREADY_MATCHED",
      "Giao dịch này đã được khớp với một lượt ủng hộ, nên không ghi nhận được là tiền bị trả lại.",
    ],
    ["23505", "GIVE_TRANSACTION_ALREADY_EXPLAINED", "Giao dịch này đã được giải trình là không phải tiền ủng hộ"],
    ["23514", "GIVE_TRANSACTION_OWN_TRANSFER", "khoản chuyển giữa các tài khoản của chiến dịch"],
    ["P0002", "GIVE_LEDGER_POST_MISSING", "chưa được ghi sổ đầy đủ, hoặc khoản tiền vào đã được xử lý"],
  ]

  it.each(RPC_ERRORS)("words %s %s", async (code, giveCode, text) => {
    state.serviceHandler = () => ({ error: { code, message: giveCode } })
    const result = await linkReturnedTransfer(TX, null, form(LINK))
    expect(result?.ok).toBe(false)
    expect(result?.message).not.toBe(GENERIC)
    expect(result?.message).toContain(text)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("covers every code the database raises", () => {
    expect(new Set(RPC_ERRORS.map(([, code]) => code)).size).toBe(21)
  })
})
