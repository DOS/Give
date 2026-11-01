import { donate } from "@/app/(public)/donations/actions"
import { ActionForm, SubmitButton } from "@/components/forms"

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
    <ActionForm action={donate.bind(null, campaignId)} className="space-y-4">
      <div>
        <label htmlFor="donate-amount" className="label">
          Số tiền ủng hộ (đồng)
        </label>
        <input
          id="donate-amount"
          name="amount"
          required
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ví dụ: 200.000"
          className="field"
        />
      </div>
      <div>
        <label htmlFor="donate-name" className="label">
          Tên hiển thị
        </label>
        <input
          id="donate-name"
          name="public_name"
          maxLength={80}
          defaultValue={defaultName}
          autoComplete="name"
          className="field"
        />
      </div>
      <div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="anonymous" className="mt-0.5" />
          <span>Ủng hộ ẩn danh</span>
        </label>
        <p className="hint">
          Give sẽ không hiện tên bạn trên Give. Nhưng nếu tài khoản nhận là tài khoản minh bạch, trang sao kê công khai
          của ngân hàng vẫn có thể hiện tên người chuyển.
        </p>
      </div>
      <div>
        <label htmlFor="donate-message" className="label">
          Lời nhắn (không bắt buộc)
        </label>
        <textarea id="donate-message" name="message" rows={3} maxLength={500} className="field" />
      </div>
      <SubmitButton className="btn-primary w-full">Ủng hộ</SubmitButton>
      <p className="text-center text-xs text-gray-500">
        {signedIn ? "" : "Không cần đăng nhập. "}Bạn sẽ nhận mã VietQR để chuyển khoản thẳng vào tài khoản nhận của
        chiến dịch.
      </p>
    </ActionForm>
  )
}
