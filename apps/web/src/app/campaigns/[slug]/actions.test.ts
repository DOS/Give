import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  signedIn: true,
}))

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    state.signedIn ? { user: { id: USER, email: null, name: null }, accessToken: "reporter-token" } : null
  ),
}))

const dbAsMock = vi.hoisted(() =>
  vi.fn((_token?: string) => fakeDb((call) => state.userHandler(call), state.userCalls))
)
vi.mock("@/lib/supabase", () => ({
  dbAs: dbAsMock,
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { reportCampaign } = await import("./actions")

function form(reasonCode?: string, details?: string) {
  const data = new FormData()
  if (reasonCode !== undefined) data.set("reason_code", reasonCode)
  if (details !== undefined) data.set("details", details)
  return data
}

const rpc = () => state.serviceCalls.find((c) => c.target === "rpc:report_campaign")

beforeEach(() => {
  dbAsMock.mockClear()
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.signedIn = true
  state.userHandler = (call) => (call.target === "campaigns" ? { data: { id: CAMPAIGN, status: "live" } } : undefined)
  state.serviceHandler = () => ({ data: "99999999-9999-4999-8999-999999999999" })
})

describe("reportCampaign (DOS/Give#98)", () => {
  it("verifies the reporter's token and public campaign status first, then calls give.report_campaign as service_role", async () => {
    const result = await reportCampaign(CAMPAIGN, null, form("fraud_or_impersonation", "  Mạo danh bệnh viện  "))
    expect(result).toEqual({
      ok: true,
      message: "Cảm ơn bạn. Đội kiểm duyệt Give đã nhận báo cáo và sẽ xem xét chiến dịch này.",
    })
    expect(dbAsMock).toHaveBeenCalledWith("reporter-token")
    expect(state.userCalls[0].target).toBe("campaigns")
    expect(op(state.userCalls[0], "select")).toEqual(["id, status"])
    expect(op(state.userCalls[0], "eq")).toEqual(["id", CAMPAIGN])
    expect(op(rpc(), "args")?.[0]).toEqual({
      p_campaign_id: CAMPAIGN,
      p_actor_id: USER,
      p_reason_code: "fraud_or_impersonation",
      p_details: "Mạo danh bệnh viện",
    })
  })

  it("accepts non-'other' reasons without details and requires details for 'other'", async () => {
    expect((await reportCampaign(CAMPAIGN, null, form("misuse_of_funds", "   ")))?.ok).toBe(true)
    expect(op(rpc(), "args")?.[0]).toMatchObject({ p_reason_code: "misuse_of_funds", p_details: null })

    state.serviceCalls.length = 0
    const missingDetails = await reportCampaign(CAMPAIGN, null, form("other", "  \t "))
    expect(missingDetails).toEqual({ ok: false, message: "Ghi chi tiết khi chọn lý do “Lý do khác”." })
    expect(state.serviceCalls).toHaveLength(0)

    const withDetails = await reportCampaign(CAMPAIGN, null, form("other", "Nêu rõ dấu hiệu"))
    expect(withDetails?.ok).toBe(true)
    expect(op(rpc(), "args")?.[0]).toMatchObject({ p_reason_code: "other", p_details: "Nêu rõ dấu hiệu" })
  })

  it("refuses signed-out visitors, invalid ids, unknown reasons and details over 1000 characters before DB calls", async () => {
    state.signedIn = false
    expect(await reportCampaign(CAMPAIGN, null, form("misuse_of_funds"))).toEqual({
      ok: false,
      message: "Hãy đăng nhập để báo cáo chiến dịch.",
    })
    state.signedIn = true

    expect((await reportCampaign("not-a-uuid", null, form("misuse_of_funds")))?.ok).toBe(false)
    expect((await reportCampaign(CAMPAIGN, null, form("spam")))?.message).toBe("Chọn lý do báo cáo.")
    expect((await reportCampaign(CAMPAIGN, null, form("misuse_of_funds", "x".repeat(1001))))?.message).toContain(
      "1000 ký tự"
    )
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses expired/forged tokens, missing campaigns and non-public campaigns before calling service_role", async () => {
    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWT expired" } })
    expect((await reportCampaign(CAMPAIGN, null, form("misuse_of_funds")))?.message).toContain("Phiên đăng nhập")

    state.userHandler = () => ({ data: null })
    expect(await reportCampaign(CAMPAIGN, null, form("misuse_of_funds"))).toEqual({
      ok: false,
      message: "Không tìm thấy chiến dịch công khai này.",
    })

    for (const status of ["draft", "in_review", "changes_requested", "approved", "suspended", "cancelled"]) {
      state.userHandler = () => ({ data: { id: CAMPAIGN, status } })
      const res = await reportCampaign(CAMPAIGN, null, form("misuse_of_funds"))
      expect(res, status).toEqual({ ok: false, message: "Không tìm thấy chiến dịch công khai này." })
    }
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("allows reporting public ended statuses (succeeded, failed, closed, settling)", async () => {
    for (const status of ["live", "settling", "succeeded", "failed", "closed"]) {
      state.serviceCalls.length = 0
      state.userHandler = () => ({ data: { id: CAMPAIGN, status } })
      expect((await reportCampaign(CAMPAIGN, null, form("false_or_misleading")))?.ok, status).toBe(true)
      expect(state.serviceCalls, status).toHaveLength(1)
    }
  })

  it("words self-report GIVE_NOT_ALLOWED and the 24-hour GIVE_REPORT_LIMIT from the database", async () => {
    state.serviceHandler = () => ({ error: { code: "42501", message: "GIVE_NOT_ALLOWED" } })
    expect(await reportCampaign(CAMPAIGN, null, form("fraud_or_impersonation"))).toEqual({
      ok: false,
      message: "Bạn không thể báo cáo chiến dịch của chính mình.",
    })

    state.serviceHandler = () => ({ error: { code: "23514", message: "GIVE_REPORT_LIMIT" } })
    expect((await reportCampaign(CAMPAIGN, null, form("fraud_or_impersonation")))?.message).toContain("24 giờ")
  })
})
