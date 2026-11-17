import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const STAFF = "66666666-6666-4666-8666-666666666666"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const OUT = "77777777-7777-4777-8777-777777777777"
const IN = "88888888-8888-4888-8888-888888888888"
const PAIR = "99999999-9999-4999-8999-999999999999"

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  signedIn: true,
}))

const revalidatePath = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    state.signedIn ? { user: { id: STAFF, email: null, name: null }, accessToken: "token" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { markOwnTransfer } = await import("./actions")

const legs = [
  { id: OUT, direction: "out", campaign_id: CAMPAIGN, amount: "3000000", asset: "VND" },
  { id: IN, direction: "in", campaign_id: CAMPAIGN, amount: 3_000_000, asset: "VND" },
]

function userDb(over: { staff?: boolean; legs?: unknown[] } = {}): Handler {
  return (call) => {
    if (call.target === "rpc:is_admin") return { data: over.staff ?? true }
    if (call.target === "bank_transactions") return { data: over.legs ?? legs }
    if (call.target === "rpc:managed_campaigns") return { data: { id: CAMPAIGN, slug: "chien-dich-a" } }
    return undefined
  }
}

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const valid = { in_transaction_id: IN, reason: "Sao kê hai tài khoản cùng ngày\r\nngười tổ chức báo chuyển số dư" }

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.signedIn = true
  state.userHandler = userDb()
  state.serviceHandler = () => ({ data: PAIR })
  revalidatePath.mockClear()
})

describe("markOwnTransfer", () => {
  it("checks the role and both legs with the staff token, then marks the pair as the service role", async () => {
    const result = await markOwnTransfer(OUT, null, form(valid))
    expect(result?.ok).toBe(true)
    expect(result?.message).toContain("Chuyển sang tài khoản mới")
    expect(result?.message).toContain("không còn tính vào tổng đã nhận hay đã chi")

    expect(op(state.userCalls[0], "args")).toEqual([{ p_roles: ["finance", "admin"] }])
    expect(state.userCalls[1].target).toBe("bank_transactions")
    expect(op(state.userCalls[1], "in")).toEqual(["id", [OUT, IN]])
    expect(state.serviceCalls).toHaveLength(1)
    expect(state.serviceCalls[0].target).toBe("rpc:mark_own_account_transfer")
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_out_transaction_id: OUT,
        p_in_transaction_id: IN,
        p_actor_id: STAFF,
        // CRLF is stored as one line break, and the reason is trimmed.
        p_reason: "Sao kê hai tài khoản cùng ngày\nngười tổ chức báo chuyển số dư",
      },
    ])
    // The public pages read the updated public_campaigns and public_statement.
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/chien-dich-a")
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/chien-dich-a/statement")
    expect(revalidatePath).toHaveBeenCalledWith(`/me/campaigns/${CAMPAIGN}/disbursements`)
    expect(revalidatePath).toHaveBeenCalledWith("/admin/own-transfers")
  })

  it("answers a replay of the same pair as done (the database returns the same id)", async () => {
    expect((await markOwnTransfer(OUT, null, form(valid)))?.ok).toBe(true)
    expect((await markOwnTransfer(OUT, null, form(valid)))?.ok).toBe(true)
    expect(state.serviceCalls).toHaveLength(2)
  })

  it("needs a session, valid ids and a reason of at most 1000 characters before any read", async () => {
    state.signedIn = false
    expect((await markOwnTransfer(OUT, null, form(valid)))?.message).toContain("đăng nhập lại")
    state.signedIn = true
    expect((await markOwnTransfer("nope", null, form(valid)))?.ok).toBe(false)
    expect((await markOwnTransfer(OUT, null, form({ ...valid, in_transaction_id: "" })))?.message).toContain(
      "Chọn khoản tiền vào"
    )
    expect((await markOwnTransfer(OUT, null, form({ ...valid, reason: " \r\n " })))?.message).toContain("căn cứ")
    // 1000 characters counted as code points: an emoji is one character.
    expect((await markOwnTransfer(OUT, null, form({ ...valid, reason: "😀".repeat(1000) })))?.ok).toBe(true)
    state.serviceCalls.length = 0
    expect((await markOwnTransfer(OUT, null, form({ ...valid, reason: "x".repeat(1001) })))?.message).toContain(
      "1000 ký tự"
    )
    expect(state.serviceCalls).toEqual([])
  })

  it("refuses staff without the finance role before calling the database", async () => {
    state.userHandler = userDb({ staff: false })
    const result = await markOwnTransfer(OUT, null, form(valid))
    expect(result?.message).toContain("Chỉ nhân viên tài chính")
    expect(state.serviceCalls).toEqual([])
  })

  it("checks both legs it can read before calling the database", async () => {
    const cases: [unknown[], string][] = [
      [[legs[0]], "Không tìm thấy"],
      [[{ ...legs[0], direction: "in" }, legs[1]], "phải là tiền ra"],
      [[legs[0], { ...legs[1], direction: "out" }], "phải là tiền vào"],
      [[legs[0], { ...legs[1], campaign_id: null }], "không thuộc chiến dịch nào"],
      [[legs[0], { ...legs[1], campaign_id: "other" }], "hai chiến dịch khác nhau"],
      [[legs[0], { ...legs[1], amount: 2_999_000 }], "cùng số tiền"],
      [[legs[0], { ...legs[1], asset: "USDT" }], "cùng loại tiền"],
    ]
    for (const [rows, text] of cases) {
      state.userHandler = userDb({ legs: rows })
      expect((await markOwnTransfer(OUT, null, form(valid)))?.message, text).toContain(text)
    }
    expect(state.serviceCalls).toEqual([])
  })

  it("words each database refusal for finance", async () => {
    const cases: [string, string][] = [
      ["GIVE_SELF_REVIEW", "chính bạn tổ chức"],
      ["GIVE_OWN_TRANSFER_NOT_SWAPPED", "đổi tài khoản đã duyệt"],
      ["GIVE_TRANSACTION_ALREADY_TRANSFERRED", "cặp chuyển tài khoản khác"],
      ["GIVE_DISBURSEMENT_ALREADY_EXPLAINED", "đã giải trình khoản tiền ra này"],
      ["GIVE_TRANSACTION_ALREADY_MATCHED", "khớp với một lượt ủng hộ"],
      ["GIVE_TRANSACTION_ALREADY_EXPLAINED", "không phải ủng hộ"],
      ["GIVE_LEDGER_POST_MISSING", "ghi sổ"],
      ["GIVE_NOT_ALLOWED", "Chỉ nhân viên tài chính"],
    ]
    for (const [code, text] of cases) {
      state.serviceHandler = () => ({ error: { code: "23514", message: code } })
      expect((await markOwnTransfer(OUT, null, form(valid)))?.message, code).toContain(text)
    }
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
