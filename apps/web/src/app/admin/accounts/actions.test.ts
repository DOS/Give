import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const REVIEWER = "66666666-6666-4666-8666-666666666666"
const ACCOUNT = "44444444-4444-4444-8444-444444444444"

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

const { reviewAccount } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const OWNER = "11111111-1111-4111-8111-111111111111"

/** A finance reviewer's reads: the role check, the account and its organizer. */
const isFinance: Handler = (call) => {
  if (call.target === "rpc:is_admin") return { data: true }
  if (call.target === "receiving_accounts") return { data: { id: ACCOUNT, owner_user_id: OWNER, bindings: [] } }
  if (call.target === "organizers") return { data: { user_id: OWNER, legal_name: "Nguyễn Thị Đào" } }
  return undefined
}

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.userHandler = isFinance
  state.serviceHandler = () => ({ data: "verified" })
})

describe("reviewAccount", () => {
  it("verifies with evidence and the code the reviewer checked", async () => {
    const result = await reviewAccount(
      ACCOUNT,
      null,
      form({
        decision: "verified",
        sender_name: "NGUYEN THI DAO",
        evidence: " FT2630512345 01/11 ",
        expected_code: "XM2345678",
        reason: "x",
      })
    )

    expect(result).toEqual({ ok: true, message: "Đã xác minh tài khoản nhận." })
    expect(
      op(
        state.userCalls.find((c) => c.target === "rpc:is_admin"),
        "args"
      )
    ).toEqual([{ p_roles: ["finance", "admin"] }])
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_receiving_account_id: ACCOUNT,
        p_decision: "verified",
        p_reviewer_id: REVIEWER,
        p_evidence: "Người chuyển: NGUYEN THI DAO. FT2630512345 01/11",
        p_reason: null,
        p_expected_code: "XM2345678",
        p_sender_name: "NGUYEN THI DAO",
      },
    ])
  })

  it("refuses to verify when the sender on the transfer is not the organizer", async () => {
    const result = await reviewAccount(
      ACCOUNT,
      null,
      form({ decision: "verified", sender_name: "TRAN VAN B", evidence: "FT1", expected_code: "XM2345678" })
    )
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("không trùng tên pháp lý")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses evidence that would not fit instead of cutting it", async () => {
    const result = await reviewAccount(
      ACCOUNT,
      null,
      form({
        decision: "verified",
        sender_name: "NGUYEN THI DAO",
        evidence: "x".repeat(490),
        expected_code: "XM2345678",
      })
    )
    expect(result?.message).toContain("quá dài")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("rejects with a reason and no evidence or code", async () => {
    const result = await reviewAccount(ACCOUNT, null, form({ decision: "rejected", reason: "Không thấy giao dịch" }))
    expect(result?.ok).toBe(true)
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_receiving_account_id: ACCOUNT,
        p_decision: "rejected",
        p_reviewer_id: REVIEWER,
        p_evidence: null,
        p_reason: "Không thấy giao dịch",
        p_expected_code: null,
        p_sender_name: null,
      },
    ])
  })

  it("requires evidence to verify and a reason to reject or disable", async () => {
    expect((await reviewAccount(ACCOUNT, null, form({ decision: "verified", evidence: " " })))?.ok).toBe(false)
    expect((await reviewAccount(ACCOUNT, null, form({ decision: "verified", evidence: "FT1" })))?.ok).toBe(false)
    expect((await reviewAccount(ACCOUNT, null, form({ decision: "rejected" })))?.ok).toBe(false)
    expect((await reviewAccount(ACCOUNT, null, form({ decision: "disabled" })))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses non-finance staff and rejected tokens before the service role", async () => {
    state.userHandler = (call) => (call.target === "rpc:is_admin" ? { data: false } : undefined)
    const result = await reviewAccount(ACCOUNT, null, form({ decision: "pending" }))
    expect(result?.ok).toBe(false)

    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWT invalid" } })
    expect(await reviewAccount(ACCOUNT, null, form({ decision: "pending" }))).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("rejects unknown decisions and tampered ids", async () => {
    expect((await reviewAccount(ACCOUNT, null, form({ decision: "deleted" })))?.ok).toBe(false)
    expect((await reviewAccount("x", null, form({ decision: "pending" })))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("words database refusals for an account review", async () => {
    state.serviceHandler = () => ({ error: { message: "GIVE_TRANSITION_NOT_ALLOWED: pending -> rejected" } })
    const rejected = await reviewAccount(ACCOUNT, null, form({ decision: "rejected", reason: "x" }))
    expect(rejected?.message).toContain("tải lại trang")

    state.serviceHandler = () => ({ error: { message: "GIVE_SELF_REVIEW" } })
    const self = await reviewAccount(ACCOUNT, null, form({ decision: "pending" }))
    expect(self?.message).toBe("Không thể tự xác minh tài khoản nhận của chính mình.")

    state.serviceHandler = () => ({ error: { message: "GIVE_VERIFICATION_CHANGED_SINCE_REVIEW" } })
    const stale = await reviewAccount(
      ACCOUNT,
      null,
      form({ decision: "verified", sender_name: "Nguyễn Thị Đào", evidence: "x", expected_code: "XM" })
    )
    expect(stale?.message).toContain("Mã xác minh của tài khoản đã đổi")

    state.serviceHandler = () => ({ error: { message: "GIVE_SENDER_NAME_MISMATCH" } })
    const renamed = await reviewAccount(
      ACCOUNT,
      null,
      form({ decision: "verified", sender_name: "Nguyễn Thị Đào", evidence: "x", expected_code: "XM" })
    )
    expect(renamed?.message).toContain("Tên người chuyển trên giao dịch xác minh không trùng")
  })
})
