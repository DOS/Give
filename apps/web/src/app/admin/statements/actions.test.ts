import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const REVIEWER = "66666666-6666-4666-8666-666666666666"
const ROW = "55555555-5555-4555-8555-555555555555"
const TX = "77777777-7777-4777-8777-777777777777"

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: REVIEWER, email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { resolveStatementRow } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

function rpcArgs() {
  return op(
    state.serviceCalls.find((c) => c.target === "rpc:resolve_statement_import_row"),
    "args"
  )?.[0]
}

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.userHandler = (call) => (call.target === "rpc:is_admin" ? { data: true } : undefined)
  state.serviceHandler = () => ({ data: { status: "imported", bank_transaction_id: TX } })
})

describe("resolveStatementRow", () => {
  it("imports a row with the reviewer's note, after a role check with their own token", async () => {
    const result = await resolveStatementRow(ROW, null, form({ resolution: "import", note: "  Thấy trên VCB, FT9  " }))

    expect(result?.ok).toBe(true)
    expect(result?.message).toContain("Đã nhập dòng thành giao dịch")
    expect(op(state.userCalls[0], "args")).toEqual([{ p_roles: ["finance", "admin"] }])
    expect(rpcArgs()).toEqual({
      p_row_id: ROW,
      p_actor_id: REVIEWER,
      p_resolution: "import",
      p_note: "Thấy trên VCB, FT9",
      p_bank_transaction_id: null,
      p_override_candidate: false,
    })
  })

  it("passes the override only for an import the reviewer confirmed", async () => {
    await resolveStatementRow(ROW, null, form({ resolution: "import", note: "khác", override_candidate: "on" }))
    expect(rpcArgs()).toMatchObject({ p_override_candidate: true })

    state.serviceCalls.length = 0
    await resolveStatementRow(
      ROW,
      null,
      form({ resolution: "duplicate", note: "trùng", bank_transaction_id: TX, override_candidate: "on" })
    )
    expect(rpcArgs()).toMatchObject({
      p_resolution: "duplicate",
      p_bank_transaction_id: TX,
      p_override_candidate: false,
    })
  })

  it("marks a duplicate of the chosen transaction without creating one", async () => {
    state.serviceHandler = () => ({ data: { status: "duplicate", bank_transaction_id: TX } })
    const result = await resolveStatementRow(
      ROW,
      null,
      form({ resolution: "duplicate", note: "đã ghi", bank_transaction_id: TX })
    )
    expect(result).toEqual({
      ok: true,
      message: "Đã đánh dấu dòng là giao dịch đã ghi; không có giao dịch mới nào được tạo.",
    })
  })

  it("requires a note, a resolution and, for a duplicate, the transaction it repeats", async () => {
    expect((await resolveStatementRow(ROW, null, form({ resolution: "import", note: "  " })))?.message).toContain(
      "Ghi chú là bắt buộc"
    )
    expect((await resolveStatementRow(ROW, null, form({ resolution: "drop", note: "x" })))?.ok).toBe(false)
    expect((await resolveStatementRow(ROW, null, form({ resolution: "duplicate", note: "x" })))?.ok).toBe(false)
    expect((await resolveStatementRow(ROW, null, form({ resolution: "import", note: "x".repeat(1001) })))?.ok).toBe(
      false
    )
    expect((await resolveStatementRow("x", null, form({ resolution: "import", note: "x" })))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses anyone but finance/admin staff, and rejected tokens, before the service role", async () => {
    state.userHandler = (call) => (call.target === "rpc:is_admin" ? { data: false } : undefined)
    expect((await resolveStatementRow(ROW, null, form({ resolution: "import", note: "x" })))?.message).toBe(
      "Chỉ nhân viên tài chính hoặc quản trị viên được xử lý dòng sao kê."
    )
    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWT expired" } })
    expect((await resolveStatementRow(ROW, null, form({ resolution: "import", note: "x" })))?.message).toBe(
      "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
    )
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("words the database's refusals", async () => {
    state.serviceHandler = () => ({
      error: { message: "GIVE_RESOLUTION_CANDIDATE: the row lines up with an earlier row" },
    })
    expect((await resolveStatementRow(ROW, null, form({ resolution: "import", note: "x" })))?.message).toContain(
      "khớp với một dòng sao kê đã tải trước"
    )
    state.serviceHandler = () => ({ error: { message: "GIVE_IMPORT_ROW_NOT_AMBIGUOUS: imported" } })
    expect((await resolveStatementRow(ROW, null, form({ resolution: "import", note: "x" })))?.message).toContain(
      "đã được xử lý"
    )
    state.serviceHandler = () => ({ error: { message: "GIVE_DUPLICATE_TARGET_INVALID" } })
    expect(
      (await resolveStatementRow(ROW, null, form({ resolution: "duplicate", note: "x", bank_transaction_id: TX })))
        ?.message
    ).toContain("Giao dịch đã chọn không cùng tài khoản")
  })
})
