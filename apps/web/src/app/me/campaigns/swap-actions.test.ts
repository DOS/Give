import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const OTHER = "99999999-9999-4999-8999-999999999999"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const OLD_ACCOUNT = "44444444-4444-4444-8444-444444444444"
const NEW_ACCOUNT = "55555555-5555-4555-8555-555555555555"
const BINDING = "66666666-6666-4666-8666-666666666666"
const REQUEST = "77777777-7777-4777-8777-777777777777"

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

const { cancelAccountSwap, requestAccountSwap } = await import("./swap-actions")

function swapForm(values: Record<string, string> = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries({
    account_id: NEW_ACCOUNT,
    reason: " Ngân hàng đã đóng tài khoản. ",
    ...values,
  }))
    form.set(key, value)
  return form
}

const organizer = { user_id: USER, legal_name: "Nguyễn Thị Đào", verification_status: "verified" }

interface Reads {
  campaign?: unknown
  account?: unknown
  bindings?: unknown[]
  transactions?: unknown[]
  swaps?: unknown[]
}

/** User-token reads: the campaign, the new account, the active binding, its transactions and the requests. */
function reads({
  campaign = { id: CAMPAIGN, organizer_id: USER, status: "live", type: "give" },
  account = {
    id: NEW_ACCOUNT,
    owner_user_id: USER,
    channel: "statement_import",
    verification_status: "verified",
    account_name: "NGUYEN THI DAO",
    bindings: [],
  },
  bindings = [{ id: BINDING, receiving_account_id: OLD_ACCOUNT }],
  transactions = [{ id: "t1" }],
  swaps = [],
}: Reads = {}): Handler {
  return (call) => {
    if (call.target === "rpc:managed_campaigns") return { data: campaign }
    if (call.target === "receiving_accounts") return { data: account }
    if (call.target === "account_bindings") return { data: bindings }
    if (call.target === "organizers") return { data: organizer }
    if (call.target === "bank_transactions") return { data: transactions }
    if (call.target === "account_swap_requests") return { data: swaps }
    return undefined
  }
}

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.userHandler = reads()
  state.serviceHandler = () => ({ data: REQUEST })
})

describe("requestAccountSwap", () => {
  it("asks for a swap of a live campaign's account with the trimmed reason", async () => {
    const result = await requestAccountSwap(CAMPAIGN, null, swapForm())
    expect(result?.ok).toBe(true)
    expect(state.serviceCalls.map((c) => c.target)).toEqual(["rpc:request_account_swap"])
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_campaign_id: CAMPAIGN,
        p_new_receiving_account_id: NEW_ACCOUNT,
        p_actor_id: USER,
        p_reason: "Ngân hàng đã đóng tài khoản.",
      },
    ])
    // Whether the old binding holds money is read with the user's token.
    expect(
      op(
        state.userCalls.find((c) => c.target === "bank_transactions"),
        "eq"
      )
    ).toEqual(["binding_id", BINDING])
  })

  it("lets a suspended campaign ask too", async () => {
    state.userHandler = reads({ campaign: { id: CAMPAIGN, organizer_id: USER, status: "suspended", type: "give" } })
    expect((await requestAccountSwap(CAMPAIGN, null, swapForm()))?.ok).toBe(true)
  })

  it("sends a campaign under changes whose account recorded nothing to release it instead", async () => {
    state.userHandler = reads({
      campaign: { id: CAMPAIGN, organizer_id: USER, status: "changes_requested", type: "give" },
      transactions: [],
    })
    const result = await requestAccountSwap(CAMPAIGN, null, swapForm())
    expect(result).toEqual({ ok: false, message: expect.stringContaining("nhả tài khoản đó rồi gắn tài khoản khác") })
    expect(state.serviceCalls).toEqual([])
  })

  it("lets a campaign under changes ask when its account holds money history", async () => {
    state.userHandler = reads({
      campaign: { id: CAMPAIGN, organizer_id: USER, status: "changes_requested", type: "give" },
    })
    expect((await requestAccountSwap(CAMPAIGN, null, swapForm()))?.ok).toBe(true)
  })

  it.each([
    ["an approved campaign", { status: "approved", type: "give" }],
    ["a back campaign", { status: "live", type: "back" }],
    ["a closed campaign", { status: "closed", type: "give" }],
  ])("refuses %s", async (_label, fields) => {
    state.userHandler = reads({ campaign: { id: CAMPAIGN, organizer_id: USER, ...fields } })
    const result = await requestAccountSwap(CAMPAIGN, null, swapForm())
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("Chỉ đổi được tài khoản nhận")
    expect(state.serviceCalls).toEqual([])
  })

  it("refuses a campaign of someone else, and an account of someone else", async () => {
    state.userHandler = reads({ campaign: { id: CAMPAIGN, organizer_id: OTHER, status: "live", type: "give" } })
    expect((await requestAccountSwap(CAMPAIGN, null, swapForm()))?.message).toContain("Không tìm thấy chiến dịch")
    state.userHandler = reads({ account: { id: NEW_ACCOUNT, owner_user_id: OTHER, bindings: [] } })
    expect((await requestAccountSwap(CAMPAIGN, null, swapForm()))?.message).toContain("Không tìm thấy tài khoản nhận")
    expect(state.serviceCalls).toEqual([])
  })

  it("refuses an unusable, bound or same new account, a missing reason and a second pending request", async () => {
    state.userHandler = reads({
      account: {
        id: NEW_ACCOUNT,
        owner_user_id: USER,
        verification_status: "pending",
        account_name: "X",
        bindings: [],
      },
    })
    expect((await requestAccountSwap(CAMPAIGN, null, swapForm()))?.message).toContain("Tài khoản mới chưa dùng được")
    state.userHandler = reads({
      account: {
        id: NEW_ACCOUNT,
        owner_user_id: USER,
        channel: "statement_import",
        verification_status: "verified",
        account_name: "NGUYEN THI DAO",
        bindings: [{ id: "b2", campaign_id: OTHER, bound_at: "2026-11-01T00:00:00Z", released_at: null }],
      },
    })
    expect((await requestAccountSwap(CAMPAIGN, null, swapForm()))?.message).toContain(
      "đang gắn với một chiến dịch khác"
    )
    state.userHandler = reads({ bindings: [{ id: BINDING, receiving_account_id: NEW_ACCOUNT }] })
    expect((await requestAccountSwap(CAMPAIGN, null, swapForm()))?.message).toContain("khác với tài khoản đang gắn")
    state.userHandler = reads({ swaps: [{ id: REQUEST, status: "pending" }] })
    expect((await requestAccountSwap(CAMPAIGN, null, swapForm()))?.message).toContain("đang chờ duyệt")
    state.userHandler = reads()
    expect((await requestAccountSwap(CAMPAIGN, null, swapForm({ reason: "  " })))?.message).toContain("Ghi lý do")
    expect(state.serviceCalls).toEqual([])
  })

  it("words a database refusal", async () => {
    state.serviceHandler = () => ({ error: { code: "23505", message: "GIVE_SWAP_ALREADY_PENDING" } })
    expect(await requestAccountSwap(CAMPAIGN, null, swapForm())).toEqual({
      ok: false,
      message: "Chiến dịch đã có một yêu cầu đổi tài khoản đang chờ duyệt.",
    })
  })
})

describe("cancelAccountSwap", () => {
  it("withdraws the organizer's own request", async () => {
    state.userHandler = reads({ swaps: [{ id: REQUEST, status: "pending" }] })
    state.serviceHandler = () => ({ data: "cancelled" })
    expect(await cancelAccountSwap(REQUEST, CAMPAIGN, null, new FormData())).toEqual({
      ok: true,
      message: "Đã rút yêu cầu đổi tài khoản.",
    })
    expect(op(state.serviceCalls[0], "args")).toEqual([{ p_request_id: REQUEST, p_actor_id: USER }])
  })

  it("refuses a request that is not one of the campaign's, or a campaign of someone else", async () => {
    state.userHandler = reads({ swaps: [] })
    expect((await cancelAccountSwap(REQUEST, CAMPAIGN, null, new FormData()))?.ok).toBe(false)
    state.userHandler = reads({
      campaign: { id: CAMPAIGN, organizer_id: OTHER, status: "live", type: "give" },
      swaps: [{ id: REQUEST, status: "pending" }],
    })
    expect((await cancelAccountSwap(REQUEST, CAMPAIGN, null, new FormData()))?.ok).toBe(false)
    expect(state.serviceCalls).toEqual([])
  })
})
