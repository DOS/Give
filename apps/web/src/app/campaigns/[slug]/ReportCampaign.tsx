import Link from "next/link"

import { ActionForm, SubmitButton } from "@/components/forms"
import { buttonClass } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"
import { FlagIcon } from "@/components/ui/icons"
import { REPORT_DETAILS_MAX, REPORT_REASON_LABELS, REPORT_REASONS } from "@/lib/campaign-reports"
import { statementHref } from "@/lib/statement"

import { reportCampaign } from "./actions"

/**
 * Public campaign report disclosure inside the campaign sidebar (DOS/Give#98).
 * Signed-in visitors submit a structured reason and optional details (required
 * for "other"); signed-out visitors get a login link that returns here.
 */
export function ReportCampaign({
  campaignId,
  slug,
  signedIn,
}: {
  campaignId: string
  slug: string
  signedIn: boolean
}) {
  const loginHref = `/auth/login?return_path=${encodeURIComponent(`/campaigns/${slug}`)}`

  return (
    <details className="group">
      <summary className="inline-flex min-h-11 w-full cursor-pointer list-none items-center justify-center gap-2 rounded text-sm text-muted hover:text-fg hover:underline [&::-webkit-details-marker]:hidden">
        <FlagIcon width={16} height={16} />
        Báo cáo chiến dịch
      </summary>
      <div className="mt-4 space-y-4 border-t border-border pt-4">
        {signedIn ? (
          <ActionForm action={reportCampaign.bind(null, campaignId)} className="space-y-6" resetOnSuccess>
            <Field htmlFor="report-reason" label="Lý do báo cáo">
              <select id="report-reason" name="reason_code" required defaultValue="" className="field">
                <option value="" disabled>
                  Chọn lý do…
                </option>
                {REPORT_REASONS.map((code) => (
                  <option key={code} value={code}>
                    {REPORT_REASON_LABELS[code]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              htmlFor="report-details"
              label="Chi tiết (bắt buộc nếu chọn “Lý do khác”)"
              hint="Tối đa 1000 ký tự. Báo cáo được giữ kín; người tổ chức không biết ai báo cáo."
            >
              <textarea
                id="report-details"
                name="details"
                rows={3}
                maxLength={REPORT_DETAILS_MAX}
                placeholder="Nêu cụ thể dấu hiệu vi phạm hoặc đường dẫn liên quan…"
                className="field"
              />
            </Field>
            <SubmitButton className={buttonClass({ variant: "secondary", full: true })}>Gửi báo cáo</SubmitButton>
          </ActionForm>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-fg">
              Đăng nhập để báo cáo chiến dịch vi phạm quy định. Người tổ chức không biết ai gửi báo cáo.
            </p>
            <a href={loginHref} className={buttonClass({ variant: "secondary", full: true })}>
              Đăng nhập để báo cáo
            </a>
          </div>
        )}
        <p className="text-sm text-muted">
          Nếu một ảnh chứng từ khoản chi lộ thông tin cá nhân, hãy báo cáo ảnh đó ngay trên{" "}
          <Link href={statementHref(slug, "out")} className="link">
            sao kê khoản chi
          </Link>
          .
        </p>
      </div>
    </details>
  )
}
