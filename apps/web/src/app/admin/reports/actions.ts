"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { moderateCampaignReportsSchema, type ModerationAction } from "@/lib/campaign-reports"
import { dbErrorMessage, done, fail, MODERATE_CAMPAIGN_REPORTS_MESSAGES, type ActionResult } from "@/lib/errors"
import { MODERATION_ROLES } from "@/lib/evidence-moderation"
import { isUuid } from "@/lib/ids"
import { dbAs, dbService } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * A moderator or admin acts on the unresolved reports of a campaign
 * (DOS/Give#98): dismiss, ask the organizer (sends a moderator_inquiry notice
 * with only the moderator's note), suspend an approved or live campaign, or
 * stop payment requests of a succeeded back campaign.
 *
 * give.moderate_campaign_reports runs as the service role with p_actor_id,
 * locks the staff row, blocks self-review and writes the audit rows. Because
 * getSession() does not verify the JWT signature, the role check below runs
 * with the moderator's own token first so PostgREST verifies the token before
 * the service-role call runs.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

function doneMessage(action: ModerationAction, changed: number): string {
  switch (action) {
    case "dismiss":
      return changed > 0
        ? `Đã bác bỏ ${changed} báo cáo của chiến dịch.`
        : "Không còn báo cáo chờ xử lý nào của chiến dịch này."
    case "ask_organizer":
      return changed > 0
        ? "Đã gửi câu hỏi cho người tổ chức và chuyển các báo cáo mới sang chờ phản hồi."
        : "Không còn báo cáo mới nào để gửi câu hỏi (các báo cáo hiện tại đã ở trạng thái chờ người tổ chức phản hồi)."
    case "suspend":
      return "Đã tạm dừng chiến dịch và chốt các báo cáo đang mở."
    case "stop_payment_requests":
      return "Đã tạm dừng yêu cầu thanh toán, thông báo cho người ủng hộ đang chờ thanh toán và người tạo dự án, và chốt các báo cáo đang mở."
  }
}

export async function moderateCampaignReports(
  campaignId: string,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(campaignId)) return fail(MODERATE_CAMPAIGN_REPORTS_MESSAGES.GIVE_CAMPAIGN_NOT_FOUND)

  const parsed = moderateCampaignReportsSchema.safeParse(formFields(form, ["action", "reason", "public_note"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const role = await dbAs(session.accessToken).rpc("is_admin", { p_roles: MODERATION_ROLES })
  if (role.error) return fail(dbErrorMessage(role.error, MODERATE_CAMPAIGN_REPORTS_MESSAGES))
  if (role.data !== true) return fail(MODERATE_CAMPAIGN_REPORTS_MESSAGES.GIVE_NOT_ADMIN)

  const { data, error } = await dbService().rpc("moderate_campaign_reports", {
    p_campaign_id: campaignId,
    p_actor_id: session.user.id,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason,
    p_public_note: parsed.data.public_note,
  })
  if (error) return fail(dbErrorMessage(error, MODERATE_CAMPAIGN_REPORTS_MESSAGES))

  revalidatePath("/admin/reports")
  if (parsed.data.action === "ask_organizer") {
    revalidatePath("/me/notices")
  } else if (parsed.data.action === "suspend") {
    revalidatePath("/admin")
    revalidatePath(`/me/campaigns/${campaignId}`)
    revalidatePath("/me/campaigns")
    revalidatePath("/me/notices")
    revalidatePath("/campaigns/[slug]", "page")
    revalidatePath("/campaigns/[slug]/pledge", "page")
    revalidatePath("/campaigns/[slug]/statement", "page")
    revalidatePath("/me/pledges/[code]", "page")
    revalidatePath("/u/[handle]", "page")
    revalidatePath("/campaigns")
    revalidatePath("/")
  } else if (parsed.data.action === "stop_payment_requests") {
    revalidatePath("/admin/payment-requests")
    revalidatePath(`/me/campaigns/${campaignId}`)
    revalidatePath("/me/contributions")
    revalidatePath("/me/notices")
    revalidatePath("/campaigns/[slug]", "page")
    revalidatePath("/me/pledges/[code]", "page")
  }

  return done(doneMessage(parsed.data.action, typeof data === "number" ? data : 0))
}
