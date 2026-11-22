import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const OWNER = "11111111-1111-4111-8111-111111111111"
const EDITOR = "22222222-2222-4222-8222-222222222222"
const OUTSIDER = "99999999-9999-4999-8999-999999999999"
const CAMPAIGN = "33333333-3333-4333-8333-333333333333"

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  session: { user: { id: "11111111-1111-4111-8111-111111111111", email: null, name: null }, accessToken: "tok" } as {
    user: { id: string; email: string | null; name: string | null }
    accessToken: string
  } | null,
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => state.session),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb(() => undefined, state.serviceCalls),
}))

const { saveImpactReport } = await import("./impact-report-actions")

function makeForm(overrides: Record<string, string | string[]> = {}) {
  const f = new FormData()
  f.set("summary", typeof overrides.summary === "string" ? overrides.summary : "## Tổng kết chiến dịch")
  f.set("intent", typeof overrides.intent === "string" ? overrides.intent : "draft")
  const labels = Array.isArray(overrides.highlight_label) ? overrides.highlight_label : ["Học sinh"]
  const values = Array.isArray(overrides.highlight_value) ? overrides.highlight_value : ["120 em"]
  for (const l of labels) f.append("highlight_label", l)
  for (const v of values) f.append("highlight_value", v)
  return f
}

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  revalidatePathMock.mockReset()
  state.session = { user: { id: OWNER, email: null, name: null }, accessToken: "tok" }
  state.userHandler = (call) => {
    if (call.target === "rpc:managed_campaigns") {
      return { data: { id: CAMPAIGN, slug: "xay-truong", status: "closed", organizer_id: OWNER } }
    }
    if (call.target === "rpc:upsert_campaign_impact_report") {
      return { data: { campaign_id: CAMPAIGN, published_at: null } }
    }
    return undefined
  }
})

describe("saveImpactReport (DOS/Give#314)", () => {
  it("refuses signed-out callers and invalid campaign ids", async () => {
    state.session = null
    expect(await saveImpactReport(CAMPAIGN, null, makeForm())).toEqual({
      ok: false,
      message: expect.stringContaining("đăng nhập"),
    })

    state.session = { user: { id: OWNER, email: null, name: null }, accessToken: "tok" }
    expect(await saveImpactReport("not-a-uuid", null, makeForm())).toEqual({
      ok: false,
      message: expect.stringContaining("Không tìm thấy"),
    })
  })

  it("allows campaign owner to draft and publish on closed campaign via authenticated JWT only", async () => {
    const res = await saveImpactReport(CAMPAIGN, null, makeForm({ intent: "publish" }))
    expect(res).toEqual({ ok: true, message: expect.stringContaining("Đã công bố") })
    const rpcCall = state.userCalls.find((c) => c.target === "rpc:upsert_campaign_impact_report")
    expect(op(rpcCall, "args")?.[0]).toEqual({
      p_campaign_id: CAMPAIGN,
      p_summary: "## Tổng kết chiến dịch",
      p_highlights: [{ label: "Học sinh", value: "120 em" }],
      p_publish: true,
    })
    // Never touches service_role
    expect(state.serviceCalls).toHaveLength(0)
    expect(revalidatePathMock).toHaveBeenCalledWith(`/me/campaigns/${CAMPAIGN}`)
    expect(revalidatePathMock).toHaveBeenCalledWith("/campaigns/xay-truong")
  })

  it("allows active co-organizer editor (#264 narrative scope) to save impact report", async () => {
    state.session = { user: { id: EDITOR, email: null, name: null }, accessToken: "tok" }
    state.userHandler = (call) => {
      if (call.target === "rpc:managed_campaigns") {
        return { data: { id: CAMPAIGN, slug: "xay-truong", status: "succeeded", organizer_id: OWNER } }
      }
      if (call.target === "rpc:my_campaign_roles") {
        return { data: [{ campaign_id: CAMPAIGN, role: "editor" }] }
      }
      if (call.target === "rpc:upsert_campaign_impact_report") {
        return { data: { campaign_id: CAMPAIGN, published_at: null } }
      }
      return undefined
    }

    const res = await saveImpactReport(CAMPAIGN, null, makeForm({ intent: "draft" }))
    expect(res).toEqual({ ok: true, message: expect.stringContaining("Đã lưu bản nháp") })
  })

  it("refuses outsider / staff without owner or editor role", async () => {
    state.session = { user: { id: OUTSIDER, email: null, name: null }, accessToken: "tok" }
    state.userHandler = (call) => {
      if (call.target === "rpc:managed_campaigns") {
        return { data: { id: CAMPAIGN, slug: "xay-truong", status: "closed", organizer_id: OWNER } }
      }
      if (call.target === "rpc:my_campaign_roles") return { data: [] }
      return undefined
    }

    const res = await saveImpactReport(CAMPAIGN, null, makeForm())
    expect(res?.ok).toBe(false)
    expect(state.userCalls.some((c) => c.target === "rpc:upsert_campaign_impact_report")).toBe(false)
  })

  it("refuses live or draft campaigns before calling upsert RPC", async () => {
    state.userHandler = (call) => {
      if (call.target === "rpc:managed_campaigns") {
        return { data: { id: CAMPAIGN, slug: "xay-truong", status: "live", organizer_id: OWNER } }
      }
      return undefined
    }

    const res = await saveImpactReport(CAMPAIGN, null, makeForm())
    expect(res).toEqual({
      ok: false,
      message: expect.stringContaining("kết thúc"),
    })
    expect(state.userCalls.some((c) => c.target === "rpc:upsert_campaign_impact_report")).toBe(false)
  })

  it("surfaces GIVE_IMPACT_REPORT_ALREADY_PUBLISHED cleanly", async () => {
    state.userHandler = (call) => {
      if (call.target === "rpc:managed_campaigns") {
        return { data: { id: CAMPAIGN, slug: "xay-truong", status: "closed", organizer_id: OWNER } }
      }
      if (call.target === "rpc:upsert_campaign_impact_report") {
        return { error: { code: "23514", message: "GIVE_IMPACT_REPORT_ALREADY_PUBLISHED" } }
      }
      return undefined
    }

    const res = await saveImpactReport(CAMPAIGN, null, makeForm({ intent: "draft" }))
    expect(res).toEqual({
      ok: false,
      message: expect.stringContaining("không thể chuyển về bản nháp"),
    })
  })
})
