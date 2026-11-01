import { beforeEach, describe, expect, it, vi } from "vitest"

import { CSV_COLUMNS, csvFile } from "@/test/csv-statement-parser"
import { fakeDb, op, type Call, type Handler, type Result } from "@/test/fake-db"

const UPLOADER = "22222222-2222-4222-8222-222222222222"
const ACCOUNT = "11111111-1111-4111-8111-111111111111"
const EVENT = "33333333-3333-4333-8333-333333333333"
const BATCH = "44444444-4444-4444-8444-444444444444"

const state = vi.hoisted(() => ({
  session: true,
  userHandler: (() => undefined) as Handler,
  serviceResponses: {} as Record<string, Result>,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    state.session ? { user: { id: UPLOADER, email: null, name: null }, accessToken: "token" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceResponses[call.target], state.serviceCalls),
}))
// The app registers no real parser until DOS/Give#17; the test-only CSV format stands in.
vi.mock("@/server/statement-parsers", async () => {
  const { ParserRegistry } = await import("@/server/statement-parsers/registry")
  const { csvStatementParser } = await import("@/test/csv-statement-parser")
  return { statementParsers: new ParserRegistry([csvStatementParser()]) }
})

const { uploadStatement } = await import("./actions")

const FILE = csvFile(
  "period_from,2026-10-01",
  "period_to,2026-10-02",
  CSV_COLUMNS,
  "2026-10-01T09:15:00+07:00,in,50000,150000,FT001,MBVCB.123.GVABCDEF.CT,NGUYEN VAN A,0123456789",
  "2026-10-01T10:00:00+07:00,in,20000,170000,FT002,UNG HO,TRAN B,9876543210",
  "2026-10-02,out,1100,168900,FT003,PHI SMS,,"
)

function form(values: Record<string, string | Blob>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

function upload(overrides: Record<string, string | Blob> = {}) {
  return uploadStatement(
    null,
    form({ account_id: ACCOUNT, parser: "test-csv", file: new File([FILE.slice()], "saoke.csv"), ...overrides })
  )
}

beforeEach(() => {
  state.session = true
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.userHandler = (call) =>
    call.target === "receiving_accounts"
      ? { data: { id: ACCOUNT, channel: "statement_import", bank_bin: "970436" } }
      : undefined
  state.serviceResponses = {
    "rpc:record_inbound_event": { data: { inbound_event_id: EVENT, created: true, processed_at: null } },
    "rpc:stage_statement_import": {
      data: { import_batch_id: BATCH, created: true, ready: 2, duplicate: 0, ambiguous: 1 },
    },
    "rpc:import_statement_batch": { data: { imported: 2, duplicate: 0, ambiguous: 1, ready: 0 } },
    "rpc:complete_inbound_event": { data: "2026-11-02T03:00:01Z" },
  }
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("uploadStatement", () => {
  it("imports the file as the signed-in uploader and sums up the batch", async () => {
    const result = await upload()

    expect(result).toEqual({
      ok: true,
      message: "Đã nhập sao kê: 2 giao dịch được ghi, 0 dòng trùng đã bỏ qua, 1 dòng chờ nhân viên tài chính xem.",
      batchId: BATCH,
    })
    // The account is read with the uploader's token, so RLS decides who may upload.
    expect(state.userCalls.map((c) => c.target)).toEqual(["receiving_accounts"])
    const staged = op(
      state.serviceCalls.find((c) => c.target === "rpc:stage_statement_import"),
      "args"
    )?.[0] as Record<string, unknown>
    expect(staged).toMatchObject({ p_receiving_account_id: ACCOUNT, p_actor_id: UPLOADER, p_parser: "test-csv" })
    expect(staged.p_rows).toHaveLength(3)
  })

  it("says when the same file was uploaded before", async () => {
    state.serviceResponses["rpc:record_inbound_event"] = {
      data: { inbound_event_id: EVENT, created: false, processed_at: "2026-11-01T00:00:00Z" },
    }
    state.serviceResponses.inbound_events = { data: { payload: null } }
    const result = await upload()
    expect(result?.ok).toBe(true)
    expect(result?.message).toMatch(/^File này đã được tải lên trước đây/)
  })

  it("refuses a format no parser reads, before anything is recorded", async () => {
    const result = await upload({ parser: "vcb-xlsx" })
    expect(result).toEqual({ ok: false, message: "Định dạng sao kê này chưa được hỗ trợ." })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("names the row of the file that is wrong", async () => {
    const bad = csvFile(
      CSV_COLUMNS,
      "2026-10-01T09:15:00+07:00,in,50000,150000,FT001,X,,",
      "2026-10-01,in,0,150000,FT002,Y,,"
    )
    const result = await upload({ file: new File([bad.slice()], "saoke.csv") })
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("(dòng 2 của file)")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("reports a file the database refuses, so the uploader fixes it", async () => {
    state.serviceResponses["rpc:stage_statement_import"] = {
      error: { code: "P0001", message: "GIVE_IMPORT_ROWS_NOT_CHRONOLOGICAL: row 3" },
    }
    const result = await upload()
    expect(result).toEqual({
      ok: false,
      message:
        "Sao kê không nhập được. Các dòng giao dịch không theo thứ tự thời gian (dòng 3 của file). Hãy sửa file rồi tải lại.",
    })
  })

  it("keeps a recorded upload that failed for the cron to finish", async () => {
    state.serviceResponses["rpc:import_statement_batch"] = { error: { code: "57014", message: "canceling statement" } }
    const result = await upload()
    expect(result?.ok).toBe(true)
    expect(result?.message).toContain("Give đang xử lý tiếp")
  })

  it("refuses an account the uploader cannot read", async () => {
    state.userHandler = () => ({ data: null })
    const result = await upload()
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("Không tìm thấy tài khoản nhận")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("checks the form and the session before reading anything", async () => {
    expect((await upload({ account_id: "x" }))?.ok).toBe(false)
    expect((await upload({ file: new File([], "trong.csv") }))?.message).toBe("Chọn file sao kê.")
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "lon.csv")
    expect((await upload({ file: big }))?.message).toBe("File trống hoặc quá lớn (tối đa 4 MB).")
    state.session = false
    expect((await upload())?.message).toBe("Phiên đăng nhập đã hết. Hãy đăng nhập lại.")
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })
})
