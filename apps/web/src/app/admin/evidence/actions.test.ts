import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const MODERATOR = "66666666-6666-4666-8666-666666666666"
const EVIDENCE = "44444444-4444-4444-8444-444444444444"

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: MODERATOR, email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { moderateEvidence } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const rpcArgs = () =>
  op(
    state.serviceCalls.find((c) => c.target === "rpc:moderate_evidence"),
    "args"
  )?.[0]

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.userHandler = (call) => (call.target === "rpc:is_admin" ? { data: true } : undefined)
  state.serviceHandler = () => ({ data: 1 })
})

describe("moderateEvidence", () => {
  it("checks the moderator role with the user's own token, then hides with a reason", async () => {
    const result = await moderateEvidence(EVIDENCE, null, form({ decision: "hide", reason: " Lộ số CCCD " }))
    expect(result?.ok).toBe(true)
    expect(op(state.userCalls[0], "args")?.[0]).toEqual({ p_roles: ["moderator", "admin"] })
    expect(rpcArgs()).toEqual({
      p_evidence_id: EVIDENCE,
      p_actor_id: MODERATOR,
      p_hidden: true,
      p_reason: "Lộ số CCCD",
    })
  })

  it("keeps or shows again an image without a reason", async () => {
    await moderateEvidence(EVIDENCE, null, form({ decision: "show", reason: "" }))
    expect(rpcArgs()).toMatchObject({ p_hidden: false, p_reason: null })
  })

  it("needs a reason to hide", async () => {
    const result = await moderateEvidence(EVIDENCE, null, form({ decision: "hide", reason: "  " }))
    expect(result?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses anyone who is not a moderator or admin before the service call", async () => {
    state.userHandler = () => ({ data: false })
    const result = await moderateEvidence(EVIDENCE, null, form({ decision: "hide", reason: "x" }))
    expect(result?.message).toContain("Chỉ kiểm duyệt viên")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a forged session (the token check fails) and a bad id or decision", async () => {
    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWT invalid" } })
    expect((await moderateEvidence(EVIDENCE, null, form({ decision: "hide", reason: "x" })))?.ok).toBe(false)
    state.userHandler = (call) => (call.target === "rpc:is_admin" ? { data: true } : undefined)
    expect((await moderateEvidence("nope", null, form({ decision: "hide", reason: "x" })))?.ok).toBe(false)
    expect((await moderateEvidence(EVIDENCE, null, form({ decision: "delete", reason: "x" })))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })
})
