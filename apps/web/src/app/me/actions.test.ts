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
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  serviceCalled: false,
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }))
vi.mock("@/lib/supabase", () => ({
  dbAs: vi.fn(() => fakeDb((call) => state.handler(call), state.calls)),
  dbService: () => {
    state.serviceCalled = true
    throw new Error("/me actions must NEVER call dbService()")
  },
}))

const { toggleMyAmbassadorLeaderboard, updateOrganizerPublicProfile } = await import("./actions")

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
  state.serviceCalled = false
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

  it("normalizes CRLF line endings in multiline bios before enforcing the 500-char limit", async () => {
    // 5 lines x 99 chars + 4 CRLF breaks = 499 normalized chars (503 raw CRLF chars).
    const lines = Array.from({ length: 5 }, () => "a".repeat(99))
    const crlfBio = lines.join("\r\n")
    expect(crlfBio.length).toBe(503)
    const result = await updateOrganizerPublicProfile(null, form({ handle: "quy-ban-may", bio: crlfBio }))
    expect(result).toEqual({ ok: true, message: "Đã lưu hồ sơ công khai." })
    expect(op(state.calls[1], "update")).toEqual([{ handle: "quy-ban-may", bio: lines.join("\n") }])
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

describe("toggleMyAmbassadorLeaderboard (/me, DOS/Give#319, #331)", () => {
  function setupAmbassadorDb(nextShow: boolean) {
    state.handler = (call) => {
      if (call.target === "rpc:get_my_campaign_ambassador") {
        return {
          data: [
            {
              ref_code: "ab23cd45ef",
              display_name: "CLB Sinh viên Xanh",
              show_on_leaderboard: !nextShow,
              matched_count: 3,
              matched_total_vnd: 900_000,
              created_at: "2026-11-20T00:00:00Z",
              updated_at: "2026-11-21T00:00:00Z",
            },
          ],
        }
      }
      if (call.target === "rpc:upsert_my_campaign_ambassador") {
        return {
          data: [
            {
              ref_code: "ab23cd45ef",
              display_name: "CLB Sinh viên Xanh",
              show_on_leaderboard: nextShow,
              created_at: "2026-11-20T00:00:00Z",
            },
          ],
        }
      }
      return undefined
    }
  }

  it("refuses signed-out callers, invalid campaign ids, and invalid boolean inputs before opening DB", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect(
      await toggleMyAmbassadorLeaderboard(
        { showOnLeaderboard: true },
        form({ campaign_id: CAMPAIGN, campaign_slug: "ban-may", show_on_leaderboard: "false" })
      )
    ).toEqual({
      showOnLeaderboard: true,
      error: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(dbAs).not.toHaveBeenCalled()

    expect(
      await toggleMyAmbassadorLeaderboard(
        { showOnLeaderboard: true },
        form({ campaign_id: "not-a-uuid", campaign_slug: "ban-may", show_on_leaderboard: "false" })
      )
    ).toEqual({
      showOnLeaderboard: true,
      error: "Không tìm thấy liên kết đồng hành của bạn cho chiến dịch này.",
    })

    expect(
      await toggleMyAmbassadorLeaderboard(
        { showOnLeaderboard: false },
        form({ campaign_id: CAMPAIGN, campaign_slug: "ban-may", show_on_leaderboard: "maybe" })
      )
    ).toEqual({
      showOnLeaderboard: false,
      error: "Thao tác không hợp lệ.",
    })
    expect(dbAs).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("refuses toggling when caller has no existing ambassador row so it never creates a link accidentally", async () => {
    state.handler = (call) => (call.target === "rpc:get_my_campaign_ambassador" ? { data: [] } : undefined)

    const res = await toggleMyAmbassadorLeaderboard(
      { showOnLeaderboard: true },
      form({ campaign_id: CAMPAIGN, campaign_slug: "ban-may", show_on_leaderboard: "false" })
    )
    expect(res).toEqual({
      showOnLeaderboard: true,
      error: "Không tìm thấy liên kết đồng hành của bạn cho chiến dịch này.",
    })
    expect(state.calls.map((c) => c.target)).toEqual(["rpc:get_my_campaign_ambassador"])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("toggles show_on_leaderboard strictly via dbAs preserving DB display_name and revalidating /me and valid slug", async () => {
    setupAmbassadorDb(false)
    const hidden = await toggleMyAmbassadorLeaderboard(
      { showOnLeaderboard: true },
      form({
        campaign_id: CAMPAIGN,
        campaign_slug: "xay-truong-ban-may",
        show_on_leaderboard: "false",
        // Tampered display_name in FormData must be ignored in favor of authoritative DB row.
        display_name: "Tên bị giả mạo",
      })
    )
    expect(state.serviceCalled).toBe(false)
    expect(dbAs).toHaveBeenCalledWith("token")
    expect(state.calls.map((c) => c.target)).toEqual([
      "rpc:get_my_campaign_ambassador",
      "rpc:upsert_my_campaign_ambassador",
    ])
    expect(op(state.calls[1], "args")).toEqual([
      {
        p_campaign_id: CAMPAIGN,
        p_display_name: "CLB Sinh viên Xanh",
        p_show_on_leaderboard: false,
      },
    ])
    expect(hidden).toEqual({
      showOnLeaderboard: false,
      message: "Đã ẩn liên kết này khỏi bảng xếp hạng.",
    })
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/me"], ["/campaigns/xay-truong-ban-may"]])

    // Toggle back to true with an invalid slug: still revalidates /me only, never unsafe path.
    vi.mocked(revalidatePath).mockClear()
    state.calls.length = 0
    setupAmbassadorDb(true)
    const shown = await toggleMyAmbassadorLeaderboard(
      { showOnLeaderboard: false },
      form({ campaign_id: CAMPAIGN, campaign_slug: "../admin", show_on_leaderboard: "true" })
    )
    expect(shown).toEqual({
      showOnLeaderboard: true,
      message: "Đã hiện liên kết này trên bảng xếp hạng.",
    })
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/me"]])
  })

  it("maps expired JWT and GIVE_* errors cleanly while keeping prior visibility state", async () => {
    state.handler = () => ({ error: { code: "PGRST303", message: "JWT expired" } })
    expect(
      await toggleMyAmbassadorLeaderboard(
        { showOnLeaderboard: true },
        form({ campaign_id: CAMPAIGN, campaign_slug: "ban-may", show_on_leaderboard: "false" })
      )
    ).toEqual({
      showOnLeaderboard: true,
      error: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })

    state.handler = (call) => {
      if (call.target === "rpc:get_my_campaign_ambassador") {
        return {
          data: [
            {
              ref_code: "ab23cd45ef",
              display_name: "CLB Sinh viên Xanh",
              show_on_leaderboard: true,
              matched_count: 1,
              matched_total_vnd: 100_000,
              created_at: "2026-11-20T00:00:00Z",
              updated_at: "2026-11-20T00:00:00Z",
            },
          ],
        }
      }
      if (call.target === "rpc:upsert_my_campaign_ambassador") {
        return { error: { code: "42501", message: "GIVE_ACCOUNT_NOT_ACTIVE" } }
      }
      return undefined
    }
    expect(
      await toggleMyAmbassadorLeaderboard(
        { showOnLeaderboard: true },
        form({ campaign_id: CAMPAIGN, campaign_slug: "ban-may", show_on_leaderboard: "false" })
      )
    ).toEqual({
      showOnLeaderboard: true,
      error: "Tài khoản của bạn hiện không hoạt động nên không thể thực hiện thao tác này.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
