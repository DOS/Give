import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const EVIDENCE = "44444444-4444-4444-8444-444444444444"

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  signedIn: true,
}))

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    state.signedIn ? { user: { id: USER, email: null, name: null }, accessToken: "token" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { reportEvidence } = await import("./actions")

function form(reason?: string) {
  const data = new FormData()
  if (reason !== undefined) data.set("reason", reason)
  return data
}

const rpc = () => state.serviceCalls.find((c) => c.target === "rpc:report_evidence")

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.signedIn = true
  state.userHandler = (call) =>
    call.target === "public_disbursement_evidence" ? { data: [{ id: EVIDENCE }] } : undefined
  state.serviceHandler = () => ({ data: "r1" })
})

describe("reportEvidence", () => {
  it("checks the image is public with the reporter's own token, then reports it as that user", async () => {
    const result = await reportEvidence(EVIDENCE, null, form("  Lộ số CCCD  "))
    expect(result?.ok).toBe(true)
    expect(state.userCalls[0].target).toBe("public_disbursement_evidence")
    expect(op(state.userCalls[0], "eq")).toEqual(["id", EVIDENCE])
    expect(op(rpc(), "args")?.[0]).toEqual({ p_evidence_id: EVIDENCE, p_actor_id: USER, p_reason: "Lộ số CCCD" })
  })

  it("sends no reason when none is given", async () => {
    await reportEvidence(EVIDENCE, null, form())
    expect(op(rpc(), "args")?.[0]).toMatchObject({ p_reason: null })
  })

  it("asks a signed-out visitor to sign in and reports nothing", async () => {
    state.signedIn = false
    const result = await reportEvidence(EVIDENCE, null, form("x"))
    expect(result).toEqual({ ok: false, message: "Hãy đăng nhập để báo cáo ảnh." })
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a hidden or unknown image, a bad id and a rejected token before the service call", async () => {
    state.userHandler = () => ({ data: [] })
    expect((await reportEvidence(EVIDENCE, null, form()))?.message).toContain("đã bị ẩn")
    expect((await reportEvidence("not-a-uuid", null, form()))?.ok).toBe(false)
    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWT expired" } })
    expect((await reportEvidence(EVIDENCE, null, form()))?.message).toContain("Phiên đăng nhập")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a reason over 500 characters", async () => {
    const result = await reportEvidence(EVIDENCE, null, form("x".repeat(501)))
    expect(result?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("words the database's report limit", async () => {
    state.serviceHandler = () => ({ error: { code: "23514", message: "GIVE_REPORT_LIMIT" } })
    expect((await reportEvidence(EVIDENCE, null, form()))?.message).toContain("24 giờ")
  })
})
