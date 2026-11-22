import { revalidatePath } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getSession } from "@/lib/auth/session"
import type { Organizer } from "@/lib/campaigns"
import {
  ORGANIZER_BIO_TOO_LONG_MESSAGE,
  ORGANIZER_HANDLE_INVALID_MESSAGE,
  ORGANIZER_HANDLE_RESERVED_MESSAGE,
  ORGANIZER_HANDLE_TAKEN_MESSAGE,
} from "@/lib/organizer-handle"
import { publicProfileDbErrorMessage } from "@/lib/organizer-profile"
import { dbAs } from "@/lib/supabase"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }))
vi.mock("@/lib/supabase", () => ({
  dbAs: vi.fn(() => fakeDb((call) => state.handler(call), state.calls)),
}))

const { updateOrganizerPublicProfile } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

function existingOrganizer(overrides: Partial<Organizer> = {}): Organizer {
  return {
    user_id: USER,
    kind: "organization",
    legal_name: "Quỹ Bản Mây",
    display_name: "Quỹ Bản Mây",
    phone: "0901234567",
    handle: "quy-ban-may",
    bio: "Giới thiệu cũ",
    verification_status: "verified",
    verified_at: "2026-11-01T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.calls.length = 0
  state.handler = (call) => (op(call, "maybeSingle") ? { data: existingOrganizer() } : undefined)
  vi.mocked(getSession).mockResolvedValue({ user: { id: USER, email: null, name: null }, accessToken: "token" })
})

describe("updateOrganizerPublicProfile (DOS/Give#251)", () => {
  it("refuses signed-out callers before opening a database client", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect(await updateOrganizerPublicProfile(null, form({ handle: "quy-moi", bio: "" }))).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(dbAs).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ["ab", ORGANIZER_HANDLE_INVALID_MESSAGE],
    ["-bad", ORGANIZER_HANDLE_INVALID_MESSAGE],
    ["bad--slug", ORGANIZER_HANDLE_INVALID_MESSAGE],
    ["admin", ORGANIZER_HANDLE_RESERVED_MESSAGE],
    ["CAMPAIGNS", ORGANIZER_HANDLE_RESERVED_MESSAGE],
    ["give-vn", ORGANIZER_HANDLE_RESERVED_MESSAGE],
  ])("rejects invalid or reserved handle %s before querying", async (handle, message) => {
    expect(await updateOrganizerPublicProfile(null, form({ handle, bio: "" }))).toEqual({ ok: false, message })
    expect(dbAs).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("rejects bio longer than 500 characters before querying", async () => {
    expect(await updateOrganizerPublicProfile(null, form({ handle: "quy-moi", bio: "a".repeat(501) }))).toEqual({
      ok: false,
      message: ORGANIZER_BIO_TOO_LONG_MESSAGE,
    })
    expect(dbAs).not.toHaveBeenCalled()
  })

  it("refuses updates when the user has not created an organizer profile yet", async () => {
    state.handler = (call) => (op(call, "maybeSingle") ? { data: null } : undefined)
    expect(await updateOrganizerPublicProfile(null, form({ handle: "quy-moi", bio: "Xin chào" }))).toEqual({
      ok: false,
      message: "Hãy tạo hồ sơ người tổ chức trước khi thiết lập trang công khai.",
    })
    expect(state.calls).toHaveLength(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("updates ONLY handle and bio scoped to session user (never touching identity or verification columns)", async () => {
    const result = await updateOrganizerPublicProfile(
      null,
      form({
        handle: "  Quy-Moi-2026  ",
        bio: "  Chung tay xây trường học vùng cao.  ",
        // Extra tampered form fields must be ignored.
        display_name: "Tên giả",
        legal_name: "Pháp lý giả",
        verification_status: "verified",
      })
    )
    expect(result).toEqual({ ok: true, message: "Đã lưu hồ sơ công khai." })
    expect(state.calls).toHaveLength(2)
    expect(state.calls[1]).toEqual({
      target: "organizers",
      ops: [
        ["update", { handle: "quy-moi-2026", bio: "Chung tay xây trường học vùng cao." }],
        ["eq", "user_id", USER],
      ],
    })
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ["/me"],
      ["/start"],
      ["/"],
      ["/campaigns"],
      ["/campaigns/[slug]", "page"],
      ["/u/[handle]", "page"],
      ["/u/quy-ban-may"],
      ["/u/quy-moi-2026"],
    ])
  })

  it("clears handle and bio to null when submitted blank and reports removal cleanly", async () => {
    const result = await updateOrganizerPublicProfile(null, form({ handle: "   ", bio: "   " }))
    expect(result).toEqual({ ok: true, message: "Đã lưu. Đường dẫn trang công khai đã được gỡ." })
    expect(op(state.calls[1], "update")).toEqual([{ handle: null, bio: null }])
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/u/quy-ban-may")
  })

  it.each([
    [{ code: "23514", message: "GIVE_HANDLE_INVALID" }, ORGANIZER_HANDLE_INVALID_MESSAGE],
    [{ code: "23514", message: "GIVE_HANDLE_RESERVED" }, ORGANIZER_HANDLE_RESERVED_MESSAGE],
    [
      { code: "23505", message: 'duplicate key value violates unique constraint "organizers_handle_key"' },
      ORGANIZER_HANDLE_TAKEN_MESSAGE,
    ],
    [
      { code: "23514", message: 'new row for relation "organizers" violates check constraint "organizers_bio_check"' },
      ORGANIZER_BIO_TOO_LONG_MESSAGE,
    ],
  ])("maps database error %j to Vietnamese copy without revalidating", async (error, expected) => {
    state.handler = (call) => (op(call, "maybeSingle") ? { data: existingOrganizer() } : { error })
    expect(await updateOrganizerPublicProfile(null, form({ handle: "quy-khac", bio: "Ok" }))).toEqual({
      ok: false,
      message: expected,
    })
    expect(publicProfileDbErrorMessage(error)).toBe(expected)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
