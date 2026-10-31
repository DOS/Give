import sharp from "sharp"
import { beforeEach, describe, expect, it, vi } from "vitest"

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

const { deleteDraft, deleteMilestone, saveContent, uploadCover } = await import("./actions")

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
