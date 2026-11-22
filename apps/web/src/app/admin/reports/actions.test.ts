import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const MODERATOR = "66666666-6666-4666-8666-666666666666"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  signedIn: true,
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
const dbAsMock = vi.hoisted(() =>
  vi.fn((_token?: string) => fakeDb((call) => state.userHandler(call), state.userCalls))
)

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    state.signedIn ? { user: { id: MODERATOR, email: "mod@dos.me", name: "Mod" }, accessToken: "mod-token" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: dbAsMock,
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { moderateCampaignReports } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const rpcArgs = () =>
  op(
    state.serviceCalls.find((c) => c.target === "rpc:moderate_campaign_reports"),
    "args"
  )?.[0]

beforeEach(() => {
  revalidatePathMock.mockClear()
  dbAsMock.mockClear()
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.signedIn = true
  state.userHandler = (call) => (call.target === "rpc:is_admin" ? { data: true } : undefined)
  state.serviceHandler = () => ({ data: 2 })
})

describe("moderateCampaignReports (DOS/Give#98)", () => {
  it("verifies moderator/admin role with the caller's own token before dismissing reports", async () => {
    const res = await moderateCampaignReports(CAMPAIGN, null, form({ action: "dismiss", reason: "  Đã xác minh  " }))
    expect(res).toEqual({ ok: true, message: "Đã bác bỏ 2 báo cáo của chiến dịch." })
    expect(dbAsMock).toHaveBeenCalledWith("mod-token")
    expect(state.userCalls[0].target).toBe("rpc:is_admin")
    expect(op(state.userCalls[0], "args")?.[0]).toEqual({ p_roles: ["moderator", "admin"] })
    expect(rpcArgs()).toEqual({
      p_campaign_id: CAMPAIGN,
      p_actor_id: MODERATOR,
      p_action: "dismiss",
      p_reason: "Đã xác minh",
      p_public_note: null,
    })
    expect(revalidatePathMock.mock.calls).toEqual([["/admin/reports"]])
  })

  it("supports ask_organizer, distinguishing sent inquiries from zero-open-report replays", async () => {
    const sent = await moderateCampaignReports(
      CAMPAIGN,
      null,
      form({ action: "ask_organizer", reason: "Đề nghị gửi hóa đơn bệnh viện." })
    )
    expect(sent?.ok).toBe(true)
    expect(sent?.message).toContain("Đã gửi câu hỏi cho người tổ chức")
    expect(revalidatePathMock.mock.calls).toEqual([["/admin/reports"], ["/me/notices"]])

    state.serviceHandler = () => ({ data: 0 })
    const replay = await moderateCampaignReports(
      CAMPAIGN,
      null,
      form({ action: "ask_organizer", reason: "Đề nghị gửi hóa đơn bệnh viện." })
    )
    expect(replay?.ok).toBe(true)
    expect(replay?.message).toContain("Không còn báo cáo mới nào")
  })

  it("supports suspend and revalidates organizer, public campaign, pledge, statement, and admin pages", async () => {
    const res = await moderateCampaignReports(
      CAMPAIGN,
      null,
      form({ action: "suspend", reason: "Chưa xác minh được người thụ hưởng." })
    )
    expect(res).toEqual({ ok: true, message: "Đã tạm dừng chiến dịch và chốt các báo cáo đang mở." })
    expect(rpcArgs()).toMatchObject({
      p_action: "suspend",
      p_reason: "Chưa xác minh được người thụ hưởng.",
      p_public_note: null,
    })
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/admin/reports"],
      ["/admin"],
      [`/me/campaigns/${CAMPAIGN}`],
      ["/me/campaigns"],
      ["/me/notices"],
      ["/campaigns/[slug]", "page"],
      ["/campaigns/[slug]/pledge", "page"],
      ["/campaigns/[slug]/statement", "page"],
      ["/me/pledges/[code]", "page"],
      ["/u/[handle]", "page"],
      ["/campaigns"],
      ["/"],
    ])
  })

  it("supports stop_payment_requests with a required public_note and revalidates organizer, contribution, notice, and pledge pages", async () => {
    const res = await moderateCampaignReports(
      CAMPAIGN,
      null,
      form({
        action: "stop_payment_requests",
        reason: "Nghi vấn gian lận hậu gây quỹ.",
        public_note: "  Give đang xác minh dự án này.  ",
      })
    )
    expect(res?.ok).toBe(true)
    expect(rpcArgs()).toEqual({
      p_campaign_id: CAMPAIGN,
      p_actor_id: MODERATOR,
      p_action: "stop_payment_requests",
      p_reason: "Nghi vấn gian lận hậu gây quỹ.",
      p_public_note: "Give đang xác minh dự án này.",
    })
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/admin/reports"],
      ["/admin/payment-requests"],
      [`/me/campaigns/${CAMPAIGN}`],
      ["/me/contributions"],
      ["/me/notices"],
      ["/campaigns/[slug]", "page"],
      ["/me/pledges/[code]", "page"],
    ])
  })

  it("validates inputs and refuses public_note on actions that publish none before touching the DB", async () => {
    state.signedIn = false
    expect(
      (await moderateCampaignReports(CAMPAIGN, null, form({ action: "dismiss", reason: "x" })))?.message
    ).toContain("Phiên đăng nhập")
    state.signedIn = true

    expect((await moderateCampaignReports("bad-id", null, form({ action: "dismiss", reason: "x" })))?.ok).toBe(false)
    expect((await moderateCampaignReports(CAMPAIGN, null, form({ action: "delete", reason: "x" })))?.ok).toBe(false)
    expect((await moderateCampaignReports(CAMPAIGN, null, form({ action: "dismiss", reason: "   " })))?.ok).toBe(false)
    expect(
      (await moderateCampaignReports(CAMPAIGN, null, form({ action: "dismiss", reason: "x".repeat(1001) })))?.ok
    ).toBe(false)
    expect(
      (
        await moderateCampaignReports(
          CAMPAIGN,
          null,
          form({ action: "stop_payment_requests", reason: "x", public_note: "   " })
        )
      )?.message
    ).toContain("Ghi chú công khai là bắt buộc")
    expect(
      (
        await moderateCampaignReports(
          CAMPAIGN,
          null,
          form({ action: "dismiss", reason: "x", public_note: "Tưởng được đăng" })
        )
      )?.message
    ).toBe("Thao tác không hợp lệ.")

    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses forged tokens and non-moderator roles (including finance) before calling service_role", async () => {
    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWT invalid" } })
    expect(
      (await moderateCampaignReports(CAMPAIGN, null, form({ action: "dismiss", reason: "x" })))?.message
    ).toContain("Phiên đăng nhập")

    state.userHandler = () => ({ data: false })
    expect(await moderateCampaignReports(CAMPAIGN, null, form({ action: "dismiss", reason: "x" }))).toEqual({
      ok: false,
      message: "Chỉ kiểm duyệt viên hoặc quản trị viên được xử lý báo cáo chiến dịch.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("words GIVE_SELF_REVIEW, GIVE_TRANSITION_NOT_ALLOWED and GIVE_PAYMENT_REQUESTS_NOT_STOPPABLE for the moderator", async () => {
    state.serviceHandler = () => ({ error: { code: "42501", message: "GIVE_SELF_REVIEW" } })
    expect(
      (await moderateCampaignReports(CAMPAIGN, null, form({ action: "dismiss", reason: "x" })))?.message
    ).toContain("chiến dịch do chính bạn tổ chức")

    state.serviceHandler = () => ({
      error: { code: "42501", message: "GIVE_TRANSITION_NOT_ALLOWED: closed -> suspended" },
    })
    expect(
      (await moderateCampaignReports(CAMPAIGN, null, form({ action: "suspend", reason: "x" })))?.message
    ).toContain("Chỉ tạm dừng được chiến dịch đã duyệt hoặc đang gây quỹ")

    state.serviceHandler = () => ({
      error: { code: "23514", message: "GIVE_PAYMENT_REQUESTS_NOT_STOPPABLE: give live" },
    })
    expect(
      (
        await moderateCampaignReports(
          CAMPAIGN,
          null,
          form({ action: "stop_payment_requests", reason: "x", public_note: "y" })
        )
      )?.message
    ).toContain("dự án có quà tặng đã đạt mục tiêu")
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
