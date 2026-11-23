import { describe, expect, it } from "vitest"

import {
  canDuplicateCampaign,
  canEditFaqs,
  listCampaignFaqs,
  moveFaqOrder,
  sortFaqs,
  type CampaignFaq,
} from "@/lib/campaign-faqs"
import type { CampaignStatus, Db } from "@/lib/campaigns"
import { dbErrorMessage } from "@/lib/errors"
import { campaignFaqSchema } from "@/lib/validation"
import { fakeDb, op, type Call } from "@/test/fake-db"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

function faq(id: string, position: number): CampaignFaq {
  return {
    id,
    campaign_id: CAMPAIGN,
    question: `Câu hỏi ${id}`,
    answer: `Trả lời ${id}`,
    position,
    created_at: "2026-11-22T00:00:00Z",
    updated_at: "2026-11-22T00:00:00Z",
  }
}

describe("campaign-faqs helpers (DOS/Give#316)", () => {
  it("allows FAQ editing only on draft, changes_requested, approved, and live", () => {
    const allowed: CampaignStatus[] = ["draft", "changes_requested", "approved", "live"]
    const blocked: CampaignStatus[] = [
      "in_review",
      "settling",
      "succeeded",
      "failed",
      "closed",
      "suspended",
      "cancelled",
    ]
    for (const s of allowed) expect(canEditFaqs(s)).toBe(true)
    for (const s of blocked) expect(canEditFaqs(s)).toBe(false)
  })

  it("allows campaign duplication strictly for owners on non-suspended campaigns", () => {
    expect(canDuplicateCampaign("owner", "draft")).toBe(true)
    expect(canDuplicateCampaign("owner", "live")).toBe(true)
    expect(canDuplicateCampaign("owner", "succeeded")).toBe(true)
    expect(canDuplicateCampaign("owner", "closed")).toBe(true)
    expect(canDuplicateCampaign("owner", "suspended")).toBe(false)

    const statuses: CampaignStatus[] = ["draft", "changes_requested", "approved", "live", "succeeded", "suspended"]
    for (const s of statuses) expect(canDuplicateCampaign("editor", s)).toBe(false)
  })

  it("sorts FAQs by position then id without mutating input", () => {
    const input = [faq("b", 2), faq("c", 1), faq("a", 1)]
    const sorted = sortFaqs(input)
    expect(sorted.map((f) => f.id)).toEqual(["a", "c", "b"])
    expect(input.map((f) => f.id)).toEqual(["b", "c", "a"])
  })

  it("moves FAQ id one step up or down and returns null at boundaries or when missing", () => {
    const ids = ["a", "b", "c"]
    expect(moveFaqOrder(ids, "b", "up")).toEqual(["b", "a", "c"])
    expect(moveFaqOrder(ids, "b", "down")).toEqual(["a", "c", "b"])
    expect(moveFaqOrder(ids, "a", "up")).toBeNull()
    expect(moveFaqOrder(ids, "c", "down")).toBeNull()
    expect(moveFaqOrder(ids, "missing", "up")).toBeNull()
  })

  it("lists campaign FAQs with non-PII columns ordered by position and id", async () => {
    const calls: Call[] = []
    const rows = [faq("f1", 0), faq("f2", 1)]
    const db = fakeDb((call) => (call.target === "campaign_faqs" ? { data: rows } : undefined), calls) as unknown as Db

    const result = await listCampaignFaqs(db, CAMPAIGN)
    expect(result).toEqual(rows)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.target).toBe("campaign_faqs")
    expect(op(calls[0], "select")).toEqual(["id, campaign_id, question, answer, position, created_at, updated_at"])
    expect(op(calls[0], "eq")).toEqual(["campaign_id", CAMPAIGN])
  })

  it("validates FAQ question/answer bounds via campaignFaqSchema", () => {
    expect(campaignFaqSchema.safeParse({ question: "  Hỏi?  ", answer: "  Đáp.\nDòng 2  " }).success).toBe(true)
    expect(campaignFaqSchema.safeParse({ question: "   \t\n ", answer: "Đáp." }).success).toBe(false)
    expect(campaignFaqSchema.safeParse({ question: "a".repeat(301), answer: "Đáp." }).success).toBe(false)
    expect(campaignFaqSchema.safeParse({ question: "Hỏi?", answer: "  \n " }).success).toBe(false)
    const tooLong = campaignFaqSchema.safeParse({ question: "Hỏi?", answer: "a".repeat(4001) })
    expect(tooLong.success).toBe(false)
    if (!tooLong.success) {
      expect(tooLong.error.issues[0]?.message).toBe("Câu trả lời tối đa 4.000 ký tự.")
    }
  })

  it("maps every FAQ & duplicate DB error code to Vietnamese copy without raw DB leaks", () => {
    const codes = [
      "GIVE_FAQ_QUESTION_INVALID",
      "GIVE_FAQ_ANSWER_INVALID",
      "GIVE_FAQ_POSITION_INVALID",
      "GIVE_FAQ_LIMIT_EXCEEDED",
      "GIVE_FAQ_NOT_FOUND",
      "GIVE_FAQ_ORDER_INVALID",
      "GIVE_FAQ_IMMUTABLE",
      "GIVE_ACCOUNT_NOT_ACTIVE",
      "GIVE_ORGANIZER_NOT_ACTIVE",
      "GIVE_CAMPAIGN_SUSPENDED",
    ]
    for (const code of codes) {
      const msg = dbErrorMessage({ message: `${code}: internal detail` })
      expect(msg).not.toContain(code)
      expect(msg).not.toContain("internal detail")
      expect(msg).not.toBe("Có lỗi xảy ra. Hãy thử lại sau.")
    }
    expect(dbErrorMessage({ message: "GIVE_FAQ_ANSWER_INVALID" })).toBe("Câu trả lời phải từ 1 đến 4.000 ký tự.")
    expect(dbErrorMessage({ message: 'relation "give.campaign_faqs" boom' })).toBe("Có lỗi xảy ra. Hãy thử lại sau.")
  })
})
