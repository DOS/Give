"use server"

import { revalidatePath } from "next/cache"

import { getSession, type Session } from "@/lib/auth/session"
import { canEditFaqs, listCampaignFaqs, MAX_CAMPAIGN_FAQS, moveFaqOrder, sortFaqs } from "@/lib/campaign-faqs"
import { getMyCampaignRole } from "@/lib/campaign-members"
import { getCampaignById, type CampaignWithRefs } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { dbAs } from "@/lib/supabase"
import { campaignFaqSchema, firstError, formFields } from "@/lib/validation"

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_FOUND = "Không tìm thấy chiến dịch của bạn."
const FAQ_NOT_EDITABLE =
  "Chỉ thêm, sửa, xóa hoặc sắp xếp câu hỏi thường gặp khi chiến dịch là bản nháp, cần chỉnh sửa, đã duyệt hoặc đang mở."

const FAQ_MESSAGES: Record<string, string> = {
  GIVE_CAMPAIGN_NOT_EDITABLE: FAQ_NOT_EDITABLE,
}

async function loadEditableFaqCampaign(
  session: Session,
  campaignId: string
): Promise<{ campaign: CampaignWithRefs; error: null } | { campaign: null; error: string }> {
  if (!isUuid(campaignId)) return { campaign: null, error: NOT_FOUND }
  const db = dbAs(session.accessToken)
  let campaign: CampaignWithRefs | null
  try {
    campaign = await getCampaignById(db, campaignId)
  } catch (error) {
    return { campaign: null, error: dbErrorMessage(error as DbErrorLike) }
  }
  if (!campaign) return { campaign: null, error: NOT_FOUND }
  if (campaign.organizer_id !== session.user.id) {
    try {
      const role = await getMyCampaignRole(db, campaign.id)
      if (role !== "editor") return { campaign: null, error: NOT_FOUND }
    } catch (error) {
      return { campaign: null, error: dbErrorMessage(error as DbErrorLike) }
    }
  }
  return { campaign, error: null }
}

function refreshFaq(campaign: Pick<CampaignWithRefs, "id" | "slug">) {
  revalidatePath(`/me/campaigns/${campaign.id}`)
  revalidatePath(`/campaigns/${campaign.slug}`)
}

/** Creates a new FAQ (faqId null) or updates an existing FAQ on a campaign (DOS/Give#316). */
export async function saveCampaignFaq(
  campaignId: string,
  faqId: string | null,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (faqId !== null && !isUuid(faqId)) return fail(dbErrorMessage({ message: "GIVE_FAQ_NOT_FOUND" }))

  const { campaign, error: loadError } = await loadEditableFaqCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (!canEditFaqs(campaign.status)) return fail(FAQ_NOT_EDITABLE)

  const parsed = campaignFaqSchema.safeParse(formFields(form, ["question", "answer"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const db = dbAs(session.accessToken)
  if (faqId === null) {
    try {
      const existing = await listCampaignFaqs(db, campaign.id)
      if (existing.length >= MAX_CAMPAIGN_FAQS) {
        return fail(dbErrorMessage({ message: "GIVE_FAQ_LIMIT_EXCEEDED" }))
      }
    } catch (error) {
      return fail(dbErrorMessage(error as DbErrorLike, FAQ_MESSAGES))
    }
  }

  const { error } = await db.rpc("upsert_campaign_faq", {
    p_campaign_id: campaign.id,
    p_question: parsed.data.question,
    p_answer: parsed.data.answer,
    p_faq_id: faqId,
    p_position: null,
  })
  if (error) return fail(dbErrorMessage(error, FAQ_MESSAGES))

  refreshFaq(campaign)
  return done(faqId === null ? "Đã thêm câu hỏi thường gặp." : "Đã lưu câu hỏi thường gặp.")
}

/** Deletes a single FAQ on a campaign (DOS/Give#316). */
export async function deleteCampaignFaq(
  campaignId: string,
  faqId: string,
  _state: ActionResult,
  _form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(faqId)) return fail(dbErrorMessage({ message: "GIVE_FAQ_NOT_FOUND" }))

  const { campaign, error: loadError } = await loadEditableFaqCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (!canEditFaqs(campaign.status)) return fail(FAQ_NOT_EDITABLE)

  const { error } = await dbAs(session.accessToken).rpc("delete_campaign_faq", {
    p_campaign_id: campaign.id,
    p_faq_id: faqId,
  })
  if (error) return fail(dbErrorMessage(error, FAQ_MESSAGES))

  refreshFaq(campaign)
  return done("Đã xóa câu hỏi thường gặp.")
}

/** Moves an FAQ one step up or down via give.reorder_campaign_faqs (DOS/Give#316). */
export async function moveCampaignFaq(
  campaignId: string,
  faqId: string,
  direction: "up" | "down",
  _state: ActionResult,
  _form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(faqId) || (direction !== "up" && direction !== "down")) {
    return fail(dbErrorMessage({ message: "GIVE_FAQ_NOT_FOUND" }))
  }

  const { campaign, error: loadError } = await loadEditableFaqCampaign(session, campaignId)
  if (!campaign) return fail(loadError)
  if (!canEditFaqs(campaign.status)) return fail(FAQ_NOT_EDITABLE)

  const db = dbAs(session.accessToken)
  let faqs
  try {
    faqs = await listCampaignFaqs(db, campaign.id)
  } catch (error) {
    return fail(dbErrorMessage(error as DbErrorLike, FAQ_MESSAGES))
  }

  const order = moveFaqOrder(
    sortFaqs(faqs).map((faq) => faq.id),
    faqId,
    direction
  )
  if (!order) return fail(dbErrorMessage({ message: "GIVE_FAQ_ORDER_INVALID" }))

  const { error } = await db.rpc("reorder_campaign_faqs", {
    p_campaign_id: campaign.id,
    p_faq_ids: order,
  })
  if (error) return fail(dbErrorMessage(error, FAQ_MESSAGES))

  refreshFaq(campaign)
  return done("Đã đổi thứ tự câu hỏi thường gặp.")
}
