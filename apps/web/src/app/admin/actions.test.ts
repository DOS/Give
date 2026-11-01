import { beforeEach, describe, expect, it, vi } from "vitest"

import { OPEN_MESSAGES, REVIEW_MESSAGES } from "@/lib/errors"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const ORGANIZER = "55555555-5555-4555-8555-555555555555"

const state = vi.hoisted(() => ({ handler: (() => undefined) as Handler, calls: [] as Call[] }))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: "staff", email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({ dbAs: () => fakeDb((call) => state.handler(call), state.calls) }))

const { approveCampaign, setVerification } = await import("./actions")

const day = 86_400_000
const transitions = () =>
  state.calls
    .filter((c) => c.target === "rpc:transition_campaign")
    .map((c) => (op(c, "args")?.[0] as { p_to_status: string }).p_to_status)

beforeEach(() => {
  state.calls.length = 0
})

describe("approveCampaign", () => {
  it("approves and opens a campaign whose start time has come", async () => {
    state.handler = (call) =>
      op(call, "maybeSingle")
        ? { data: { slug: "a-b", starts_at: null, ends_at: new Date(Date.now() + 30 * day).toISOString() } }
        : undefined
    const result = await approveCampaign(CAMPAIGN, null, new FormData())
    expect(result).toEqual({ ok: true, message: "Đã duyệt và mở chiến dịch công khai." })
    expect(transitions()).toEqual(["approved", "live"])
  })

  it("only approves a campaign scheduled for later", async () => {
    state.handler = (call) =>
      op(call, "maybeSingle")
        ? {
            data: {
              slug: "a-b",
              starts_at: new Date(Date.now() + day).toISOString(),
              ends_at: new Date(Date.now() + 30 * day).toISOString(),
            },
          }
        : undefined
    expect((await approveCampaign(CAMPAIGN, null, new FormData()))?.ok).toBe(true)
    expect(transitions()).toEqual(["approved"])
  })

  it("refuses a campaign whose end date passed during review", async () => {
    state.handler = (call) =>
      op(call, "maybeSingle")
        ? { data: { slug: "a-b", starts_at: null, ends_at: new Date(Date.now() - day).toISOString() } }
        : undefined
    expect((await approveCampaign(CAMPAIGN, null, new FormData()))?.ok).toBe(false)
    expect(transitions()).toEqual([])
  })

  it("surfaces the database's self-review refusal", async () => {
    state.handler = (call) =>
      op(call, "maybeSingle")
        ? { data: { slug: "a-b", starts_at: null, ends_at: null } }
        : call.target === "rpc:transition_campaign"
          ? { error: { code: "42501", message: "GIVE_TRANSITION_NOT_ALLOWED: in_review -> approved" } }
          : undefined
    expect(await approveCampaign(CAMPAIGN, null, new FormData())).toEqual({
      ok: false,
      message: "Không thể chuyển chiến dịch sang trạng thái này lúc này.",
    })
  })
})

describe("approveCampaign without a usable receiving account (DOS/Give#38)", () => {
  const noAccount = { code: "23514", message: "GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT" }

  it("explains the missing account when approval is refused", async () => {
    state.handler = (call) =>
      op(call, "maybeSingle")
        ? { data: { slug: "a-b", starts_at: null, ends_at: null } }
        : call.target === "rpc:transition_campaign"
          ? { error: noAccount }
          : undefined
    expect(await approveCampaign(CAMPAIGN, null, new FormData())).toEqual({
      ok: false,
      message: REVIEW_MESSAGES.GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT,
    })
    expect(transitions()).toEqual(["approved"])
  })

  it("explains the missing account when the account went away before opening", async () => {
    state.handler = (call) =>
      op(call, "maybeSingle")
        ? { data: { slug: "a-b", starts_at: null, ends_at: null } }
        : call.target === "rpc:transition_campaign" &&
            (op(call, "args")?.[0] as { p_to_status: string }).p_to_status === "live"
          ? { error: noAccount }
          : undefined
    expect(await approveCampaign(CAMPAIGN, null, new FormData())).toEqual({
      ok: true,
      message: `Đã duyệt, nhưng chưa mở được: ${OPEN_MESSAGES.GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT}`,
    })
  })
})

describe("setVerification", () => {
  it("passes the names and kind the moderator saw", async () => {
    state.handler = () => undefined
    const form = new FormData()
    form.set("status", "verified")
    form.set("expected_legal_name", "Nguyễn Văn A")
    form.set("expected_display_name", "Anh A")
    form.set("expected_kind", "individual")
    expect((await setVerification(ORGANIZER, null, form))?.ok).toBe(true)
    expect(op(state.calls[0], "args")?.[0]).toEqual({
      p_user_id: ORGANIZER,
      p_status: "verified",
      p_expected_legal_name: "Nguyễn Văn A",
      p_expected_display_name: "Anh A",
      p_expected_kind: "individual",
      p_reason: null,
    })
  })

  it("rejects statuses other than verified or rejected", async () => {
    const form = new FormData()
    form.set("status", "unverified")
    expect((await setVerification(ORGANIZER, null, form))?.ok).toBe(false)
    expect(state.calls).toHaveLength(0)
  })
})
