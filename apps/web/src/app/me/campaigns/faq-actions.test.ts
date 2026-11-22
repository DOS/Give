import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignStatus } from "@/lib/campaigns"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const OWNER = "11111111-1111-4111-8111-111111111111"
const EDITOR = "22222222-2222-4222-8222-222222222222"
const OUTSIDER = "33333333-3333-4333-8333-333333333333"
const CAMPAIGN = "44444444-4444-4444-8444-444444444444"
const NEW_CAMPAIGN = "55555555-5555-4555-8555-555555555555"
const FAQ_1 = "66666666-6666-4666-8666-666666666661"
const FAQ_2 = "66666666-6666-4666-8666-666666666662"

const state = vi.hoisted(() => ({
  session: {
    user: { id: "11111111-1111-4111-8111-111111111111", email: "o@example.vn", name: "Chủ" },
    accessToken: "tok",
  } as {
    user: { id: string; email: string; name: string }
    accessToken: string
  } | null,
  handler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceUsed: false,
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  })
)

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }))
vi.mock("next/navigation", () => ({ redirect: redirectMock }))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => state.session) }))
vi.mock("@/lib/supabase", () => ({
  MEDIA_BUCKET: "give-media",
  dbAs: () => fakeDb((call) => state.handler(call), state.userCalls),
  dbService: () => {
    state.serviceUsed = true
    return fakeDb(() => undefined)
  },
}))

const { deleteCampaignFaq, moveCampaignFaq, saveCampaignFaq } = await import("./faq-actions")
const { duplicateCampaignDraft } = await import("./actions")

function makeForm(fields: Record<string, string>): FormData {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  return form
}

function managedCampaignRow(status: CampaignStatus = "draft", organizerId = OWNER) {
  return {
    id: CAMPAIGN,
    slug: "chien-dich-mau",
    type: "give",
    status,
    organizer_id: organizerId,
    cover_media_id: null,
  }
}

beforeEach(() => {
  state.session = { user: { id: OWNER, email: "o@example.vn", name: "Chủ" }, accessToken: "tok" }
  state.userCalls.length = 0
  state.serviceUsed = false
  revalidatePathMock.mockClear()
  redirectMock.mockClear()
})

describe("FAQ server actions (DOS/Give#316)", () => {
  it("owner creates an FAQ via dbAs upsert_campaign_faq (never service_role) and revalidates", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: managedCampaignRow("live") }
      if (call.target === "campaign_faqs") return { data: [] }
      if (call.target === "rpc:upsert_campaign_faq") return { data: [{ id: FAQ_1 }] }
      return undefined
    }

    const res = await saveCampaignFaq(
      CAMPAIGN,
      null,
      null,
      makeForm({ question: "  Khi nào tổng kết?  ", answer: "  Cuối tháng 12.  " })
    )
    expect(res).toEqual({ ok: true, message: "Đã thêm câu hỏi thường gặp." })
    expect(state.serviceUsed).toBe(false)
    const rpcCall = state.userCalls.find((c) => c.target === "rpc:upsert_campaign_faq")
    expect(op(rpcCall, "args")).toEqual([
      {
        p_campaign_id: CAMPAIGN,
        p_question: "Khi nào tổng kết?",
        p_answer: "Cuối tháng 12.",
        p_faq_id: null,
        p_position: null,
      },
    ])
    expect(revalidatePathMock).toHaveBeenCalledWith(`/me/campaigns/${CAMPAIGN}`)
    expect(revalidatePathMock).toHaveBeenCalledWith("/campaigns/chien-dich-mau")
  })

  it("accepted co-organizer editor (#264) updates an FAQ on a live campaign", async () => {
    state.session = { user: { id: EDITOR, email: "e@example.vn", name: "Biên tập" }, accessToken: "tok-e" }
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: managedCampaignRow("live", OWNER) }
      if (call.target === "rpc:my_campaign_roles") return { data: [{ campaign_id: CAMPAIGN, role: "editor" }] }
      if (call.target === "rpc:upsert_campaign_faq") return { data: [{ id: FAQ_1 }] }
      return undefined
    }

    const res = await saveCampaignFaq(CAMPAIGN, FAQ_1, null, makeForm({ question: "Hỏi mới?", answer: "Trả lời mới." }))
    expect(res).toEqual({ ok: true, message: "Đã lưu câu hỏi thường gặp." })
    expect(state.serviceUsed).toBe(false)
  })

  it("refuses outsiders and non-editable statuses before calling upsert_campaign_faq", async () => {
    state.session = { user: { id: OUTSIDER, email: "x@example.vn", name: "Ngoài" }, accessToken: "tok-x" }
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: managedCampaignRow("draft", OWNER) }
      if (call.target === "rpc:my_campaign_roles") return { data: [] }
      return undefined
    }

    const outsiderRes = await saveCampaignFaq(CAMPAIGN, null, null, makeForm({ question: "Q?", answer: "A." }))
    expect(outsiderRes?.ok).toBe(false)
    expect(state.userCalls.some((c) => c.target === "rpc:upsert_campaign_faq")).toBe(false)

    state.session = { user: { id: OWNER, email: "o@example.vn", name: "Chủ" }, accessToken: "tok" }
    state.userCalls.length = 0
    state.handler = (call) =>
      call.target === "rpc:managed_campaigns" ? { data: managedCampaignRow("in_review") } : undefined

    const lockedRes = await saveCampaignFaq(CAMPAIGN, null, null, makeForm({ question: "Q?", answer: "A." }))
    expect(lockedRes?.ok).toBe(false)
    expect(lockedRes?.message).toContain("Chỉ thêm, sửa, xóa hoặc sắp xếp câu hỏi thường gặp")
    expect(state.userCalls.some((c) => c.target === "rpc:upsert_campaign_faq")).toBe(false)
  })

  it("blocks adding a 26th FAQ and maps DB errors to Vietnamese without raw errors", async () => {
    const twentyFive = Array.from({ length: 25 }, (_, i) => ({
      id: `66666666-6666-4666-8666-6666666666${String(i).padStart(2, "0")}`,
      campaign_id: CAMPAIGN,
      question: `Q${i}`,
      answer: `A${i}`,
      position: i,
      created_at: "2026-11-22T00:00:00Z",
      updated_at: "2026-11-22T00:00:00Z",
    }))
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: managedCampaignRow("draft") }
      if (call.target === "campaign_faqs") return { data: twentyFive }
      return undefined
    }

    const capRes = await saveCampaignFaq(CAMPAIGN, null, null, makeForm({ question: "Q26?", answer: "A26." }))
    expect(capRes).toEqual({ ok: false, message: "Mỗi chiến dịch chỉ có tối đa 25 câu hỏi thường gặp." })
    expect(state.userCalls.some((c) => c.target === "rpc:upsert_campaign_faq")).toBe(false)

    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: managedCampaignRow("draft") }
      if (call.target === "rpc:upsert_campaign_faq") {
        return { error: { code: "42501", message: "GIVE_ACCOUNT_NOT_ACTIVE: raw" } }
      }
      return undefined
    }
    const dbErrRes = await saveCampaignFaq(CAMPAIGN, FAQ_1, null, makeForm({ question: "Q?", answer: "A." }))
    expect(dbErrRes?.ok).toBe(false)
    expect(dbErrRes?.message).not.toContain("GIVE_ACCOUNT_NOT_ACTIVE")
    expect(dbErrRes?.message).not.toContain("raw")
  })

  it("deletes and reorders FAQs cleanly via authenticated RPCs", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: managedCampaignRow("approved") }
      if (call.target === "rpc:delete_campaign_faq") return { data: FAQ_1 }
      if (call.target === "campaign_faqs") {
        return {
          data: [
            {
              id: FAQ_1,
              campaign_id: CAMPAIGN,
              question: "Q1",
              answer: "A1",
              position: 0,
              created_at: "",
              updated_at: "",
            },
            {
              id: FAQ_2,
              campaign_id: CAMPAIGN,
              question: "Q2",
              answer: "A2",
              position: 1,
              created_at: "",
              updated_at: "",
            },
          ],
        }
      }
      if (call.target === "rpc:reorder_campaign_faqs") return { data: 2 }
      return undefined
    }

    const delRes = await deleteCampaignFaq(CAMPAIGN, FAQ_1, null, new FormData())
    expect(delRes).toEqual({ ok: true, message: "Đã xóa câu hỏi thường gặp." })
    expect(
      op(
        state.userCalls.find((c) => c.target === "rpc:delete_campaign_faq"),
        "args"
      )
    ).toEqual([{ p_campaign_id: CAMPAIGN, p_faq_id: FAQ_1 }])

    const moveRes = await moveCampaignFaq(CAMPAIGN, FAQ_2, "up", null, new FormData())
    expect(moveRes).toEqual({ ok: true, message: "Đã đổi thứ tự câu hỏi thường gặp." })
    expect(
      op(
        state.userCalls.find((c) => c.target === "rpc:reorder_campaign_faqs"),
        "args"
      )
    ).toEqual([{ p_campaign_id: CAMPAIGN, p_faq_ids: [FAQ_2, FAQ_1] }])
    expect(state.serviceUsed).toBe(false)
  })
})

describe("duplicateCampaignDraft server action (DOS/Give#316)", () => {
  it("owner duplicates a campaign via dbAs RPC, revalidates /me/campaigns, and redirects to the new draft editor", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: managedCampaignRow("succeeded", OWNER) }
      if (call.target === "rpc:duplicate_campaign_draft") {
        return { data: [{ id: NEW_CAMPAIGN, slug: "chien-dich-mau-abcd1234", title: "Bản sao", status: "draft" }] }
      }
      return undefined
    }

    await expect(duplicateCampaignDraft(CAMPAIGN, null, new FormData())).rejects.toThrow(
      `NEXT_REDIRECT:/me/campaigns/${NEW_CAMPAIGN}`
    )
    expect(state.serviceUsed).toBe(false)
    expect(
      op(
        state.userCalls.find((c) => c.target === "rpc:duplicate_campaign_draft"),
        "args"
      )
    ).toEqual([{ p_source_campaign_id: CAMPAIGN }])
    expect(revalidatePathMock).toHaveBeenCalledWith("/me/campaigns")
    expect(redirectMock).toHaveBeenCalledWith(`/me/campaigns/${NEW_CAMPAIGN}`)
  })

  it("strictly refuses co-organizer editors without calling duplicate_campaign_draft", async () => {
    state.session = { user: { id: EDITOR, email: "e@example.vn", name: "Biên tập" }, accessToken: "tok-e" }
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: managedCampaignRow("live", OWNER) }
      return undefined
    }

    const res = await duplicateCampaignDraft(CAMPAIGN, null, new FormData())
    expect(res).toEqual({ ok: false, message: "Không tìm thấy chiến dịch của bạn." })
    expect(state.userCalls.some((c) => c.target === "rpc:duplicate_campaign_draft")).toBe(false)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("refuses suspended campaigns and maps GIVE_ORGANIZER_NOT_ACTIVE cleanly", async () => {
    state.handler = (call) =>
      call.target === "rpc:managed_campaigns" ? { data: managedCampaignRow("suspended", OWNER) } : undefined

    const suspendedRes = await duplicateCampaignDraft(CAMPAIGN, null, new FormData())
    expect(suspendedRes).toEqual({ ok: false, message: "Không thể tạo bản sao từ chiến dịch đang bị tạm dừng." })
    expect(state.userCalls.some((c) => c.target === "rpc:duplicate_campaign_draft")).toBe(false)

    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: managedCampaignRow("live", OWNER) }
      if (call.target === "rpc:duplicate_campaign_draft") {
        return { error: { code: "42501", message: "GIVE_ORGANIZER_NOT_ACTIVE" } }
      }
      return undefined
    }
    const inactiveRes = await duplicateCampaignDraft(CAMPAIGN, null, new FormData())
    expect(inactiveRes).toEqual({
      ok: false,
      message: "Hồ sơ người tổ chức của bạn hiện không hoạt động nên không thể tạo bản sao chiến dịch.",
    })
  })

  it("returns fail and does not redirect when duplicate_campaign_draft returns a missing or non-UUID id", async () => {
    for (const payload of [[], [{ id: "not-a-uuid" }], [{}]]) {
      redirectMock.mockClear()
      revalidatePathMock.mockClear()
      state.handler = (call) => {
        if (call.target === "rpc:managed_campaigns") return { data: managedCampaignRow("live", OWNER) }
        if (call.target === "rpc:duplicate_campaign_draft") return { data: payload }
        return undefined
      }

      const res = await duplicateCampaignDraft(CAMPAIGN, null, new FormData())
      expect(res).toEqual({ ok: false, message: "Chưa tạo được bản sao chiến dịch. Hãy thử lại." })
      expect(redirectMock).not.toHaveBeenCalled()
      expect(revalidatePathMock).not.toHaveBeenCalled()
    }
  })
})
