import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const OTHER = "99999999-9999-4999-8999-999999999999"
const ACCOUNT = "44444444-4444-4444-8444-444444444444"
const OTHER_ACCOUNT = "55555555-5555-4555-8555-555555555555"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: USER, email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { bindAccount, registerAccount, releaseAccount } = await import("./actions")

function registerForm(overrides: Record<string, string> = {}) {
  const form = new FormData()
  const values: Record<string, string> = {
    bank_bin: "970436",
    account_number: "0011 0123 45678",
    account_name: "nguyen thi dao",
    account_kind: "standard",
    public_statement_url: "",
    ...overrides,
  }
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return form
}

function bindForm(campaignId = CAMPAIGN) {
  const form = new FormData()
  form.set("campaign_id", campaignId)
  return form
}

const organizer = { user_id: USER, legal_name: "Nguyễn Thị Đào", verification_status: "verified" }

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT,
    owner_user_id: USER,
    verification_status: "verified",
    account_name: "NGUYEN THI DAO",
    bindings: [],
    ...overrides,
  }
}

function campaign(overrides: Record<string, unknown> = {}) {
  return { id: CAMPAIGN, organizer_id: USER, status: "in_review", title: "Quỹ học bổng", ...overrides }
}

/** User-token reads for registerAccount: the organizer and the pending accounts. */
function registerReads(org: unknown = organizer, pending: unknown[] = []): Handler {
  return (call) => {
    if (call.target === "organizers") return { data: org }
    if (call.target === "receiving_accounts") return { data: pending }
    return undefined
  }
}

/** User-token reads for bindAccount: the account, the campaign and its active bindings. */
function bindReads({
  acc = account(),
  camp = campaign(),
  bindings = [] as unknown[],
  org = { ...organizer, legal_name: "Nguyễn Thị Đào", verification_status: "verified" } as unknown,
}: { acc?: unknown; camp?: unknown; bindings?: unknown[]; org?: unknown } = {}): Handler {
  return (call) => {
    if (call.target === "receiving_accounts") return { data: acc }
    if (call.target === "rpc:managed_campaigns") return { data: camp }
    if (call.target === "account_bindings") return { data: bindings }
    if (call.target === "organizers") return { data: org }
    return undefined
  }
}

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.userHandler = () => undefined
  state.serviceHandler = () => undefined
})

describe("registerAccount", () => {
  it("registers through the service-role RPC with the verified user's id and normalised fields", async () => {
    state.userHandler = registerReads()
    state.serviceHandler = () => ({ data: [{ receiving_account_id: ACCOUNT, verification_code: "XM2345678" }] })

    const result = await registerAccount(null, registerForm())

    expect(result?.ok).toBe(true)
    const rpc = state.serviceCalls.find((c) => c.target === "rpc:register_receiving_account")
    expect(op(rpc, "args")).toEqual([
      {
        p_owner_user_id: USER,
        p_channel: "statement_import",
        p_bank_bin: "970436",
        p_account_number: "0011012345678",
        p_account_name: "NGUYEN THI DAO",
        p_account_kind: "standard",
        p_public_statement_url: null,
      },
    ])
  })

  it("stops before the service role when the user's token is rejected", async () => {
    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWT invalid" } })

    const result = await registerAccount(null, registerForm())

    expect(result).toEqual({ ok: false, message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại." })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("asks for an organizer profile first", async () => {
    state.userHandler = registerReads(null)
    const result = await registerAccount(null, registerForm())
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("hồ sơ người tổ chức")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("explains a holder name that does not match the legal name", async () => {
    state.userHandler = registerReads()
    const result = await registerAccount(null, registerForm({ account_name: "TRAN VAN B" }))
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("Nguyễn Thị Đào")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("caps the accounts waiting for verification", async () => {
    state.userHandler = registerReads(organizer, [{ id: "a" }, { id: "b" }, { id: "c" }])
    const result = await registerAccount(null, registerForm())
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("3 tài khoản chờ xác minh")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("rejects a bank that is not in the list", async () => {
    const result = await registerAccount(null, registerForm({ bank_bin: "123456" }))
    expect(result).toEqual({ ok: false, message: "Chọn ngân hàng" })
    expect(state.userCalls).toHaveLength(0)
  })

  it("maps database errors to Vietnamese messages", async () => {
    state.userHandler = registerReads()
    state.serviceHandler = () => ({ error: { code: "23505", message: "GIVE_ACCOUNT_ALREADY_REGISTERED" } })
    const result = await registerAccount(null, registerForm())
    expect(result).toEqual({ ok: false, message: "Tài khoản ngân hàng này đã được khai báo trên Give." })
  })

  it("explains the database's pending cap when a registration raced past the app check", async () => {
    state.userHandler = registerReads()
    state.serviceHandler = () => ({ error: { code: "23514", message: "GIVE_TOO_MANY_PENDING_ACCOUNTS: at most 3" } })
    const result = await registerAccount(null, registerForm())
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("3 tài khoản chờ xác minh")
  })
})

describe("bindAccount", () => {
  it("binds a verified account to the organizer's submitted campaign", async () => {
    state.userHandler = bindReads()
    state.serviceHandler = () => ({ data: "binding-id" })

    const result = await bindAccount(ACCOUNT, null, bindForm())

    expect(result).toEqual({ ok: true, message: 'Đã gắn tài khoản với chiến dịch "Quỹ học bổng".' })
    const rpc = state.serviceCalls.find((c) => c.target === "rpc:bind_receiving_account")
    expect(op(rpc, "args")).toEqual([{ p_receiving_account_id: ACCOUNT, p_campaign_id: CAMPAIGN, p_actor_id: USER }])
  })

  it("binds an account to the organizer's draft", async () => {
    state.userHandler = bindReads({ camp: campaign({ status: "draft" }) })
    state.serviceHandler = () => ({ data: "binding-id" })
    const result = await bindAccount(ACCOUNT, null, bindForm())
    expect(result?.ok).toBe(true)
    expect(state.serviceCalls.some((c) => c.target === "rpc:bind_receiving_account")).toBe(true)
  })

  it("refuses a closed campaign before calling the database", async () => {
    state.userHandler = bindReads({ camp: campaign({ status: "closed" }) })
    const result = await bindAccount(ACCOUNT, null, bindForm())
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("bản nháp")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("passes the database's refusal through when the campaign took another account meanwhile", async () => {
    state.userHandler = bindReads()
    state.serviceHandler = () => ({ error: { code: "23505", message: "GIVE_CAMPAIGN_ALREADY_BOUND" } })
    const result = await bindAccount(ACCOUNT, null, bindForm())
    expect(result).toEqual({ ok: false, message: "Chiến dịch này đã có tài khoản nhận khác." })
  })

  it("explains when the account is still bound to another campaign", async () => {
    const elsewhere = { id: "b", campaign_id: OTHER, bound_at: "2026-10-01", released_at: null }
    state.userHandler = bindReads({ acc: account({ bindings: [elsewhere] }) })
    const result = await bindAccount(ACCOUNT, null, bindForm())
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("đang gắn với một chiến dịch khác")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("passes the database's refusal through when the account was bound meanwhile", async () => {
    state.userHandler = bindReads()
    state.serviceHandler = () => ({ error: { code: "23505", message: "GIVE_ACCOUNT_ALREADY_BOUND" } })
    const result = await bindAccount(ACCOUNT, null, bindForm())
    expect(result?.message).toContain("đang gắn với một chiến dịch khác")
  })

  it("refuses a second account on a campaign that already has one", async () => {
    state.userHandler = bindReads({ bindings: [{ id: "b", receiving_account_id: OTHER_ACCOUNT }] })
    const result = await bindAccount(ACCOUNT, null, bindForm())
    expect(result).toEqual({ ok: false, message: "Chiến dịch này đã có tài khoản nhận khác." })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses accounts that are not verified", async () => {
    state.userHandler = bindReads({ acc: account({ verification_status: "pending" }) })
    const result = await bindAccount(ACCOUNT, null, bindForm())
    expect(result?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a verified account once the organizer's identity changed", async () => {
    state.userHandler = bindReads({ org: { ...organizer, verification_status: "pending" } })
    const reset = await bindAccount(ACCOUNT, null, bindForm())
    expect(reset?.message).toContain("Hồ sơ người tổ chức chưa được xác minh")
    state.userHandler = bindReads({ org: { ...organizer, legal_name: "Trần Văn B" } })
    const renamed = await bindAccount(ACCOUNT, null, bindForm())
    expect(renamed?.message).toContain("không còn trùng tên pháp lý")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses staff binding someone else's account or campaign", async () => {
    state.userHandler = bindReads({ acc: account({ owner_user_id: OTHER }) })
    expect((await bindAccount(ACCOUNT, null, bindForm()))?.ok).toBe(false)
    state.userHandler = bindReads({ camp: campaign({ organizer_id: OTHER }) })
    expect((await bindAccount(ACCOUNT, null, bindForm()))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("stops before the service role when the user's token is rejected", async () => {
    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWT invalid" } })
    const result = await bindAccount(ACCOUNT, null, bindForm())
    expect(result).toEqual({ ok: false, message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại." })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("rejects tampered ids", async () => {
    expect((await bindAccount("x", null, bindForm()))?.ok).toBe(false)
    expect((await bindAccount(ACCOUNT, null, bindForm("nope")))?.ok).toBe(false)
    expect(state.userCalls).toHaveLength(0)
  })
})

describe("releaseAccount", () => {
  const bound = { id: "b", campaign_id: CAMPAIGN, bound_at: "2026-11-01", released_at: null }

  it("releases the account of the organizer's draft through the service-role RPC", async () => {
    state.userHandler = bindReads({ acc: account({ bindings: [bound] }), camp: campaign({ status: "draft" }) })
    state.serviceHandler = () => ({ data: "b" })

    const result = await releaseAccount(ACCOUNT, null, new FormData())

    expect(result?.ok).toBe(true)
    const rpc = state.serviceCalls.find((c) => c.target === "rpc:release_account_binding")
    expect(op(rpc, "args")).toEqual([{ p_receiving_account_id: ACCOUNT, p_actor_id: USER, p_reason: null }])
  })

  it("releases the account of a give campaign sent back for changes (DOS/Give#38)", async () => {
    state.userHandler = bindReads({
      acc: account({ bindings: [bound] }),
      camp: campaign({ status: "changes_requested", type: "give" }),
    })
    state.serviceHandler = () => ({ data: "b" })
    expect((await releaseAccount(ACCOUNT, null, new FormData()))?.ok).toBe(true)
    expect(state.serviceCalls.some((c) => c.target === "rpc:release_account_binding")).toBe(true)
  })

  it("explains why a give campaign sent back for changes keeps an account that received money", async () => {
    state.userHandler = bindReads({
      acc: account({ bindings: [bound] }),
      camp: campaign({ status: "changes_requested", type: "give" }),
    })
    state.serviceHandler = () => ({
      error: { code: "23514", message: "GIVE_BINDING_NOT_RELEASABLE: campaign changes_requested since " },
    })
    const result = await releaseAccount(ACCOUNT, null, new FormData())
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("đã nhận giao dịch")
  })

  it("does not ask for a back project sent back for changes", async () => {
    state.userHandler = bindReads({
      acc: account({ bindings: [bound] }),
      camp: campaign({ status: "changes_requested", type: "back" }),
    })
    expect((await releaseAccount(ACCOUNT, null, new FormData()))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("does not ask while the campaign is in review or live", async () => {
    state.userHandler = bindReads({ acc: account({ bindings: [bound] }), camp: campaign({ status: "live" }) })
    const result = await releaseAccount(ACCOUNT, null, new FormData())
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("Chưa nhả được tài khoản")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses someone else's account and an account with no binding", async () => {
    state.userHandler = bindReads({ acc: account({ owner_user_id: OTHER, bindings: [bound] }) })
    expect((await releaseAccount(ACCOUNT, null, new FormData()))?.message).toContain("Không tìm thấy tài khoản nhận")
    state.userHandler = bindReads()
    expect((await releaseAccount(ACCOUNT, null, new FormData()))?.message).toContain("không gắn với chiến dịch nào")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("explains the database's refusal for an ended campaign", async () => {
    state.userHandler = bindReads({ acc: account({ bindings: [bound] }), camp: campaign({ status: "closed" }) })
    state.serviceHandler = () => ({ error: { code: "23514", message: "GIVE_BINDING_HAS_OPEN_TRANSACTIONS" } })
    const result = await releaseAccount(ACCOUNT, null, new FormData())
    expect(result?.message).toContain("chưa được đối chiếu")
  })
})
