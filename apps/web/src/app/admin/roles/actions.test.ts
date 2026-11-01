import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const MEMBER = "28ad0000-0000-4000-8000-00000000000b"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  signedIn: true,
  self: "28ad0000-0000-4000-8000-00000000000a",
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    state.signedIn ? { user: { id: state.self, email: "toi@vidu.com", name: null }, accessToken: "token" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({ dbAs: () => fakeDb((call) => state.handler(call), state.calls) }))

const { grantRole, revokeRole } = await import("./actions")

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

beforeEach(() => {
  state.calls.length = 0
  state.handler = () => undefined
  state.signedIn = true
})

describe("grantRole", () => {
  it("passes the trimmed user, role and reason to grant_admin_role", async () => {
    const result = await grantRole(null, form({ user: "  ban@vidu.com ", role: "moderator", reason: " Mới vào " }))
    expect(result).toEqual({ ok: true, message: "Đã cấp quyền Kiểm duyệt viên cho ban@vidu.com." })
    expect(state.calls.map((c) => c.target)).toEqual(["rpc:grant_admin_role"])
    expect(op(state.calls[0], "args")?.[0]).toEqual({
      p_user: "ban@vidu.com",
      p_role: "moderator",
      p_reason: "Mới vào",
    })
  })

  it("changes a role by user id without echoing the id", async () => {
    const result = await grantRole(null, form({ user: MEMBER, role: "finance" }))
    expect(result).toEqual({ ok: true, message: "Đã cấp quyền Tài chính." })
    expect(op(state.calls[0], "args")?.[0]).toEqual({ p_user: MEMBER, p_role: "finance", p_reason: null })
  })

  it("refuses demoting yourself from the grant form", async () => {
    for (const user of [state.self, state.self.toUpperCase(), "TOI@vidu.com"]) {
      const result = await grantRole(null, form({ user, role: "moderator" }))
      expect(result?.ok).toBe(false)
      expect(result?.message).toContain("chính mình")
    }
    expect(state.calls).toHaveLength(0)
  })

  it("lets you demote yourself from your own confirmed row", async () => {
    expect((await grantRole(null, form({ user: state.self, role: "finance", confirm_self: "yes" })))?.ok).toBe(true)
    expect(state.calls.map((c) => c.target)).toEqual(["rpc:grant_admin_role"])
  })

  it.each([
    ["GIVE_ROLE_UNCHANGED", "đã có quyền này"],
    ["GIVE_USER_NOT_FOUND", "Không tìm thấy tài khoản"],
    ["GIVE_USER_INELIGIBLE", "chưa xác nhận email"],
    ["GIVE_USER_AMBIGUOUS", "nhiều tài khoản"],
  ])("explains %s", async (code, text) => {
    state.handler = () => ({ error: { code: "23514", message: code } })
    expect((await grantRole(null, form({ user: "ban@vidu.com", role: "moderator" })))?.message).toContain(text)
  })

  it("refuses an unknown role without calling the database", async () => {
    expect(await grantRole(null, form({ user: "ban@vidu.com", role: "owner" }))).toEqual({
      ok: false,
      message: "Quyền không hợp lệ.",
    })
    expect(state.calls).toHaveLength(0)
  })

  it("refuses an empty user without calling the database", async () => {
    expect((await grantRole(null, form({ user: "   ", role: "moderator" })))?.ok).toBe(false)
    expect(state.calls).toHaveLength(0)
  })

  it("surfaces the database's refusal for non-admins", async () => {
    state.handler = () => ({ error: { code: "42501", message: "GIVE_ADMIN_REQUIRED" } })
    expect(await grantRole(null, form({ user: "ban@vidu.com", role: "admin" }))).toEqual({
      ok: false,
      message: "Chỉ quản trị viên mới được cấp hoặc thu quyền.",
    })
  })

  it("explains that the last admin cannot be demoted", async () => {
    state.handler = () => ({ error: { code: "23514", message: "GIVE_LAST_ADMIN" } })
    const result = await grantRole(null, form({ user: MEMBER, role: "moderator" }))
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("quản trị viên cuối cùng")
  })

  it("asks a signed-out admin to sign in again", async () => {
    state.signedIn = false
    expect((await grantRole(null, form({ user: "ban@vidu.com", role: "moderator" })))?.message).toBe(
      "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
    )
    expect(state.calls).toHaveLength(0)
  })
})

describe("revokeRole", () => {
  it("passes the user id and reason to revoke_admin_role", async () => {
    expect(await revokeRole(MEMBER, null, form({ reason: "Nghỉ việc" }))).toEqual({
      ok: true,
      message: "Đã thu quyền.",
    })
    expect(state.calls.map((c) => c.target)).toEqual(["rpc:revoke_admin_role"])
    expect(op(state.calls[0], "args")?.[0]).toEqual({ p_user_id: MEMBER, p_reason: "Nghỉ việc" })
  })

  it("refuses a tampered user id without calling the database", async () => {
    expect((await revokeRole("not-a-uuid", null, form({})))?.ok).toBe(false)
    expect(state.calls).toHaveLength(0)
  })

  it("explains that the last admin cannot be revoked", async () => {
    state.handler = () => ({ error: { code: "23514", message: "GIVE_LAST_ADMIN" } })
    const result = await revokeRole(MEMBER, null, form({}))
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("quản trị viên cuối cùng")
  })

  it("surfaces the database's refusal for non-admins", async () => {
    state.handler = () => ({ error: { code: "42501", message: "GIVE_ADMIN_REQUIRED" } })
    expect((await revokeRole(MEMBER, null, form({})))?.message).toBe("Chỉ quản trị viên mới được cấp hoặc thu quyền.")
  })
})
