import { donate } from "@/app/(public)/donations/actions"
import { ActionForm, SubmitButton } from "@/components/forms"
import { buttonClass } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"

/** Donation form for a live give campaign (section 4.1 step 5); the action opens the payment page. */
export function DonateForm({
  campaignId,
  defaultName,
  signedIn,
}: {
  campaignId: string
  defaultName: string
  signedIn: boolean
}) {
  return (
    <ActionForm action={donate.bind(null, campaignId)} className="space-y-6">
      <Field htmlFor="donate-amount" label="Số tiền ủng hộ (đồng)">
        <input
          id="donate-amount"
          name="amount"
          required
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ví dụ: 200.000"
          className="field font-semibold tabular-nums placeholder:font-normal"
        />
      </Field>
      <Field htmlFor="donate-name" label="Tên hiển thị">
        <input
          id="donate-name"
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
            aria-describedby="donate-anonymous-hint"
            className="mt-1 size-5 shrink-0 accent-primary"
          />
          <span className="font-medium text-fg">Ủng hộ ẩn danh</span>
        </label>
        <p id="donate-anonymous-hint" className="hint">
          Give sẽ không hiện tên bạn trên Give. Nhưng nếu tài khoản nhận là tài khoản minh bạch, trang sao kê công khai
          của ngân hàng vẫn có thể hiện tên người chuyển.
        </p>
      </div>
      <Field htmlFor="donate-message" label="Lời nhắn (không bắt buộc)">
        <textarea id="donate-message" name="message" rows={3} maxLength={500} className="field" />
      </Field>
      <SubmitButton className={buttonClass({ size: "lg", full: true })}>Ủng hộ</SubmitButton>
      <p className="text-center text-sm text-muted">
        {signedIn ? "" : "Không cần đăng nhập. "}Bạn sẽ nhận mã VietQR để chuyển khoản thẳng vào tài khoản nhận của
        chiến dịch.
      </p>
    </ActionForm>
  )
}
