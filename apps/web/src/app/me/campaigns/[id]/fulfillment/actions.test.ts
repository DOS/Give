import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const OTHER = "99999999-9999-4999-8999-999999999999"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const P1 = "c0000000-0000-4000-8000-000000000001"
const P2 = "c0000000-0000-4000-8000-000000000002"

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

const { setFulfillment } = await import("./actions")

function campaign(fields: Record<string, unknown> = {}): Handler {
  const row = { id: CAMPAIGN, slug: "ao-abcde", organizer_id: USER, type: "back", status: "succeeded", ...fields }
  return (call) => (call.target === "rpc:managed_campaigns" ? { data: row } : undefined)
}

function form(entries: [string, string][]) {
  const f = new FormData()
  for (const [k, v] of entries) f.append(k, v)
  return f
}

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.userHandler = campaign()
  state.serviceHandler = () => ({ data: 2 })
})

describe("setFulfillment", () => {
  it("updates the ticked pledges with the bulk status and note", async () => {
    const result = await setFulfillment(
      CAMPAIGN,
      null,
      form([
        ["contribution_id", P1],
        ["contribution_id", P2],
        ["contribution_id", P1],
        ["status", "shipped"],
        ["note", " Đã gửi GHN ngày 10/03 "],
        [`status_${P1}`, "issue"],
      ])
    )
    expect(result).toEqual({ ok: true, message: "Đã cập nhật 2 lượt ủng hộ: Đã gửi đi." })
    expect(op(state.serviceCalls[0], "args")).toEqual([
      {
        p_actor_id: USER,
        p_campaign_id: CAMPAIGN,
        p_contribution_ids: [P1, P2],
        p_status: "shipped",
        p_note: "Đã gửi GHN ngày 10/03",
      },
    ])
  })

  it("updates one pledge from its own row, ignoring the ticks and the bulk fields", async () => {
    state.serviceHandler = () => ({ data: 1 })
    const result = await setFulfillment(
      CAMPAIGN,
      null,
      form([
        ["contribution_id", P2],
        ["status", "shipped"],
        ["only", P1],
        [`status_${P1}`, "delivered"],
        [`note_${P1}`, ""],
      ])
    )
    expect(result?.ok).toBe(true)
    expect(op(state.serviceCalls[0], "args")?.[0]).toMatchObject({
      p_contribution_ids: [P1],
      p_status: "delivered",
      p_note: null,
    })
  })

  it("refuses nothing ticked, a bad status, a long note and a forged id", async () => {
    expect((await setFulfillment(CAMPAIGN, null, form([["status", "shipped"]])))?.message).toContain("Chọn ít nhất")
    expect(
      (
        await setFulfillment(
          CAMPAIGN,
          null,
          form([
            ["contribution_id", P1],
            ["status", "lost"],
          ])
        )
      )?.message
    ).toContain("Chọn trạng thái")
    expect(
      (
        await setFulfillment(
          CAMPAIGN,
          null,
          form([
            ["contribution_id", P1],
            ["status", "shipped"],
            ["note", "x".repeat(501)],
          ])
        )
      )?.message
    ).toContain("500 ký tự")
    expect(
      (
        await setFulfillment(
          CAMPAIGN,
          null,
          form([
            ["contribution_id", "1; drop"],
            ["status", "shipped"],
          ])
        )
      )?.ok
    ).toBe(false)
    expect(state.serviceCalls).toEqual([])
  })

  it("refuses more than one batch", async () => {
    const entries: [string, string][] = Array.from({ length: 501 }, (_, i) => [
      "contribution_id",
      `c0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    ])
    entries.push(["status", "shipped"])
    expect((await setFulfillment(CAMPAIGN, null, form(entries)))?.message).toContain("từ 1 đến 500")
    expect(state.serviceCalls).toEqual([])
  })

  it.each([
    ["a live campaign", { status: "live" }],
    ["a failed campaign", { status: "failed" }],
    ["a give campaign", { type: "give", status: "succeeded" }],
  ])("refuses %s", async (_label, fields) => {
    state.userHandler = campaign(fields)
    const result = await setFulfillment(
      CAMPAIGN,
      null,
      form([
        ["contribution_id", P1],
        ["status", "shipped"],
      ])
    )
    expect(result?.message).toContain("đã gây quỹ thành công")
    expect(state.serviceCalls).toEqual([])
  })

  it("refuses someone else's campaign, and words a pledge that is no longer paid", async () => {
    state.userHandler = campaign({ organizer_id: OTHER })
    expect(
      (
        await setFulfillment(
          CAMPAIGN,
          null,
          form([
            ["contribution_id", P1],
            ["status", "shipped"],
          ])
        )
      )?.message
    ).toContain("Không tìm thấy chiến dịch")
    expect(state.serviceCalls).toEqual([])
    state.userHandler = campaign()
    state.serviceHandler = () => ({ error: { message: "GIVE_PLEDGE_NOT_FULFILLABLE" } })
    expect(
      (
        await setFulfillment(
          CAMPAIGN,
          null,
          form([
            ["contribution_id", P1],
            ["status", "shipped"],
          ])
        )
      )?.message
    ).toContain("không còn ở trạng thái đã thanh toán")
  })
})
