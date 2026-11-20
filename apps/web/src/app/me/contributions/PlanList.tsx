import Link from "next/link"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"
import { RefCode } from "@/components/ui/RefCode"
import { donationStatusLabel } from "@/lib/contributions"
import { formatDate, formatVnd } from "@/lib/format"
import {
  NEW_CODE_EVERY_MONTH,
  periodLabel,
  planAmountLabel,
  planDayLabel,
  planDonationPayable,
  planEndedReasonLabel,
} from "@/lib/plans"

import { DONATION_TONES, toneOf } from "../_components/tones"
import { cancelPlan, updatePlan } from "./actions"

export interface MyPlan {
  id: string
  campaign_id: string
  amount: number
  day_of_month: number
  status: string
  ended_reason: string | null
  next_period: string
  created_at: string
  ended_at: string | null
  campaign: { slug: string; title: string; status: string; ends_at: string | null } | null
}

/** A plan donation of the donor, as the contributions list reads it. */
export interface PlanDonation {
  campaign_id: string
  reference_code: string
  intended_amount: number
  received_amount: number
  status: string
  plan_id: string | null
  plan_period: string | null
}

/** The first day of the current month in Vietnam time (UTC+7), as YYYY-MM-DD. */
/** The month the cron issues next: next_period, or this month when next_period is in the past (YYYY-MM-DD compares as text). */
export function effectiveNextPeriod(nextPeriod: string, month: string): string {
  return nextPeriod < month ? month : nextPeriod
}

export function vnMonthStart(now = new Date()): string {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}-01`
}

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)
const plainNumber = new Intl.NumberFormat("vi-VN")

/**
 * "Ủng hộ hằng tháng" on /me/contributions (DOS/Give#276): each plan with its
 * campaign, amount and day; an active plan shows this month's donation (a
 * button to pay it while its QR shows), a form to change the amount and day
 * and a way to stop it. Ended plans say why. Nothing here says a month is
 * owed: a plan is an intention, never a debt.
 */
export function PlanList({
  plans,
  donations,
  now = new Date(),
}: {
  plans: MyPlan[]
  donations: PlanDonation[]
  now?: Date
}) {
  const month = vnMonthStart(now)
  // Active plans first, each group newest first (the query's order).
  const ordered = [...plans.filter((p) => p.status === "active"), ...plans.filter((p) => p.status !== "active")]
  return (
    <section aria-labelledby="monthly-plans-title" className="space-y-4">
      <div>
        <h2 id="monthly-plans-title" className="text-h2">
          Ủng hộ hằng tháng
        </h2>
        <p className="mt-2 max-w-[68ch] text-sm text-fg">{NEW_CODE_EVERY_MONTH}</p>
      </div>
      <ul className="divide-y divide-border card">
        {ordered.map((plan) => (
          <PlanItem
            key={plan.id}
            plan={plan}
            month={month}
            now={now}
            // This month's donation of the campaign: a plan cancelled and signed
            // up again in the same month keeps the earlier plan's donation.
            current={
              donations.find(
                (d) => d.plan_id !== null && d.plan_period === month && d.campaign_id === plan.campaign_id
              ) ?? null
            }
          />
        ))}
      </ul>
    </section>
  )
}

function PlanItem({
  plan,
  month,
  now,
  current,
}: {
  plan: MyPlan
  month: string
  now: Date
  current: PlanDonation | null
}) {
  const active = plan.status === "active"
  const payable =
    active &&
    current !== null &&
    plan.campaign !== null &&
    planDonationPayable({ ...current, campaign: plan.campaign }, now)
  // Not issued yet this month: a change applies to this month's code too. A
  // next_period left in a past month (campaign suspended, cron down) jumps
  // to this month when the cron issues, so it counts as this month.
  const appliesThisMonth = active && current === null && effectiveNextPeriod(plan.next_period, month) === month
  return (
    <li className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={active ? "brand" : "neutral"}>{active ? "Đang nhắc hằng tháng" : "Đã dừng"}</Badge>
            {!active && (
              <span className="text-sm text-muted">
                {planEndedReasonLabel(plan.ended_reason)}
                {plan.ended_at && ` · ${formatDate(plan.ended_at)}`}
              </span>
            )}
          </div>
          {plan.campaign ? (
            <Link
              href={`/campaigns/${plan.campaign.slug}`}
              className="mt-2 block text-h3 break-words text-fg hover:text-primary hover:underline"
            >
              {plan.campaign.title}
            </Link>
          ) : (
            <p className="mt-2 text-h3 text-muted">Chiến dịch không còn công khai</p>
          )}
          <p className="mt-1 text-fg">
            {planAmountLabel(plan.amount)} · {planDayLabel(plan.day_of_month)}
          </p>
          {active && <CurrentMonth plan={plan} month={month} current={current} payable={payable} />}
        </div>
        {payable && current && (
          <ButtonLink href={`/donations/${current.reference_code}`} className="shrink-0">
            Chuyển khoản tháng này
          </ButtonLink>
        )}
      </div>
      {active && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <details className="min-w-0 flex-1">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
              Sửa số tiền hoặc ngày
            </summary>
            <ActionForm action={updatePlan.bind(null, plan.id)} className="mt-3 max-w-md space-y-4">
              <Field htmlFor={`plan-amount-${plan.id}`} label="Số tiền mỗi tháng (đồng)">
                <input
                  id={`plan-amount-${plan.id}`}
                  name="amount"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  defaultValue={plainNumber.format(plan.amount)}
                  className="field font-semibold tabular-nums"
                />
              </Field>
              <Field htmlFor={`plan-day-${plan.id}`} label="Ngày nhắc hằng tháng">
                <select
                  id={`plan-day-${plan.id}`}
                  name="day_of_month"
                  defaultValue={String(plan.day_of_month)}
                  className="field"
                >
                  {DAYS.map((day) => (
                    <option key={day} value={day}>
                      Ngày {day}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="hint">
                {appliesThisMonth
                  ? "Áp dụng từ mã ủng hộ tháng này."
                  : "Áp dụng từ tháng sau; mã ủng hộ tháng này giữ nguyên số tiền."}
              </p>
              <SubmitButton className={buttonClass({ variant: "secondary" })}>Lưu thay đổi</SubmitButton>
            </ActionForm>
          </details>
          <ActionForm
            action={cancelPlan.bind(null, plan.id)}
            confirm="Dừng ủng hộ hằng tháng cho chiến dịch này? Give sẽ không nhắc và không tạo mã mới nữa. Mã ủng hộ đã có của tháng này vẫn dùng được."
            className="shrink-0 sm:max-w-64"
          >
            <SubmitButton className={buttonClass({ variant: "secondary" })}>Dừng ủng hộ hằng tháng</SubmitButton>
            <p className="hint">Mã ủng hộ đã có của tháng này vẫn dùng được.</p>
          </ActionForm>
        </div>
      )}
    </li>
  )
}

function CurrentMonth({
  plan,
  month,
  current,
  payable,
}: {
  plan: MyPlan
  month: string
  current: PlanDonation | null
  payable: boolean
}) {
  if (!current) {
    // Not issued yet: the plan's next donation comes on its day of that month
    // (never a past month: the cron skips past months).
    const next = effectiveNextPeriod(plan.next_period, month)
    return (
      <p className="mt-1 text-sm text-muted">
        {`Mã ủng hộ tháng ${periodLabel(next)} sẽ có vào ngày ${plan.day_of_month}/${periodLabel(next)}.`}
      </p>
    )
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
      <span>Tháng {periodLabel(month)}:</span>
      {current.status === "received" ? (
        <span className="text-fg">Đã nhận {formatVnd(current.received_amount)}. Cảm ơn bạn!</span>
      ) : payable ? (
        <span className="text-fg">
          Chờ chuyển khoản {formatVnd(current.intended_amount)}, mã <RefCode>{current.reference_code}</RefCode>
        </span>
      ) : (
        <>
          <Badge tone={toneOf(DONATION_TONES, current.status)}>
            {current.status === "awaiting_transfer"
              ? "Chiến dịch hiện không nhận chuyển khoản"
              : donationStatusLabel(current.status)}
          </Badge>
          <Link href={`/donations/${current.reference_code}`} className="link">
            Xem trạng thái
          </Link>
        </>
      )}
    </p>
  )
}
