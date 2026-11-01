import sharp from "sharp"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SUBMIT_NO_ACCOUNT, submitUnusableAccount } from "@/lib/campaign-account"
import { SUBMIT_MESSAGES } from "@/lib/errors"
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

const { deleteDraft, deleteMilestone, saveContent, submitForReview, uploadCover } = await import("./actions")

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

  it("submits a give campaign with a usable bound account", async () => {
    state.userHandler = reads()
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({
      ok: true,
      message: "Đã gửi duyệt. Kiểm duyệt viên sẽ xem chiến dịch của bạn.",
    })
    expect(transitioned()).toBe(true)
  })

  it("resubmits a give campaign sent back for changes under the same check", async () => {
    state.userHandler = reads({ bindings: [], campaign: owned({ status: "changes_requested" }) })
    expect(await submitForReview(CAMPAIGN, null, new FormData())).toEqual({ ok: false, message: SUBMIT_NO_ACCOUNT })
    expect(transitioned()).toBe(false)
  })

  it("leaves back campaigns alone: no account reads", async () => {
    state.userHandler = reads({ bindings: [], campaign: owned({ type: "back" }) })
    expect((await submitForReview(CAMPAIGN, null, new FormData()))?.ok).toBe(true)
    expect(state.userCalls.map((c) => c.target)).toEqual(["rpc:managed_campaigns", "rpc:transition_campaign"])
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

  it("re-encodes without metadata, stores it, sets the cover and drops the old one", async () => {
    state.userHandler = (call) =>
      op(call, "maybeSingle")
        ? { data: owned({ cover_media_id: OLD_COVER }) }
        : op(call, "update")
          ? { data: [{ id: CAMPAIGN }] }
          : undefined
    state.serviceHandler = (call) =>
      call.target === "campaign_media" && op(call, "delete")
        ? { data: [{ storage_path: `campaigns/${CAMPAIGN}/old.webp` }] }
        : undefined

    const result = await uploadCover(CAMPAIGN, null, coverForm(await photoWithGps()))
    expect(result).toEqual({ ok: true, message: "Đã cập nhật ảnh bìa." })

    const upload = state.serviceCalls.find((c) => op(c, "upload"))
    const [path, body, options] = op(upload, "upload") as [string, Uint8Array, { contentType: string }]
    expect(path).toMatch(new RegExp(`^campaigns/${CAMPAIGN}/[0-9a-f-]{36}\\.webp$`))
    expect(options.contentType).toBe("image/webp")
    const meta = await sharp(body).metadata()
    expect(meta.format).toBe("webp")
    expect(meta.exif).toBeUndefined()

    const [cover] = op(
      state.userCalls.find((c) => op(c, "update")),
      "update"
    ) as [{ cover_media_id: string }]
    expect(path).toContain(cover.cover_media_id)
    const removed = state.serviceCalls.filter((c) => op(c, "remove")).map((c) => op(c, "remove")?.[0])
    expect(removed).toEqual([[`campaigns/${CAMPAIGN}/old.webp`]])
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
