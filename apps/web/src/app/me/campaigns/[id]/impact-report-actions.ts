"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { getMyCampaignRole } from "@/lib/campaign-members"
import type { CampaignStatus } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { dbAs } from "@/lib/supabase"
import { canEditImpactReport, impactReportSchema, readImpactHighlightsFromForm } from "@/lib/transparency"
import { firstError } from "@/lib/validation"

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_FOUND = "Không tìm thấy chiến dịch của bạn."

interface ManagedCampaignRow {
  id: string
  slug: string
  status: CampaignStatus
  organizer_id: string
}

/**
 * Drafts, publishes, or updates a campaign's Closing Impact Report via
 * `give.upsert_campaign_impact_report` (DOS/Give#314).
 *
 * Allowed for the owning organizer OR an active accepted co-organizer editor
 * (#264 narrative scope), strictly when campaign status is `closed`,
 * `succeeded`, or `settling`. Executes under the caller's authenticated JWT
 * (`dbAs(session.accessToken)`), never `dbService()`.
 */
export async function saveImpactReport(
  campaignId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(campaignId)) return fail(NOT_FOUND)

  const parsed = impactReportSchema.safeParse({
    summary: String(form.get("summary") ?? ""),
    highlights: readImpactHighlightsFromForm(form),
    intent: String(form.get("intent") ?? "draft"),
  })
  if (!parsed.success) return fail(firstError(parsed.error))

  const db = dbAs(session.accessToken)
  const { data: campaignData, error: campaignError } = await db
    .rpc("managed_campaigns", { p_campaign_id: campaignId })
    .select("id, slug, status, organizer_id")
    .maybeSingle()
  if (campaignError) return fail(dbErrorMessage(campaignError))

  const campaign = campaignData as ManagedCampaignRow | null
  if (!campaign) return fail(NOT_FOUND)

  const isOwner = campaign.organizer_id === session.user.id
  if (!isOwner) {
    try {
      const role = await getMyCampaignRole(db, campaign.id)
      if (role !== "editor") return fail(NOT_FOUND)
    } catch (roleError) {
      return fail(dbErrorMessage(roleError as DbErrorLike))
    }
  }

  if (!canEditImpactReport(campaign.status)) {
    return fail(dbErrorMessage({ message: "GIVE_IMPACT_REPORT_STATUS_NOT_ALLOWED" }))
  }

  const publish = parsed.data.intent === "publish"
  const { error } = await db
    .rpc("upsert_campaign_impact_report", {
      p_campaign_id: campaign.id,
      p_summary: parsed.data.summary,
      p_highlights: parsed.data.highlights,
      p_publish: publish,
    })
    .single()
  if (error) return fail(dbErrorMessage(error))

  revalidatePath(`/me/campaigns/${campaign.id}`)
  revalidatePath(`/campaigns/${campaign.slug}`)
  revalidatePath("/u/[handle]", "page")

  return done(
    publish
      ? "Đã công bố báo cáo tổng kết tác động lên trang chiến dịch."
      : "Đã lưu bản nháp báo cáo tổng kết (chưa công khai)."
  )
}
