"use server"

import { getSession } from "@/lib/auth/session"
import { reportCampaignSchema } from "@/lib/campaign-reports"
import { isPublicStatus, type CampaignStatus } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, REPORT_CAMPAIGN_MESSAGES, type ActionResult } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { dbAs, dbService } from "@/lib/supabase"
import { firstError, formFields } from "@/lib/validation"

/**
 * A signed-in visitor reports that a public campaign violates Give's rules
 * (DOS/Give#98). give.report_campaign runs as the service role with the
 * reporter's id as an argument, enforces the 24-hour per-reporter limit and
 * writes the audit row. Because getSession() decodes the cookie without
 * cryptographic verification, the campaign is first read with the reporter's
 * own token: PostgREST verifies that token, proving the user id, and the read
 * checks that the campaign is public before the service-role call runs.
 */

const SIGNED_OUT = "Hãy đăng nhập để báo cáo chiến dịch."
const NOT_FOUND = REPORT_CAMPAIGN_MESSAGES.GIVE_CAMPAIGN_NOT_FOUND

export async function reportCampaign(campaignId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(campaignId)) return fail(NOT_FOUND)

  const parsed = reportCampaignSchema.safeParse(formFields(form, ["reason_code", "details"]))
  if (!parsed.success) return fail(firstError(parsed.error))

  const visible = await dbAs(session.accessToken)
    .from("campaigns")
    .select("id, status")
    .eq("id", campaignId)
    .maybeSingle()
  if (visible.error) {
    return fail(
      visible.error.code?.startsWith("PGRST30")
        ? "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
        : dbErrorMessage(visible.error, REPORT_CAMPAIGN_MESSAGES)
    )
  }
  const campaign = visible.data as { id: string; status: CampaignStatus } | null
  if (!campaign || !isPublicStatus(campaign.status)) return fail(NOT_FOUND)

  const { error } = await dbService().rpc("report_campaign", {
    p_campaign_id: campaignId,
    p_actor_id: session.user.id,
    p_reason_code: parsed.data.reason_code,
    p_details: parsed.data.details,
  })
  if (error) return fail(dbErrorMessage(error, REPORT_CAMPAIGN_MESSAGES))

  return done("Cảm ơn bạn. Đội kiểm duyệt Give đã nhận báo cáo và sẽ xem xét chiến dịch này.")
}
