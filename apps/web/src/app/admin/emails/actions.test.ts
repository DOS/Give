import { revalidatePath } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler, type Result } from "@/test/fake-db"

const ADMIN = "66666666-6666-4666-8666-666666666666"
const ROW = "33333333-3333-4333-8333-333333333333"

const state = vi.hoisted(() => ({
  session: true,
  responses: {} as Record<string, Result>,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    state.session ? { user: { id: ADMIN, email: null, name: null }, accessToken: "token" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.responses[call.target], state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { retryEmail } = await import("./actions")

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear()
  state.session = true
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.responses = { "rpc:is_admin": { data: true } }
  state.serviceHandler = () => ({ data: "pending" })
})

describe("retryEmail", () => {
  it("sends a dead email again as the admin actor", async () => {
    const result = await retryEmail(ROW, null, new FormData())
    expect(result?.ok).toBe(true)
    expect(state.userCalls.map((c) => c.target)).toEqual(["rpc:is_admin"])
    expect(state.serviceCalls.map((c) => c.target)).toEqual(["rpc:retry_outbox"])
    expect(op(state.serviceCalls[0], "args")).toEqual([{ p_actor_id: ADMIN, p_id: ROW }])
    expect(revalidatePath).toHaveBeenCalledWith("/admin/emails")
  })

  it("refuses a signed-out visitor, a non-admin and a malformed id without calling the database", async () => {
    state.session = false
    expect((await retryEmail(ROW, null, new FormData()))?.ok).toBe(false)
    state.session = true
    expect((await retryEmail("nope", null, new FormData()))?.ok).toBe(false)
    state.responses = { "rpc:is_admin": { data: false } }
    expect(await retryEmail(ROW, null, new FormData())).toEqual({
      ok: false,
      message: "Chỉ quản trị viên mới gửi lại được email.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("explains a row someone already sent again", async () => {
    state.serviceHandler = () => ({ error: { code: "23514", message: "GIVE_OUTBOX_NOT_DEAD" } })
    const result = await retryEmail(ROW, null, new FormData())
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("có người đã gửi lại")
  })

  it("explains a row too old to send again", async () => {
    state.serviceHandler = () => ({ error: { code: "23514", message: "GIVE_OUTBOX_EXPIRED" } })
    const result = await retryEmail(ROW, null, new FormData())
    expect(result?.message).toContain("đã quá lâu")
  })
})
