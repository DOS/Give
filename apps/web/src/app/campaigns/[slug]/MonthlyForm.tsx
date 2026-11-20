import { ActionForm, SubmitButton } from "@/components/forms"
import { buttonClass } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"
import { PLAN_ANONYMITY_WARNING } from "@/lib/plans"

import { startMonthlyPlan } from "./monthly-actions"

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

/** Today's day of the month in Vietnam time, kept to 1-28 (a plan's day). */
export function defaultPlanDay(now = new Date()): number {
  const vnDay = new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCDate()
  return Math.min(vnDay, 28)
}

/**
 * Monthly sign-up for a signed-in donor (DOS/Give#276, design 4.3.4): an
 * amount and a day each month, on which Give sends a fresh donation code and
 * VietQR. Nothing is charged; the action opens this month's payment page.
 */
export function MonthlyForm({
  campaignId,
  defaultName,
  defaultDay = defaultPlanDay(),
}: {
  campaignId: string
  defaultName: string
  defaultDay?: number
}) {
  return (
    <ActionForm action={startMonthlyPlan.bind(null, campaignId)} className="space-y-6">
      <Field htmlFor="monthly-amount" label="Số tiền mỗi tháng (đồng)">
        <input
          id="monthly-amount"
          name="amount"
          required
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ví dụ: 200.000"
          className="field font-semibold tabular-nums placeholder:font-normal"
        />
      </Field>
      <Field
        htmlFor="monthly-day"
        label="Ngày nhắc hằng tháng"
        hint="Từ ngày 1 đến 28, để tháng nào cũng có ngày đó."
        hintId="monthly-day-hint"
      >
        <select
          id="monthly-day"
          name="day_of_month"
          defaultValue={String(defaultDay)}
          aria-describedby="monthly-day-hint"
          className="field"
        >
          {DAYS.map((day) => (
            <option key={day} value={day}>
              Ngày {day}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor="monthly-name" label="Tên hiển thị">
        <input
          id="monthly-name"
          name="public_name"
          maxLength={80}
          defaultValue={defaultName}
          autoComplete="name"
          className="field"
        />
      </Field>
      <div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
          <input
            type="checkbox"
            name="anonymous"
            aria-describedby="monthly-anonymous-hint"
            className="mt-1 size-5 shrink-0 accent-primary"
          />
          <span className="font-medium text-fg">Ủng hộ ẩn danh</span>
        </label>
        <p id="monthly-anonymous-hint" className="hint">
          {PLAN_ANONYMITY_WARNING}
        </p>
      </div>
      <Field htmlFor="monthly-message" label="Lời nhắn (không bắt buộc)">
        <textarea id="monthly-message" name="message" rows={3} maxLength={500} className="field" />
      </Field>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
        <input type="checkbox" name="consent" required className="mt-1 size-5 shrink-0 accent-primary" />
        <span className="text-fg">
          Tôi đồng ý nhận lời nhắc và mã ủng hộ mỗi tháng qua email và thông báo trên Give; tôi dừng được bất cứ lúc
          nào.
        </span>
      </label>
      <SubmitButton className={buttonClass({ variant: "secondary", size: "lg", full: true })}>
        Đăng ký ủng hộ hằng tháng
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        Bạn nhận ngay mã ủng hộ của tháng này. Dừng hoặc sửa trong mục Ủng hộ của tôi.
      </p>
    </ActionForm>
  )
}
