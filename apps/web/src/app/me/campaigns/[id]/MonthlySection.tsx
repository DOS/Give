import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { buttonClass } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { isEditableStatus, type CampaignStatus } from "@/lib/campaigns"
import { formatDate } from "@/lib/format"
import { dbService } from "@/lib/supabase"

import { Panel } from "../../_components/Panel"
import { setCampaignMonthly } from "../actions"

/** An active monthly supporter as give.campaign_plan_supporters returns it: a name only, never an email or amount. */
export interface PlanSupporter {
  /** NULL when the donor chose to be anonymous. */
  display_name: string | null
  is_anonymous: boolean
  since: string
}

/** Statuses after which monthly giving can no longer change (plans ended with the campaign). */
const FINISHED_STATUSES: readonly CampaignStatus[] = ["closed", "cancelled", "settling", "succeeded", "failed"]

export const MONTHLY_OFF_WARNING =
  "Tắt ủng hộ hằng tháng sẽ dừng kế hoạch của mọi người đang ủng hộ hằng tháng: Give không tạo mã và không nhắc họ cho các tháng sau nữa. Mã ủng hộ của tháng này vẫn dùng được."

/**
 * Whether the organizer workspace shows the monthly section at all: give
 * campaigns only, and not once they closed or were cancelled.
 */
export function showMonthlySection(type: string, status: CampaignStatus): boolean {
  return type === "give" && !FINISHED_STATUSES.includes(status)
}

/**
 * campaigns.allow_monthly (DOS-Me 20261125120000_give_donation_plans). The
 * workspace reads the campaign with `*`, so the column arrives with the row.
 */
export function campaignAllowsMonthly(campaign: object): boolean {
  return (campaign as { allow_monthly?: unknown }).allow_monthly === true
}

/**
 * The active monthly supporters of a campaign. give.campaign_plan_supporters
 * is service_role only and re-checks that `actorId` organizes the campaign,
 * so call it only after the caller's own token loaded the campaign.
 */
export async function loadPlanSupporters(campaignId: string, actorId: string): Promise<PlanSupporter[]> {
  const { data, error } = await dbService().rpc("campaign_plan_supporters", {
    p_campaign_id: campaignId,
    p_actor: actorId,
  })
  if (error) throw error
  return (data ?? []) as PlanSupporter[]
}

/**
 * Monthly giving, plan A (DOS/Give#276, design 4.3.2 and 4.3.4): off by
 * default; the organizer turns it on for a give campaign with an end date.
 * Give then reminds each subscribed donor every month with a fresh code;
 * nothing is ever charged. Turning it off ends every active plan.
 */
export function MonthlySection({
  campaignId,
  status,
  endsAt,
  allowMonthly,
  supporters,
  now = new Date(),
}: {
  campaignId: string
  status: CampaignStatus
  endsAt: string | null
  allowMonthly: boolean
  /** The active supporters when monthly giving is on; null when they could not be read. */
  supporters: PlanSupporter[] | null
  now?: Date
}) {
  const ended = endsAt !== null && new Date(endsAt) <= now
  const canTurnOn = endsAt !== null && !ended

  return (
    <Panel
      id="monthly"
      title="Ủng hộ hằng tháng"
      description={
        <div className="max-w-[68ch] space-y-2">
          <p>
            Khi bật, người ủng hộ có thể đăng ký ủng hộ chiến dịch mỗi tháng. Mỗi tháng Give gửi cho họ một mã ủng hộ
            mới kèm mã VietQR. Give không tự trừ tiền của ai: người ủng hộ tự chuyển khoản nếu muốn, và mỗi tháng là một
            khoản ủng hộ bình thường vào tài khoản nhận của chiến dịch.
          </p>
          <p>
            Bạn sẽ có thêm nhiều khoản chuyển nhỏ cần đối chiếu, nên tính năng này mặc định tắt. Ủng hộ hằng tháng chỉ
            bật được cho chiến dịch có ngày kết thúc, và mọi kế hoạch tự dừng khi chiến dịch kết thúc.
          </p>
        </div>
      }
    >
      <div className="max-w-160 space-y-6">
        <p className="flex flex-wrap items-center gap-2 text-fg">
          Trạng thái: {allowMonthly ? <Badge tone="brand">Đang bật</Badge> : <Badge>Đang tắt</Badge>}
        </p>

        {allowMonthly && <Supporters supporters={supporters} />}

        {ended ? (
          <p className="text-muted">
            Chiến dịch đã quá ngày kết thúc nên không đổi được ủng hộ hằng tháng; các kế hoạch tự dừng.
          </p>
        ) : allowMonthly ? (
          <ActionForm
            action={setCampaignMonthly.bind(null, campaignId)}
            confirm={`${MONTHLY_OFF_WARNING} Tiếp tục?`}
            className="space-y-4 border-t border-border pt-6"
          >
            <input type="hidden" name="enabled" value="false" />
            {isEditableStatus(status) && (
              <p className="text-sm text-muted">Khi đang bật, bạn không bỏ được ngày kết thúc của chiến dịch.</p>
            )}
            <Callout tone="warning">{MONTHLY_OFF_WARNING}</Callout>
            <SubmitButton className={buttonClass({ variant: "danger" })}>Tắt ủng hộ hằng tháng</SubmitButton>
          </ActionForm>
        ) : (
          <ActionForm
            action={setCampaignMonthly.bind(null, campaignId)}
            className="space-y-4 border-t border-border pt-6"
          >
            <input type="hidden" name="enabled" value="true" />
            {!canTurnOn && (
              <p className="text-warning">
                Ủng hộ hằng tháng chỉ bật được cho chiến dịch có ngày kết thúc.
                {isEditableStatus(status) ? " Đặt ngày kết thúc ở mục Nội dung rồi lưu, sau đó bật ở đây." : ""}
              </p>
            )}
            <SubmitButton className={buttonClass({ variant: "secondary" })} disabled={!canTurnOn}>
              Bật ủng hộ hằng tháng
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </Panel>
  )
}

function Supporters({ supporters }: { supporters: PlanSupporter[] | null }) {
  if (!supporters) {
    return <Callout tone="danger">Không tải được danh sách người ủng hộ hằng tháng. Hãy tải lại trang.</Callout>
  }
  if (supporters.length === 0) {
    return <p className="text-muted">Chưa có ai đăng ký ủng hộ hằng tháng.</p>
  }
  return (
    <div className="space-y-3">
      <p className="text-fg">
        Đang có <span className="font-semibold tabular-nums">{supporters.length}</span> người ủng hộ hằng tháng.
      </p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {supporters.map((supporter, index) => (
          <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
            <span className="min-w-0 break-words text-fg">
              {supporter.is_anonymous || !supporter.display_name ? "Ẩn danh" : supporter.display_name}
            </span>
            <span className="text-sm text-muted tabular-nums">từ {formatDate(supporter.since)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
