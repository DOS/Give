import { revalidatePath } from "next/cache"
import sharp from "sharp"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getSession } from "@/lib/auth/session"
import { SUBMIT_NO_ACCOUNT, submitUnusableAccount } from "@/lib/campaign-account"
import { CAMPAIGN_MONTHLY_MESSAGES, SUBMIT_MESSAGES } from "@/lib/errors"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const OLD_COVER = "33333333-3333-4333-8333-333333333333"

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// Like Next's redirect(), stop the action where it is called.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: USER, email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({
  MEDIA_BUCKET: "give-media",
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const {
  addMilestone,
  cancelCampaign,
  deleteDraft,
  deleteDraftUpdate,
  deleteMilestone,
  postUpdate,
  publishDraftUpdate,
  removeYoutubeVideo,
  saveContent,
  saveYoutubeVideo,
  setCampaignMonthly,
  submitForReview,
  updateDraftUpdate,
  updateMilestone,
  uploadCover,
} = await import("./actions")

function owned(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN,
    slug: "quy-hoc-bong-abcde",
    type: "give",
    status: "draft",
    organizer_id: USER,
    cover_media_id: null,
    ...overrides,
  }
}

function contentForm(overrides: Record<string, string> = {}) {
  const form = new FormData()
  const values: Record<string, string> = {
    title: "Quỹ học bổng vùng cao",
    summary: "Tóm tắt",
    story: "",
    category_id: "",
    beneficiary_name: "Trường tiểu học A",
    beneficiary_relation: "",
    goal_amount: "50.000.000",
    min_contribution: "10.000",
    stretch_goal_amount: "80.000.000",
    starts_at: "",
    ends_at: "",
    payment_window_days: "14",
    show_progress_bar: "on",
    ...overrides,
  }
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return form
}

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.serviceHandler = () => undefined
  vi.mocked(revalidatePath).mockClear()
  vi.mocked(getSession).mockResolvedValue({ user: { id: USER, email: null, name: null }, accessToken: "token" })
})

describe("saveContent", () => {
  it("writes give-only fields and drops back-only ones", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned() } : op(call, "update") ? { data: [{ id: CAMPAIGN }] } : undefined
    const result = await saveContent(CAMPAIGN, null, contentForm())
    expect(result).toEqual({ ok: true, message: "Đã lưu nội dung." })
    const [values] = op(
      state.userCalls.find((c) => op(c, "update")),
      "update"
    ) as [Record<string, unknown>]
    expect(values).toMatchObject({
      beneficiary_name: "Trường tiểu học A",
      stretch_goal_amount: null,
      payment_window_days: 7,
      goal_amount: 50_000_000,
      display_options: { progress_bar: true, backers_count: false, time_remaining: false },
    })
  })

  it("drops beneficiaries for back projects and keeps the stretch goal", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle")
        ? { data: owned({ type: "back" }) }
        : op(call, "update")
          ? { data: [{ id: CAMPAIGN }] }
          : undefined
    await saveContent(CAMPAIGN, null, contentForm())
    const [values] = op(
      state.userCalls.find((c) => op(c, "update")),
      "update"
    ) as [Record<string, unknown>]
    expect(values).toMatchObject({ beneficiary_name: null, stretch_goal_amount: 80_000_000, payment_window_days: 14 })
  })

  it("loads the campaign through managed_campaigns, which returns organizer_id", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned() } : op(call, "update") ? { data: [{ id: CAMPAIGN }] } : undefined
    await saveContent(CAMPAIGN, null, contentForm())
    const load = state.userCalls[0]
    expect(load.target).toBe("rpc:managed_campaigns")
    expect(op(load, "args")).toEqual([{ p_campaign_id: CAMPAIGN }])
    expect(op(load, "select")?.[0]).toContain("organizer_id")
  })

  it("refuses campaigns the caller does not organize, without writing", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned({ organizer_id: "someone-else" }) } : undefined
    const result = await saveContent(CAMPAIGN, null, contentForm())
    expect(result?.ok).toBe(false)
    expect(state.userCalls.some((c) => op(c, "update"))).toBe(false)
  })

  it("refuses campaigns that are under review", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "in_review" }) } : undefined)
    expect((await saveContent(CAMPAIGN, null, contentForm()))?.ok).toBe(false)
    expect(state.userCalls.some((c) => op(c, "update"))).toBe(false)
  })

  it("reports an expired session instead of 'not found'", async () => {
    state.userHandler = () => ({ error: { code: "PGRST303", message: "JWT expired" } })
    expect(await saveContent(CAMPAIGN, null, contentForm())).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
  })

  it("rejects a tampered campaign id before querying", async () => {
    expect((await saveContent("x),id.neq.0", null, contentForm()))?.ok).toBe(false)
    expect(state.userCalls).toHaveLength(0)
  })

  it("asks to turn monthly giving off when clearing the end date hits campaigns_monthly_needs_end (DOS/Give#276)", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle")
        ? { data: owned() }
        : op(call, "update")
          ? {
              error: {
                code: "23514",
                message: 'new row for relation "campaigns" violates check constraint "campaigns_monthly_needs_end"',
              },
            }
          : undefined
    expect(await saveContent(CAMPAIGN, null, contentForm({ ends_at: "" }))).toEqual({
      ok: false,
      message: "Hãy tắt ủng hộ hằng tháng trước khi bỏ ngày kết thúc.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("keeps the generic message for other check violations", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle")
        ? { data: owned() }
        : op(call, "update")
          ? {
              error: {
                code: "23514",
                message: 'new row for relation "campaigns" violates check constraint "campaigns_goal_amount_check"',
              },
            }
          : undefined
    expect(await saveContent(CAMPAIGN, null, contentForm())).toEqual({ ok: false, message: "Dữ liệu không hợp lệ." })
  })
})

describe("submitForReview", () => {
  const ACCOUNT = "55555555-5555-4555-8555-555555555555"
  const organizer = { user_id: USER, legal_name: "Nguyễn Thị Đào", verification_status: "verified" }
  const account = (overrides: Record<string, unknown> = {}) => ({
    id: ACCOUNT,
    owner_user_id: USER,
    account_name: "NGUYEN THI DAO",
    verification_status: "verified",
    bindings: [{ id: "b", campaign_id: CAMPAIGN, bound_at: "2026-11-01T00:00:00Z", released_at: null }],
    ...overrides,
  })

  /** User-token reads: the campaign, its active binding, the bound account and the organizer. */
  function reads(
    { bindings = [{ id: "b", receiving_account_id: ACCOUNT }], acct = account(), campaign = owned() } = {} as {
      bindings?: unknown[]
      acct?: unknown
      campaign?: unknown
    },
    transition: Handler = () => undefined
  ): Handler {
    return (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: campaign }
      if (call.target === "account_bindings") return { data: bindings }
      if (call.target === "receiving_accounts") return { data: acct }
      if (call.target === "organizers") return { data: organizer }
      if (call.target === "rpc:transition_campaign") return transition(call)
      return undefined
    }
  }

  const transitioned = () => state.userCalls.some((c) => c.target === "rpc:transition_campaign")

  it("refuses a give campaign with no bound account before asking the database (DOS/Give#32)", async () => {
    state.userHandler = reads({ bindings: [] })
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({ ok: false, message: SUBMIT_NO_ACCOUNT })
    expect(transitioned()).toBe(false)
    const bindingRead = state.userCalls.find((c) => c.target === "account_bindings")
    expect(op(bindingRead, "eq")).toEqual(["campaign_id", CAMPAIGN])
    expect(op(bindingRead, "is")).toEqual(["released_at", null])
  })

  it("refuses a give campaign whose bound account is no longer verified", async () => {
    state.userHandler = reads({ acct: account({ verification_status: "disabled" }) })
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({
      ok: false,
      message: submitUnusableAccount("Tài khoản chưa được xác minh."),
    })
    expect(transitioned()).toBe(false)
  })

  it("treats a bound account the caller cannot read as missing", async () => {
    state.userHandler = reads({ acct: null })
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({ ok: false, message: SUBMIT_NO_ACCOUNT })
    expect(transitioned()).toBe(false)
  })

  it("reports a failed account read", async () => {
    const base = reads()
    state.userHandler = (call) =>
      call.target === "account_bindings" ? { error: { code: "42501", message: "permission denied" } } : base(call)
    const result = await submitForReview(CAMPAIGN, null, new FormData())
    expect(result?.ok).toBe(false)
    expect(transitioned()).toBe(false)
  })

  it("submits a give campaign with a usable bound account and revalidates /admin", async () => {
    state.userHandler = reads()
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({
      ok: true,
      message: "Đã gửi duyệt. Kiểm duyệt viên sẽ xem chiến dịch của bạn.",
    })
    expect(transitioned()).toBe(true)
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      [`/me/campaigns/${CAMPAIGN}`],
      ["/me/campaigns"],
      ["/campaigns/quy-hoc-bong-abcde"],
      ["/admin"],
    ])
  })

  it("resubmits a give campaign sent back for changes under the same check", async () => {
    state.userHandler = reads({ bindings: [], campaign: owned({ status: "changes_requested" }) })
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({ ok: false, message: SUBMIT_NO_ACCOUNT })
    expect(transitioned()).toBe(false)
  })

  it("refuses a back campaign with no bound account too (DOS/Give#85)", async () => {
    state.userHandler = reads({ bindings: [], campaign: owned({ type: "back" }) })
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({ ok: false, message: SUBMIT_NO_ACCOUNT })
    expect(transitioned()).toBe(false)
  })

  it("submits a back campaign with a usable bound account", async () => {
    state.userHandler = reads({ campaign: owned({ type: "back" }) })
    expect((await submitForReview(CAMPAIGN, null, new FormData()))?.ok).toBe(true)
    expect(transitioned()).toBe(true)
  })

  it("tells a sent-back give campaign whose unusable account holds money to request a swap, not to release (DOS/Give#77)", async () => {
    const base = reads({
      acct: account({ verification_status: "disabled" }),
      campaign: owned({ type: "give", status: "changes_requested" }),
    })
    state.userHandler = (call) => (call.target === "bank_transactions" ? { data: [{ id: "t" }] } : base(call))
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({
      ok: false,
      message: submitUnusableAccount("Tài khoản chưa được xác minh.", true, true),
    })
    expect(transitioned()).toBe(false)
  })

  it("tells a draft give campaign whose unusable account holds money to contact Give, since drafts cannot swap (DOS/Give#77)", async () => {
    const base = reads({
      acct: account({ verification_status: "disabled" }),
      campaign: owned({ type: "give", status: "draft" }),
    })
    state.userHandler = (call) => (call.target === "bank_transactions" ? { data: [{ id: "t" }] } : base(call))
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({
      ok: false,
      message: submitUnusableAccount("Tài khoản chưa được xác minh.", true, false),
    })
    expect(transitioned()).toBe(false)
  })

  it("points a sent-back back campaign whose unusable account holds money to swap, and draft back to contact Give (DOS/Give#92)", async () => {
    const sentBack = reads({
      acct: account({ verification_status: "disabled" }),
      campaign: owned({ type: "back", status: "changes_requested" }),
    })
    state.userHandler = (call) => (call.target === "bank_transactions" ? { data: [{ id: "t" }] } : sentBack(call))
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({
      ok: false,
      message: submitUnusableAccount("Tài khoản chưa được xác minh.", true, true),
    })

    const draftBack = reads({
      acct: account({ verification_status: "disabled" }),
      campaign: owned({ type: "back", status: "draft" }),
    })
    state.userHandler = (call) => (call.target === "bank_transactions" ? { data: [{ id: "t" }] } : draftBack(call))
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({
      ok: false,
      message: submitUnusableAccount("Tài khoản chưa được xác minh.", true, false),
    })
    expect(transitioned()).toBe(false)
  })

  it("explains that a give campaign needs a bound verified account (DOS/Give#38)", async () => {
    state.userHandler = reads({}, () => ({
      error: { code: "23514", message: "GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT" },
    }))
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({
      ok: false,
      message: SUBMIT_MESSAGES.GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT,
    })
    const submit = state.userCalls.find((c) => c.target === "rpc:transition_campaign")
    expect(op(submit!, "args")).toEqual([{ p_campaign_id: CAMPAIGN, p_to_status: "in_review", p_reason: null }])
  })

  it("keeps the other submission errors as they were", async () => {
    state.userHandler = reads({}, () => ({ error: { code: "23514", message: "GIVE_BENEFICIARY_REQUIRED" } }))
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({
      ok: false,
      message: "Chiến dịch từ thiện cần ghi tên người thụ hưởng.",
    })
  })
})

describe("deleteMilestone", () => {
  it("reports a delete that matched no row", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : { data: [] })
    const result = await deleteMilestone(CAMPAIGN, "44444444-4444-4444-8444-444444444444", null, new FormData())
    expect(result?.ok).toBe(false)
  })
})

describe("deleteDraft", () => {
  it("deletes under RLS, then removes everything under the campaign's prefix", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned() } : op(call, "delete") ? { data: [{ id: CAMPAIGN }] } : undefined
    state.serviceHandler = (call) => (op(call, "list") ? { data: [{ name: "a.webp" }, { name: "b.webp" }] } : undefined)
    await expect(deleteDraft(CAMPAIGN, null, new FormData())).rejects.toThrow("NEXT_REDIRECT /me/campaigns")
    expect(
      op(
        state.serviceCalls.find((c) => op(c, "list")),
        "list"
      )?.[0]
    ).toBe(`campaigns/${CAMPAIGN}`)
    expect(
      op(
        state.serviceCalls.find((c) => op(c, "remove")),
        "remove"
      )?.[0]
    ).toEqual([`campaigns/${CAMPAIGN}/a.webp`, `campaigns/${CAMPAIGN}/b.webp`])
  })

  it("still revalidates and redirects when best-effort Storage cleanup throws after DB delete", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned() } : op(call, "delete") ? { data: [{ id: CAMPAIGN }] } : undefined
    state.serviceHandler = () => {
      throw new Error("storage unreachable")
    }
    try {
      await expect(deleteDraft(CAMPAIGN, null, new FormData())).rejects.toThrow("NEXT_REDIRECT /me/campaigns")
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledExactlyOnceWith("/me/campaigns")
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it("leaves storage alone when RLS deleted nothing", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : { data: [] })
    expect((await deleteDraft(CAMPAIGN, null, new FormData()))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses submitted campaigns", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "in_review" }) } : undefined)
    expect((await deleteDraft(CAMPAIGN, null, new FormData()))?.ok).toBe(false)
    expect(state.userCalls.some((c) => op(c, "delete"))).toBe(false)
  })
})

describe("uploadCover", () => {
  const NEWER_COVER = "77777777-7777-4777-8777-777777777777"

  async function photoWithGps(): Promise<File> {
    const jpeg = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#e11d48" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "secret-owner" }, IFD3: { GPSLatitudeRef: "N" } })
      .toBuffer()
    return new File([new Uint8Array(jpeg)], "photo.jpg", { type: "image/jpeg" })
  }

  function coverForm(file: File) {
    const form = new FormData()
    form.set("cover", file)
    form.set("alt", "Ảnh bìa")
    return form
  }

  it("re-encodes without metadata, stores it, atomically swaps cover_media_id from prevCoverId, and deletes only prevCoverId", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle")
        ? { data: owned({ cover_media_id: OLD_COVER }) }
        : op(call, "update")
          ? { data: [{ id: CAMPAIGN }] }
          : undefined
    state.serviceHandler = (call) => {
      if (call.target === "campaign_media" && op(call, "delete")) {
        return { data: [{ storage_path: `campaigns/${CAMPAIGN}/old.webp` }] }
      }
      return undefined
    }

    const result = await uploadCover(CAMPAIGN, null, coverForm(await photoWithGps()))
    expect(result).toEqual({ ok: true, message: "Đã cập nhật ảnh bìa." })

    const upload = state.serviceCalls.find((c) => op(c, "upload"))
    const [path, body, options] = op(upload, "upload") as [string, Uint8Array, { contentType: string }]
    expect(path).toMatch(new RegExp(`^campaigns/${CAMPAIGN}/[0-9a-f-]{36}\\.webp$`))
    expect(options.contentType).toBe("image/webp")
    const meta = await sharp(body).metadata()
    expect(meta.format).toBe("webp")
    expect(meta.exif).toBeUndefined()

    const updateCall = state.userCalls.find((c) => op(c, "update"))
    const [cover] = op(updateCall, "update") as [{ cover_media_id: string }]
    expect(path).toContain(cover.cover_media_id)
    expect(updateCall?.ops).toContainEqual(["eq", "id", CAMPAIGN])
    expect(updateCall?.ops).toContainEqual(["eq", "cover_media_id", OLD_COVER])
    expect(updateCall?.ops).toContainEqual(["select", "id"])

    const deleteCalls = state.serviceCalls.filter((c) => c.target === "campaign_media" && op(c, "delete"))
    expect(deleteCalls).toHaveLength(1)
    expect(deleteCalls[0].ops).toContainEqual(["eq", "id", OLD_COVER])
    expect(deleteCalls[0].ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
    expect(deleteCalls[0].ops.some(([name]) => name === "neq")).toBe(false)

    const removed = state.serviceCalls.filter((c) => op(c, "remove")).map((c) => op(c, "remove")?.[0])
    expect(removed).toEqual([[`campaigns/${CAMPAIGN}/old.webp`]])
  })

  it("uses is(cover_media_id, null) on initial cover upload and skips post-commit media deletion", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle")
        ? { data: owned({ cover_media_id: null }) }
        : op(call, "update")
          ? { data: [{ id: CAMPAIGN }] }
          : undefined

    expect(await uploadCover(CAMPAIGN, null, coverForm(await photoWithGps()))).toEqual({
      ok: true,
      message: "Đã cập nhật ảnh bìa.",
    })

    const updateCall = state.userCalls.find((c) => op(c, "update"))
    expect(updateCall?.ops).toContainEqual(["eq", "id", CAMPAIGN])
    expect(updateCall?.ops).toContainEqual(["is", "cover_media_id", null])
    expect(state.serviceCalls.some((c) => c.target === "campaign_media" && op(c, "delete"))).toBe(false)
    expect(state.serviceCalls.some((c) => op(c, "remove"))).toBe(false)
  })

  it("retries optimistic CAS when cover_media_id changed concurrently during upload and deletes only the swapped-out cover", async () => {
    let reads = 0
    let updates = 0
    state.userHandler = (call) => {
      if (op(call, "maybeSingle")) {
        reads += 1
        // Initial read sees null; reload after CAS miss sees NEWER_COVER committed concurrently.
        return { data: owned({ cover_media_id: reads === 1 ? null : NEWER_COVER }) }
      }
      if (op(call, "update")) {
        updates += 1
        return { data: updates === 1 ? [] : [{ id: CAMPAIGN }] }
      }
      return undefined
    }
    state.serviceHandler = (call) => {
      if (call.target === "campaign_media" && op(call, "delete")) {
        return { data: [{ storage_path: `campaigns/${CAMPAIGN}/${NEWER_COVER}.webp` }] }
      }
      return undefined
    }

    expect(await uploadCover(CAMPAIGN, null, coverForm(await photoWithGps()))).toEqual({
      ok: true,
      message: "Đã cập nhật ảnh bìa.",
    })

    const updateCalls = state.userCalls.filter((c) => op(c, "update"))
    expect(updateCalls).toHaveLength(2)
    expect(updateCalls[0].ops).toContainEqual(["is", "cover_media_id", null])
    expect(updateCalls[1].ops).toContainEqual(["eq", "cover_media_id", NEWER_COVER])

    const deleteCalls = state.serviceCalls.filter((c) => c.target === "campaign_media" && op(c, "delete"))
    expect(deleteCalls).toHaveLength(1)
    expect(deleteCalls[0].ops).toContainEqual(["eq", "id", NEWER_COVER])
    expect(deleteCalls[0].ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
    const removed = state.serviceCalls.filter((c) => op(c, "remove")).map((c) => op(c, "remove")?.[0])
    expect(removed).toEqual([[`campaigns/${CAMPAIGN}/${NEWER_COVER}.webp`]])
  })

  it("rolls back the newly uploaded cover without deleting existing covers if the campaign becomes non-editable during CAS retry", async () => {
    let reads = 0
    state.userHandler = (call) => {
      if (op(call, "maybeSingle")) {
        reads += 1
        return {
          data:
            reads === 1
              ? owned({ cover_media_id: OLD_COVER })
              : owned({ status: "in_review", cover_media_id: NEWER_COVER }),
        }
      }
      if (op(call, "update")) return { data: [] }
      return undefined
    }

    expect(await uploadCover(CAMPAIGN, null, coverForm(await photoWithGps()))).toEqual({
      ok: false,
      message: "Chỉ sửa được chiến dịch đang là bản nháp hoặc cần chỉnh sửa.",
    })

    const [insertedRow] = op(
      state.serviceCalls.find((c) => c.target === "campaign_media" && op(c, "insert")),
      "insert"
    ) as [{ id: string; storage_path: string }]
    const deleteCalls = state.serviceCalls.filter((c) => c.target === "campaign_media" && op(c, "delete"))
    expect(deleteCalls).toHaveLength(1)
    expect(deleteCalls[0].ops).toEqual([["delete"], ["eq", "id", insertedRow.id]])
    const removed = state.serviceCalls.filter((c) => op(c, "remove")).map((c) => op(c, "remove")?.[0])
    expect(removed).toEqual([[insertedRow.storage_path]])
  })

  it("succeeds and revalidates even when post-commit Storage cleanup throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    state.userHandler = (call) =>
      op(call, "maybeSingle")
        ? { data: owned({ cover_media_id: OLD_COVER }) }
        : op(call, "update")
          ? { data: [{ id: CAMPAIGN }] }
          : undefined
    state.serviceHandler = (call) => {
      if (call.target === "campaign_media" && op(call, "delete")) {
        return { data: [{ storage_path: `campaigns/${CAMPAIGN}/old.webp` }] }
      }
      if (op(call, "remove")) throw new Error("storage timeout")
      return undefined
    }

    try {
      expect(await uploadCover(CAMPAIGN, null, coverForm(await photoWithGps()))).toEqual({
        ok: true,
        message: "Đã cập nhật ảnh bìa.",
      })
      expect(vi.mocked(revalidatePath).mock.calls).toEqual([
        [`/me/campaigns/${CAMPAIGN}`],
        ["/me/campaigns"],
        ["/campaigns/quy-hoc-bong-abcde"],
      ])
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it("rolls back the object and media row when RLS refuses the cover update", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned() } : op(call, "update") ? { data: [] } : undefined
    const result = await uploadCover(CAMPAIGN, null, coverForm(await photoWithGps()))
    expect(result?.ok).toBe(false)
    const [path] = op(
      state.serviceCalls.find((c) => op(c, "upload")),
      "upload"
    ) as [string]
    expect(state.serviceCalls.some((c) => c.target === "campaign_media" && op(c, "delete"))).toBe(true)
    expect(state.serviceCalls.some((c) => (op(c, "remove")?.[0] as string[] | undefined)?.includes(path))).toBe(true)
  })

  it("never touches the service role for files that are not images", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : undefined)
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "x.png", { type: "image/png" })
    expect((await uploadCover(CAMPAIGN, null, coverForm(svg)))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("never touches the service role for someone else's campaign", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned({ organizer_id: "someone-else" }) } : undefined
    expect((await uploadCover(CAMPAIGN, null, coverForm(await photoWithGps())))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })
})

describe("addMilestone", () => {
  function milestoneForm(overrides: Record<string, string> = {}) {
    const form = new FormData()
    const values: Record<string, string> = {
      title: "  Mua sách giáo khoa  ",
      target_amount: "15.000.000",
      description: "  Trao cho 50 học sinh vùng cao  ",
      ...overrides,
    }
    for (const [key, value] of Object.entries(values)) form.set(key, value)
    return form
  }

  it("refuses signed-out callers before querying", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect(await addMilestone(CAMPAIGN, null, milestoneForm())).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(state.userCalls).toHaveLength(0)
  })

  it("refuses non-editable campaign statuses without inserting", async () => {
    for (const status of ["in_review", "approved", "live", "cancelled"] as const) {
      state.userCalls.length = 0
      state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status }) } : undefined)
      expect(await addMilestone(CAMPAIGN, null, milestoneForm())).toEqual({
        ok: false,
        message: "Chỉ sửa được chiến dịch đang là bản nháp hoặc cần chỉnh sửa.",
      })
      expect(state.userCalls.some((c) => c.target === "campaign_milestones")).toBe(false)
    }
  })

  it("validates milestoneSchema fields before inserting", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : undefined)
    expect(await addMilestone(CAMPAIGN, null, milestoneForm({ title: "A" }))).toEqual({
      ok: false,
      message: "Tên mốc cần ít nhất 2 ký tự",
    })
    expect(await addMilestone(CAMPAIGN, null, milestoneForm({ target_amount: "không hợp lệ" }))).toEqual({
      ok: false,
      message: "Số tiền không hợp lệ",
    })
    expect(state.userCalls.some((c) => c.target === "campaign_milestones")).toBe(false)
  })

  it("inserts the parsed milestone payload and revalidates editor, list and public campaign paths", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned({ status: "changes_requested" }) } : undefined
    const result = await addMilestone(
      CAMPAIGN,
      null,
      milestoneForm({ unlock_note: "  Công bố danh sách 50 học sinh nhận sách  " })
    )
    expect(result).toEqual({ ok: true, message: "Đã thêm mốc." })

    const insert = state.userCalls.find((c) => c.target === "campaign_milestones")
    expect(op(insert, "insert")).toEqual([
      {
        campaign_id: CAMPAIGN,
        title: "Mua sách giáo khoa",
        target_amount: 15_000_000,
        description: "Trao cho 50 học sinh vùng cao",
        unlock_note: "Công bố danh sách 50 học sinh nhận sách",
        sort_order: 0,
      },
    ])
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      [`/me/campaigns/${CAMPAIGN}`],
      ["/me/campaigns"],
      ["/campaigns/quy-hoc-bong-abcde"],
    ])
  })

  it("normalizes empty description and unlock_note to null, rejects unlock_note > 500 chars, and surfaces DB errors without revalidating", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : undefined)
    expect(await addMilestone(CAMPAIGN, null, milestoneForm({ unlock_note: "x".repeat(501) }))).toEqual({
      ok: false,
      message: "Ghi chú khi đạt mốc tối đa 500 ký tự.",
    })
    expect(state.userCalls.some((c) => c.target === "campaign_milestones")).toBe(false)

    await addMilestone(CAMPAIGN, null, milestoneForm({ description: "   ", unlock_note: "   " }))
    const insert = state.userCalls.find((c) => c.target === "campaign_milestones")
    expect(op(insert, "insert")).toEqual([
      {
        campaign_id: CAMPAIGN,
        title: "Mua sách giáo khoa",
        target_amount: 15_000_000,
        description: null,
        unlock_note: null,
        sort_order: 0,
      },
    ])

    state.userCalls.length = 0
    vi.mocked(revalidatePath).mockClear()
    state.userHandler = (call) =>
      op(call, "maybeSingle")
        ? { data: owned() }
        : call.target === "campaign_milestones"
          ? { error: { code: "23514", message: "GIVE_CAMPAIGN_NOT_EDITABLE" } }
          : undefined
    const failed = await addMilestone(CAMPAIGN, null, milestoneForm())
    expect(failed?.ok).toBe(false)
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })
})

describe("updateMilestone", () => {
  const MILESTONE = "44444444-4444-4444-8444-444444444444"

  function editMilestoneForm(overrides: Record<string, string> = {}) {
    const form = new FormData()
    const values: Record<string, string> = {
      title: "  Mua bàn ghế mới  ",
      target_amount: "25.000.000",
      description: "  Bàn ghế cho 2 phòng học  ",
      unlock_note: "  Gửi ảnh nghiệm thu tại điểm trường  ",
      ...overrides,
    }
    for (const [key, value] of Object.entries(values)) form.set(key, value)
    return form
  }

  it("refuses signed-out callers and invalid UUIDs before querying", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect(await updateMilestone(CAMPAIGN, MILESTONE, null, editMilestoneForm())).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(state.userCalls).toHaveLength(0)

    expect((await updateMilestone("not-a-uuid", MILESTONE, null, editMilestoneForm()))?.ok).toBe(false)
    expect((await updateMilestone(CAMPAIGN, "not-a-uuid", null, editMilestoneForm()))?.ok).toBe(false)
    expect(state.userCalls).toHaveLength(0)
  })

  it("refuses non-owners, non-editable statuses, and invalid fields without updating", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned({ organizer_id: "other-user" }) } : undefined
    expect((await updateMilestone(CAMPAIGN, MILESTONE, null, editMilestoneForm()))?.ok).toBe(false)

    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "live" }) } : undefined)
    expect(await updateMilestone(CAMPAIGN, MILESTONE, null, editMilestoneForm())).toEqual({
      ok: false,
      message: "Chỉ sửa được chiến dịch đang là bản nháp hoặc cần chỉnh sửa.",
    })

    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : undefined)
    expect(
      await updateMilestone(CAMPAIGN, MILESTONE, null, editMilestoneForm({ unlock_note: "y".repeat(501) }))
    ).toEqual({
      ok: false,
      message: "Ghi chú khi đạt mốc tối đa 500 ký tự.",
    })
    expect(state.userCalls.some((c) => c.target === "campaign_milestones")).toBe(false)
  })

  it("updates title, target_amount, description and unlock_note scoped to id and campaign_id, and revalidates", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle")
        ? { data: owned({ status: "changes_requested" }) }
        : call.target === "campaign_milestones" && op(call, "update")
          ? { data: [{ id: MILESTONE }] }
          : undefined

    expect(await updateMilestone(CAMPAIGN, MILESTONE, null, editMilestoneForm())).toEqual({
      ok: true,
      message: "Đã lưu mốc.",
    })

    const updateCall = state.userCalls.find((c) => c.target === "campaign_milestones")
    expect(op(updateCall, "update")).toEqual([
      {
        title: "Mua bàn ghế mới",
        target_amount: 25_000_000,
        description: "Bàn ghế cho 2 phòng học",
        unlock_note: "Gửi ảnh nghiệm thu tại điểm trường",
      },
    ])
    expect(updateCall?.ops).toContainEqual(["eq", "id", MILESTONE])
    expect(updateCall?.ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
    expect(updateCall?.ops).toContainEqual(["select", "id"])
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      [`/me/campaigns/${CAMPAIGN}`],
      ["/me/campaigns"],
      ["/campaigns/quy-hoc-bong-abcde"],
    ])
  })

  it("reports a clear error without revalidating when 0 rows match or DB fails", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : { data: [] })
    expect(await updateMilestone(CAMPAIGN, MILESTONE, null, editMilestoneForm())).toEqual({
      ok: false,
      message: "Không lưu được mốc này. Hãy tải lại trang.",
    })
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })
})

describe("saveYoutubeVideo and removeYoutubeVideo", () => {
  function videoForm(youtube_id: string, alt = "") {
    const form = new FormData()
    form.set("youtube_id", youtube_id)
    form.set("alt", alt)
    return form
  }

  it.each([
    ["raw 11-char ID", "  dQw4w9WgXcQ  ", "dQw4w9WgXcQ"],
    ["raw ID with _ and -", "_aB-09_Zz12", "_aB-09_Zz12"],
    ["youtu.be link", "https://youtu.be/dQw4w9WgXcQ?si=abc&t=15", "dQw4w9WgXcQ"],
    ["bare youtu.be link", "youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["youtube.com/watch", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s", "dQw4w9WgXcQ"],
    ["m.youtube.com/watch", "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["youtube.com/shorts", "https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share", "dQw4w9WgXcQ"],
    ["youtube.com/embed", "https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["youtube-nocookie.com/embed", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0", "dQw4w9WgXcQ"],
  ])(
    "parses %s, inserts kind=youtube first, cleans up only older kind=youtube rows, and revalidates",
    async (_label, input, expectedId) => {
      state.userCalls.length = 0
      state.serviceCalls.length = 0
      vi.mocked(revalidatePath).mockClear()
      state.userHandler = (call) =>
        op(call, "maybeSingle") ? { data: owned({ cover_media_id: OLD_COVER }) } : undefined
      state.serviceHandler = (call) =>
        call.target === "campaign_media" && op(call, "insert")
          ? { data: { created_at: "2026-11-19T12:00:00.123456+00:00" } }
          : undefined

      const result = await saveYoutubeVideo(CAMPAIGN, null, videoForm(input, "  Video giới thiệu điểm trường  "))
      expect(result).toEqual({ ok: true, message: "Đã lưu video giới thiệu." })

      const insertCall = state.serviceCalls.find((c) => c.target === "campaign_media" && op(c, "insert"))
      const [insertedRow] = op(insertCall, "insert") as [
        { id: string; campaign_id: string; kind: string; youtube_id: string; alt: string | null; sort_order: number },
      ]
      expect(insertedRow).toMatchObject({
        campaign_id: CAMPAIGN,
        kind: "youtube",
        youtube_id: expectedId,
        alt: "Video giới thiệu điểm trường",
        sort_order: 0,
      })

      const deleteCalls = state.serviceCalls.filter((c) => c.target === "campaign_media" && op(c, "delete"))
      expect(deleteCalls).toHaveLength(1)
      expect(deleteCalls[0].ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
      expect(deleteCalls[0].ops).toContainEqual(["eq", "kind", "youtube"])
      expect(deleteCalls[0].ops).toContainEqual(["neq", "id", insertedRow.id])
      expect(deleteCalls[0].ops).toContainEqual(["lte", "created_at", "2026-11-19T12:00:00.123456+00:00"])
      expect(state.serviceCalls.some((c) => c.target.startsWith("storage:"))).toBe(false)
      expect(vi.mocked(revalidatePath).mock.calls).toEqual([
        [`/me/campaigns/${CAMPAIGN}`],
        ["/me/campaigns"],
        ["/campaigns/quy-hoc-bong-abcde"],
      ])
    }
  )

  it.each([
    ["empty", "   "],
    ["too short", "abc123"],
    ["too long", "dQw4w9WgXcQ_extra"],
    ["playlist page", "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"],
    [
      "watch with playlist param",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
    ],
    ["short link with playlist param", "https://youtu.be/dQw4w9WgXcQ?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"],
    ["videoseries embed", "https://www.youtube.com/embed/videoseries?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"],
    ["raw videoseries keyword", "videoseries"],
    ["watch videoseries keyword", "https://www.youtube.com/watch?v=videoseries"],
    ["channel handle", "https://www.youtube.com/@GiveVietnam"],
    ["channel id", "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw"],
    ["live_stream embed", "https://www.youtube.com/embed/live_stream?channel=UCuAXFkgsw1L7xaCfnd5JJOw"],
    ["non-standard port", "https://www.youtube.com:8080/watch?v=dQw4w9WgXcQ"],
    ["non-YouTube URL", "https://vimeo.com/12345678901"],
    ["lookalike host", "https://evil-youtube.com/watch?v=dQw4w9WgXcQ"],
    ["javascript scheme", "javascript:dQw4w9WgXcQ"],
  ])("rejects invalid YouTube input (%s) without touching the service role", async (_label, badInput) => {
    state.serviceCalls.length = 0
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : undefined)
    const result = await saveYoutubeVideo(CAMPAIGN, null, videoForm(badInput))
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("Liên kết YouTube không hợp lệ")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("validates alt <= 200 chars, normalizes empty alt to null, and enforces auth/ownership/editable status", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect((await saveYoutubeVideo(CAMPAIGN, null, videoForm("dQw4w9WgXcQ")))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)

    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned({ organizer_id: "someone-else" }) } : undefined
    expect((await saveYoutubeVideo(CAMPAIGN, null, videoForm("dQw4w9WgXcQ")))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)

    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "in_review" }) } : undefined)
    expect((await saveYoutubeVideo(CAMPAIGN, null, videoForm("dQw4w9WgXcQ")))?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)

    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : undefined)
    expect(await saveYoutubeVideo(CAMPAIGN, null, videoForm("dQw4w9WgXcQ", "a".repeat(201)))).toEqual({
      ok: false,
      message: "Mô tả video tối đa 200 ký tự.",
    })
    expect(state.serviceCalls).toHaveLength(0)

    expect(await saveYoutubeVideo(CAMPAIGN, null, videoForm("dQw4w9WgXcQ", "   "))).toEqual({
      ok: true,
      message: "Đã lưu video giới thiệu.",
    })
    const [insertedRow] = op(
      state.serviceCalls.find((c) => c.target === "campaign_media" && op(c, "insert")),
      "insert"
    ) as [{ alt: string | null }]
    expect(insertedRow.alt).toBeNull()
  })

  it("rolls back the inserted YouTube row if deleting older kind=youtube rows fails", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : undefined)
    let deletes = 0
    state.serviceHandler = (call) => {
      if (call.target === "campaign_media" && op(call, "delete")) {
        deletes += 1
        return deletes === 1 ? { error: { code: "57014", message: "statement timeout" } } : {}
      }
      return undefined
    }

    const result = await saveYoutubeVideo(CAMPAIGN, null, videoForm("dQw4w9WgXcQ"))
    expect(result?.ok).toBe(false)
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()

    const [insertedRow] = op(
      state.serviceCalls.find((c) => c.target === "campaign_media" && op(c, "insert")),
      "insert"
    ) as [{ id: string }]
    const deleteCalls = state.serviceCalls.filter((c) => c.target === "campaign_media" && op(c, "delete"))
    expect(deleteCalls).toHaveLength(2)
    expect(deleteCalls[1].ops).toContainEqual(["eq", "id", insertedRow.id])
    expect(deleteCalls[1].ops).toContainEqual(["eq", "kind", "youtube"])
  })

  it("removes only kind=youtube rows for the owned editable campaign and revalidates", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "live" }) } : undefined)
    expect(await removeYoutubeVideo(CAMPAIGN)).toEqual({
      ok: false,
      message: "Chỉ sửa được chiến dịch đang là bản nháp hoặc cần chỉnh sửa.",
    })
    expect(state.serviceCalls).toHaveLength(0)

    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned({ status: "changes_requested", cover_media_id: OLD_COVER }) } : undefined
    expect(await removeYoutubeVideo(CAMPAIGN)).toEqual({
      ok: true,
      message: "Đã gỡ video giới thiệu.",
    })

    expect(state.serviceCalls).toHaveLength(1)
    expect(state.serviceCalls[0].target).toBe("campaign_media")
    expect(state.serviceCalls[0].ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
    expect(state.serviceCalls[0].ops).toContainEqual(["eq", "kind", "youtube"])
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      [`/me/campaigns/${CAMPAIGN}`],
      ["/me/campaigns"],
      ["/campaigns/quy-hoc-bong-abcde"],
    ])
  })
})

describe("cancelCampaign", () => {
  function cancelForm(reason?: string) {
    const form = new FormData()
    if (reason !== undefined) form.set("reason", reason)
    return form
  }

  it("trims and caps reason at 500 chars, forwards p_to_status 'cancelled', and revalidates including /admin", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "in_review" }) } : undefined)
    const longReason = `   ${"L".repeat(525)}   `
    const result = await cancelCampaign(CAMPAIGN, null, cancelForm(longReason))
    expect(result).toEqual({ ok: true, message: "Đã hủy chiến dịch." })

    const rpc = state.userCalls.find((c) => c.target === "rpc:transition_campaign")
    expect(op(rpc, "args")).toEqual([
      {
        p_campaign_id: CAMPAIGN,
        p_to_status: "cancelled",
        p_reason: "L".repeat(500),
      },
    ])
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      [`/me/campaigns/${CAMPAIGN}`],
      ["/me/campaigns"],
      ["/campaigns/quy-hoc-bong-abcde"],
      ["/admin"],
    ])
  })

  it.each([undefined, "", "   "])("converts blank or omitted reason (%j) to null", async (reason) => {
    state.userCalls.length = 0
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : undefined)
    expect(await cancelCampaign(CAMPAIGN, null, cancelForm(reason))).toEqual({
      ok: true,
      message: "Đã hủy chiến dịch.",
    })
    const rpc = state.userCalls.find((c) => c.target === "rpc:transition_campaign")
    expect(op(rpc, "args")).toEqual([{ p_campaign_id: CAMPAIGN, p_to_status: "cancelled", p_reason: null }])
  })

  it("maps transition_campaign errors with cancellation-appropriate messages instead of SUBMIT_MESSAGES without revalidating", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle")
        ? { data: owned({ status: "live" }) }
        : call.target === "rpc:transition_campaign"
          ? { error: { code: "23514", message: "GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT" } }
          : undefined
    const noAccount = await cancelCampaign(CAMPAIGN, null, cancelForm("Đổi kế hoạch"))
    expect(noAccount?.ok).toBe(false)
    expect(noAccount?.message).not.toContain("Chưa gửi duyệt được")
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()

    state.userHandler = (call) =>
      op(call, "maybeSingle")
        ? { data: owned({ status: "live" }) }
        : call.target === "rpc:transition_campaign"
          ? { error: { code: "23514", message: "GIVE_TRANSITION_NOT_ALLOWED" } }
          : undefined
    expect(await cancelCampaign(CAMPAIGN, null, cancelForm("Đổi kế hoạch"))).toEqual({
      ok: false,
      message:
        "Không hủy được chiến dịch: chiến dịch không còn ở trạng thái cho phép hủy (có thể vừa được mở công khai). Hãy tải lại trang.",
    })
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })
})

describe("postUpdate", () => {
  function updateForm(overrides: Record<string, string> = {}) {
    const form = new FormData()
    const values: Record<string, string> = {
      title: "  Đã trao đợt 1  ",
      body: "  50 phần sách giáo khoa đã tới tay học sinh.  ",
      ...overrides,
    }
    for (const [key, value] of Object.entries(values)) form.set(key, value)
    return form
  }

  it("refuses cancelled and suspended campaigns via canPostUpdate without inserting", async () => {
    for (const status of ["cancelled", "suspended"] as const) {
      state.userCalls.length = 0
      state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status }) } : undefined)
      expect(await postUpdate(CAMPAIGN, null, updateForm())).toEqual({
        ok: false,
        message: "Không thể đăng cập nhật cho chiến dịch đã hủy hoặc đang tạm dừng.",
      })
      expect(state.userCalls.some((c) => c.target === "campaign_updates")).toBe(false)
    }
  })

  it("validates updateSchema fields before inserting", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "live" }) } : undefined)
    expect(await postUpdate(CAMPAIGN, null, updateForm({ title: "A" }))).toEqual({
      ok: false,
      message: "Nhập tiêu đề",
    })
    expect(await postUpdate(CAMPAIGN, null, updateForm({ body: "   " }))).toEqual({
      ok: false,
      message: "Nhập nội dung",
    })
    expect(state.userCalls.some((c) => c.target === "campaign_updates")).toBe(false)
  })

  it("inserts a public update with author_id and published_at and revalidates", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-11-16T10:30:00.000Z"))
      state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "live" }) } : undefined)

      const result = await postUpdate(CAMPAIGN, null, updateForm())
      expect(result).toEqual({ ok: true, message: "Đã đăng cập nhật." })

      const insert = state.userCalls.find((c) => c.target === "campaign_updates")
      expect(op(insert, "insert")).toEqual([
        {
          campaign_id: CAMPAIGN,
          author_id: USER,
          title: "Đã trao đợt 1",
          body: "50 phần sách giáo khoa đã tới tay học sinh.",
          visibility: "public",
          published_at: "2026-11-16T10:30:00.000Z",
        },
      ])
      expect(vi.mocked(revalidatePath).mock.calls).toEqual([
        [`/me/campaigns/${CAMPAIGN}`],
        ["/me/campaigns"],
        ["/campaigns/quy-hoc-bong-abcde"],
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(["draft", "changes_requested", "in_review", "approved", "live", "closed"] as const)(
    "saves a draft update with published_at = null on %s campaigns when intent is 'draft'",
    async (status) => {
      state.userCalls.length = 0
      vi.mocked(revalidatePath).mockClear()
      state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status }) } : undefined)

      const result = await postUpdate(CAMPAIGN, null, updateForm({ intent: "draft" }))
      expect(result).toEqual({ ok: true, message: "Đã lưu bản nháp cập nhật." })

      const insert = state.userCalls.find((c) => c.target === "campaign_updates")
      expect(op(insert, "insert")).toEqual([
        {
          campaign_id: CAMPAIGN,
          author_id: USER,
          title: "Đã trao đợt 1",
          body: "50 phần sách giáo khoa đã tới tay học sinh.",
          visibility: "public",
          published_at: null,
        },
      ])
      expect(vi.mocked(revalidatePath).mock.calls).toEqual([
        [`/me/campaigns/${CAMPAIGN}`],
        ["/me/campaigns"],
        ["/campaigns/quy-hoc-bong-abcde"],
      ])
    }
  )

  it.each(["draft", "changes_requested", "in_review"] as const)(
    "refuses immediate publish on pre-approval %s campaigns while guiding to draft save",
    async (status) => {
      state.userCalls.length = 0
      state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status }) } : undefined)

      expect(await postUpdate(CAMPAIGN, null, updateForm())).toEqual({
        ok: false,
        message: "Chỉ đăng công khai được cập nhật sau khi chiến dịch đã được duyệt. Hiện bạn có thể lưu bản nháp.",
      })
      expect(await postUpdate(CAMPAIGN, null, updateForm({ intent: "publish" }))).toEqual({
        ok: false,
        message: "Chỉ đăng công khai được cập nhật sau khi chiến dịch đã được duyệt. Hiện bạn có thể lưu bản nháp.",
      })
      expect(state.userCalls.some((c) => c.target === "campaign_updates")).toBe(false)
    }
  )

  it("refuses draft saves on cancelled/suspended campaigns and rejects unknown intent values", async () => {
    for (const status of ["cancelled", "suspended"] as const) {
      state.userCalls.length = 0
      state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status }) } : undefined)
      expect(await postUpdate(CAMPAIGN, null, updateForm({ intent: "draft" }))).toEqual({
        ok: false,
        message: "Không thể đăng cập nhật cho chiến dịch đã hủy hoặc đang tạm dừng.",
      })
      expect(state.userCalls.some((c) => c.target === "campaign_updates")).toBe(false)
    }

    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "live" }) } : undefined)
    expect(await postUpdate(CAMPAIGN, null, updateForm({ intent: "archive" }))).toEqual({
      ok: false,
      message: "Dữ liệu không hợp lệ.",
    })
    expect(state.userCalls.some((c) => c.target === "campaign_updates")).toBe(false)
  })
})

const DRAFT_UPDATE = "55555555-5555-4555-8555-555555555555"

describe("updateDraftUpdate", () => {
  function draftForm(overrides: Record<string, string> = {}) {
    const form = new FormData()
    const values: Record<string, string> = {
      title: "  Cập nhật đợt 1 (đã sửa)  ",
      body: "  Đã đối chiếu danh sách 50 học sinh nhận sách.  ",
      ...overrides,
    }
    for (const [key, value] of Object.entries(values)) form.set(key, value)
    return form
  }

  it("validates session, UUIDs, ownership, canPostUpdate, and updateSchema before writing", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect(await updateDraftUpdate(CAMPAIGN, DRAFT_UPDATE, null, draftForm())).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })

    expect(await updateDraftUpdate("not-a-uuid", DRAFT_UPDATE, null, draftForm())).toEqual({
      ok: false,
      message: "Không tìm thấy chiến dịch của bạn.",
    })
    expect(await updateDraftUpdate(CAMPAIGN, "not-a-uuid", null, draftForm())).toEqual({
      ok: false,
      message: "Không tìm thấy chiến dịch của bạn.",
    })
    expect(state.userCalls).toHaveLength(0)

    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned({ organizer_id: "someone-else" }) } : undefined
    expect(await updateDraftUpdate(CAMPAIGN, DRAFT_UPDATE, null, draftForm())).toEqual({
      ok: false,
      message: "Không tìm thấy chiến dịch của bạn.",
    })

    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "suspended" }) } : undefined)
    expect(await updateDraftUpdate(CAMPAIGN, DRAFT_UPDATE, null, draftForm())).toEqual({
      ok: false,
      message: "Không thể đăng cập nhật cho chiến dịch đã hủy hoặc đang tạm dừng.",
    })

    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "draft" }) } : undefined)
    expect(await updateDraftUpdate(CAMPAIGN, DRAFT_UPDATE, null, draftForm({ title: "X" }))).toEqual({
      ok: false,
      message: "Nhập tiêu đề",
    })
    expect(await updateDraftUpdate(CAMPAIGN, DRAFT_UPDATE, null, draftForm({ intent: "bogus" }))).toEqual({
      ok: false,
      message: "Dữ liệu không hợp lệ.",
    })
    expect(state.userCalls.some((c) => c.target === "campaign_updates")).toBe(false)
  })

  it("updates title and body strictly where published_at IS NULL and revalidates", async () => {
    state.userHandler = (call) => {
      if (op(call, "maybeSingle")) return { data: owned({ status: "in_review" }) }
      if (call.target === "campaign_updates" && op(call, "update")) return { data: [{ id: DRAFT_UPDATE }] }
      return undefined
    }

    expect(await updateDraftUpdate(CAMPAIGN, DRAFT_UPDATE, null, draftForm())).toEqual({
      ok: true,
      message: "Đã lưu bản nháp cập nhật.",
    })

    const updateCall = state.userCalls.find((c) => c.target === "campaign_updates")
    expect(op(updateCall, "update")).toEqual([
      {
        title: "Cập nhật đợt 1 (đã sửa)",
        body: "Đã đối chiếu danh sách 50 học sinh nhận sách.",
      },
    ])
    expect(updateCall?.ops).toContainEqual(["eq", "id", DRAFT_UPDATE])
    expect(updateCall?.ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
    expect(updateCall?.ops).toContainEqual(["is", "published_at", null])
    expect(updateCall?.ops).toContainEqual(["select", "id"])
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      [`/me/campaigns/${CAMPAIGN}`],
      ["/me/campaigns"],
      ["/campaigns/quy-hoc-bong-abcde"],
    ])
  })

  it("supports intent = 'publish' on approved/public campaigns and refuses it before approval", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "draft" }) } : undefined)
    expect(await updateDraftUpdate(CAMPAIGN, DRAFT_UPDATE, null, draftForm({ intent: "publish" }))).toEqual({
      ok: false,
      message: "Chỉ đăng công khai được cập nhật sau khi chiến dịch đã được duyệt. Hiện bạn có thể lưu bản nháp.",
    })
    expect(state.userCalls.some((c) => c.target === "campaign_updates")).toBe(false)

    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-11-19T08:00:00.000Z"))
      state.userCalls.length = 0
      state.userHandler = (call) => {
        if (op(call, "maybeSingle")) return { data: owned({ status: "live" }) }
        if (call.target === "campaign_updates" && op(call, "update")) return { data: [{ id: DRAFT_UPDATE }] }
        return undefined
      }

      expect(await updateDraftUpdate(CAMPAIGN, DRAFT_UPDATE, null, draftForm({ intent: "publish" }))).toEqual({
        ok: true,
        message: "Đã đăng cập nhật.",
      })
      const updateCall = state.userCalls.find((c) => c.target === "campaign_updates")
      expect(op(updateCall, "update")).toEqual([
        {
          title: "Cập nhật đợt 1 (đã sửa)",
          body: "Đã đối chiếu danh sách 50 học sinh nhận sách.",
          published_at: "2026-11-19T08:00:00.000Z",
        },
      ])
      expect(updateCall?.ops).toContainEqual(["is", "published_at", null])
    } finally {
      vi.useRealTimers()
    }
  })

  it("returns a clear error without revalidating when 0 rows match (already published or deleted)", async () => {
    state.userHandler = (call) => {
      if (op(call, "maybeSingle")) return { data: owned({ status: "live" }) }
      if (call.target === "campaign_updates" && op(call, "update")) return { data: [] }
      return undefined
    }

    expect(await updateDraftUpdate(CAMPAIGN, DRAFT_UPDATE, null, draftForm())).toEqual({
      ok: false,
      message: "Không tìm thấy bản nháp cập nhật này (có thể đã được đăng hoặc đã xóa). Hãy tải lại trang.",
    })
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })
})

describe("publishDraftUpdate & deleteDraftUpdate", () => {
  it("validates session, UUIDs, ownership, and status gates before publishing or deleting", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect(await publishDraftUpdate(CAMPAIGN, DRAFT_UPDATE)).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect(await deleteDraftUpdate(CAMPAIGN, DRAFT_UPDATE)).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })

    expect(await publishDraftUpdate(CAMPAIGN, "bad-id")).toEqual({
      ok: false,
      message: "Không tìm thấy chiến dịch của bạn.",
    })
    expect(await deleteDraftUpdate("bad-id", DRAFT_UPDATE)).toEqual({
      ok: false,
      message: "Không tìm thấy chiến dịch của bạn.",
    })
    expect(state.userCalls).toHaveLength(0)

    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "cancelled" }) } : undefined)
    expect(await publishDraftUpdate(CAMPAIGN, DRAFT_UPDATE)).toEqual({
      ok: false,
      message: "Không thể đăng cập nhật cho chiến dịch đã hủy hoặc đang tạm dừng.",
    })
    expect(await deleteDraftUpdate(CAMPAIGN, DRAFT_UPDATE)).toEqual({
      ok: false,
      message: "Không thể đăng cập nhật cho chiến dịch đã hủy hoặc đang tạm dừng.",
    })

    for (const status of ["draft", "changes_requested", "in_review"] as const) {
      state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status }) } : undefined)
      expect(await publishDraftUpdate(CAMPAIGN, DRAFT_UPDATE)).toEqual({
        ok: false,
        message: "Chỉ đăng công khai được cập nhật sau khi chiến dịch đã được duyệt. Hiện bạn có thể lưu bản nháp.",
      })
    }
    expect(state.userCalls.some((c) => c.target === "campaign_updates")).toBe(false)
  })

  it("publishes a draft strictly where published_at IS NULL, handles 0 matched rows, and revalidates", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-11-19T09:15:00.000Z"))
      state.userHandler = (call) => {
        if (op(call, "maybeSingle")) return { data: owned({ status: "live" }) }
        if (call.target === "campaign_updates" && op(call, "update")) return { data: [{ id: DRAFT_UPDATE }] }
        return undefined
      }

      expect(await publishDraftUpdate(CAMPAIGN, DRAFT_UPDATE)).toEqual({
        ok: true,
        message: "Đã đăng cập nhật.",
      })

      const updateCall = state.userCalls.find((c) => c.target === "campaign_updates")
      expect(op(updateCall, "update")).toEqual([{ published_at: "2026-11-19T09:15:00.000Z" }])
      expect(updateCall?.ops).toContainEqual(["eq", "id", DRAFT_UPDATE])
      expect(updateCall?.ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
      expect(updateCall?.ops).toContainEqual(["is", "published_at", null])
      expect(updateCall?.ops).toContainEqual(["select", "id"])
      expect(vi.mocked(revalidatePath).mock.calls).toEqual([
        [`/me/campaigns/${CAMPAIGN}`],
        ["/me/campaigns"],
        ["/campaigns/quy-hoc-bong-abcde"],
      ])

      // Already-published row returns 0 rows and fails cleanly without revalidating.
      vi.mocked(revalidatePath).mockClear()
      state.userHandler = (call) => {
        if (op(call, "maybeSingle")) return { data: owned({ status: "live" }) }
        if (call.target === "campaign_updates" && op(call, "update")) return { data: [] }
        return undefined
      }
      expect(await publishDraftUpdate(CAMPAIGN, DRAFT_UPDATE)).toEqual({
        ok: false,
        message: "Không tìm thấy bản nháp cập nhật này (có thể đã được đăng hoặc đã xóa). Hãy tải lại trang.",
      })
      expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("deletes a draft strictly where published_at IS NULL across editable/live campaigns and handles 0 matched rows", async () => {
    state.userHandler = (call) => {
      if (op(call, "maybeSingle")) return { data: owned({ status: "draft" }) }
      if (call.target === "campaign_updates" && op(call, "delete")) return { data: [{ id: DRAFT_UPDATE }] }
      return undefined
    }

    expect(await deleteDraftUpdate(CAMPAIGN, DRAFT_UPDATE)).toEqual({
      ok: true,
      message: "Đã xóa bản nháp cập nhật.",
    })

    const deleteCall = state.userCalls.find((c) => c.target === "campaign_updates")
    expect(op(deleteCall, "delete")).toEqual([])
    expect(deleteCall?.ops).toContainEqual(["eq", "id", DRAFT_UPDATE])
    expect(deleteCall?.ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
    expect(deleteCall?.ops).toContainEqual(["is", "published_at", null])
    expect(deleteCall?.ops).toContainEqual(["select", "id"])
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      [`/me/campaigns/${CAMPAIGN}`],
      ["/me/campaigns"],
      ["/campaigns/quy-hoc-bong-abcde"],
    ])

    vi.mocked(revalidatePath).mockClear()
    state.userHandler = (call) => {
      if (op(call, "maybeSingle")) return { data: owned({ status: "live" }) }
      if (call.target === "campaign_updates" && op(call, "delete")) return { data: [] }
      return undefined
    }
    expect(await deleteDraftUpdate(CAMPAIGN, DRAFT_UPDATE)).toEqual({
      ok: false,
      message: "Không tìm thấy bản nháp cập nhật này (có thể đã được đăng hoặc đã xóa). Hãy tải lại trang.",
    })
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })
})

describe("setCampaignMonthly (DOS/Give#276)", () => {
  function monthlyForm(enabled: string | null) {
    const form = new FormData()
    if (enabled !== null) form.set("enabled", enabled)
    return form
  }

  it.each([
    ["true", true, "Đã bật ủng hộ hằng tháng."],
    [
      "false",
      false,
      "Đã tắt ủng hộ hằng tháng. Kế hoạch của người ủng hộ đã dừng; mã ủng hộ của tháng này vẫn dùng được.",
    ],
  ] as const)(
    "proves the session with the caller's token, then sets enabled=%s with the service role as the caller",
    async (choice, enabled, message) => {
      state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ status: "live" }) } : undefined)
      state.serviceHandler = (call) => (call.target === "rpc:set_campaign_monthly" ? { data: enabled } : undefined)
      expect(await setCampaignMonthly(CAMPAIGN, null, monthlyForm(choice))).toEqual({ ok: true, message })

      expect(state.userCalls).toHaveLength(1)
      expect(state.userCalls[0].target).toBe("rpc:managed_campaigns")
      expect(op(state.userCalls[0], "args")).toEqual([{ p_campaign_id: CAMPAIGN }])
      expect(state.serviceCalls).toHaveLength(1)
      expect(state.serviceCalls[0].target).toBe("rpc:set_campaign_monthly")
      expect(op(state.serviceCalls[0], "args")).toEqual([
        { p_campaign_id: CAMPAIGN, p_enabled: enabled, p_actor: USER },
      ])
      expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual([
        `/me/campaigns/${CAMPAIGN}`,
        "/me/campaigns",
        "/campaigns/quy-hoc-bong-abcde",
      ])
    }
  )

  it("asks a signed-out caller to sign in again without querying", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect(await setCampaignMonthly(CAMPAIGN, null, monthlyForm("true"))).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it.each([[null], [""], ["on"], ["1"]])("rejects the choice %j before querying", async (choice) => {
    expect(await setCampaignMonthly(CAMPAIGN, null, monthlyForm(choice))).toEqual({
      ok: false,
      message: "Dữ liệu không hợp lệ.",
    })
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("rejects a tampered campaign id before querying", async () => {
    expect((await setCampaignMonthly("x),id.neq.0", null, monthlyForm("true")))?.ok).toBe(false)
    expect(state.userCalls).toHaveLength(0)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("never calls the service-role RPC for a campaign the caller does not organize", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle") ? { data: owned({ organizer_id: "someone-else" }) } : undefined
    expect(await setCampaignMonthly(CAMPAIGN, null, monthlyForm("true"))).toEqual({
      ok: false,
      message: "Không tìm thấy chiến dịch của bạn.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("never calls the service-role RPC when the caller's token is rejected", async () => {
    state.userHandler = () => ({ error: { code: "PGRST303", message: "JWT expired" } })
    expect(await setCampaignMonthly(CAMPAIGN, null, monthlyForm("false"))).toEqual({
      ok: false,
      message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a back project without calling the RPC", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned({ type: "back" }) } : undefined)
    expect(await setCampaignMonthly(CAMPAIGN, null, monthlyForm("true"))).toEqual({
      ok: false,
      message: CAMPAIGN_MONTHLY_MESSAGES.GIVE_CONTRIBUTION_TYPE_MISMATCH,
    })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it.each([
    "GIVE_MONTHLY_NEEDS_END_DATE",
    "GIVE_CAMPAIGN_ALREADY_ENDED",
    "GIVE_CAMPAIGN_NOT_ACCEPTING",
    "GIVE_CONTRIBUTION_TYPE_MISMATCH",
  ])("words the RPC's %s for the organizer and does not revalidate", async (code) => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : undefined)
    state.serviceHandler = () => ({ error: { code: "23514", message: code } })
    expect(await setCampaignMonthly(CAMPAIGN, null, monthlyForm("true"))).toEqual({
      ok: false,
      message: CAMPAIGN_MONTHLY_MESSAGES[code],
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("falls back to the shared message for GIVE_CAMPAIGN_NOT_FOUND", async () => {
    state.userHandler = (call) => (op(call, "maybeSingle") ? { data: owned() } : undefined)
    state.serviceHandler = () => ({ error: { code: "P0002", message: "GIVE_CAMPAIGN_NOT_FOUND" } })
    expect(await setCampaignMonthly(CAMPAIGN, null, monthlyForm("false"))).toEqual({
      ok: false,
      message: "Không tìm thấy chiến dịch, hoặc bạn không có quyền với chiến dịch này.",
    })
  })
})

describe("co-organizer editor vs owner-only server action guards (DOS/Give#253)", () => {
  const OTHER_OWNER = "99999999-9999-4999-8999-999999999999"

  function editorHandler(status: "draft" | "live" = "draft") {
    return (call: Call) => {
      if (call.target === "rpc:managed_campaigns") return { data: owned({ organizer_id: OTHER_OWNER, status }) }
      if (call.target === "rpc:my_campaign_roles") return { data: [{ campaign_id: CAMPAIGN, role: "editor" }] }
      if (call.target === "campaigns") return { data: [{ id: CAMPAIGN }] }
      if (call.target === "campaign_milestones") return { data: [{ id: "m-1" }] }
      if (call.target === "campaign_updates") return { data: [{ id: "u-1" }] }
      return undefined
    }
  }

  it("allows an accepted editor to save content, manage milestones, post updates, and manage YouTube pitch video", async () => {
    state.userHandler = editorHandler("draft")
    const contentForm = new FormData()
    contentForm.set("title", "Bếp ấm vùng cao")
    contentForm.set("summary", "Tóm tắt mới")
    contentForm.set("story", "Câu chuyện đầy đủ của chiến dịch từ thiện này.")
    contentForm.set("goal_amount", "10000000")
    contentForm.set("min_contribution", "20000")
    contentForm.set("payment_window_days", "7")
    expect(await saveContent(CAMPAIGN, null, contentForm)).toEqual({ ok: true, message: "Đã lưu nội dung." })

    const milestoneForm = new FormData()
    milestoneForm.set("title", "Mốc 1")
    milestoneForm.set("target_amount", "5000000")
    expect(await addMilestone(CAMPAIGN, null, milestoneForm)).toEqual({ ok: true, message: "Đã thêm mốc." })

    const videoForm = new FormData()
    videoForm.set("youtube_id", "dQw4w9WgXcQ")
    state.serviceHandler = () => ({ data: { created_at: "2026-11-22T00:00:00Z" } })
    expect(await saveYoutubeVideo(CAMPAIGN, null, videoForm)).toEqual({
      ok: true,
      message: "Đã lưu video giới thiệu.",
    })
    expect(await removeYoutubeVideo(CAMPAIGN)).toEqual({ ok: true, message: "Đã gỡ video giới thiệu." })

    state.userHandler = editorHandler("live")
    const updateForm = new FormData()
    updateForm.set("title", "Cập nhật từ đồng tổ chức")
    updateForm.set("body", "Đã trao 20 phần quà đầu tiên.")
    expect(await postUpdate(CAMPAIGN, null, updateForm)).toEqual({ ok: true, message: "Đã đăng cập nhật." })
  })

  it("refuses an accepted editor on strictly owner-only actions (submitForReview, cancelCampaign, deleteDraft, setCampaignMonthly)", async () => {
    state.userHandler = editorHandler("draft")
    const notFound = { ok: false, message: "Không tìm thấy chiến dịch của bạn." }

    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual(notFound)
    expect(await cancelCampaign(CAMPAIGN, null, new FormData())).toEqual(notFound)
    expect(await deleteDraft(CAMPAIGN, null, new FormData())).toEqual(notFound)

    const monthly = new FormData()
    monthly.set("enabled", "true")
    expect(await setCampaignMonthly(CAMPAIGN, null, monthly)).toEqual(notFound)

    expect(state.userCalls.some((c) => c.target === "rpc:transition_campaign")).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a staff user who is neither owner nor editor on saveContent", async () => {
    state.userHandler = (call) => {
      if (call.target === "rpc:managed_campaigns")
        return { data: owned({ organizer_id: OTHER_OWNER, status: "draft" }) }
      if (call.target === "rpc:my_campaign_roles") return { data: [] }
      return undefined
    }
    expect(await saveContent(CAMPAIGN, null, new FormData())).toEqual({
      ok: false,
      message: "Không tìm thấy chiến dịch của bạn.",
    })
    expect(state.userCalls.some((c) => c.target === "campaigns")).toBe(false)
  })
})
