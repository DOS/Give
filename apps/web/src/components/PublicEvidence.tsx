import Image from "next/image"

import { ActionForm, SubmitButton } from "@/components/forms"
import type { ActionResult } from "@/lib/errors"
import { formatDate } from "@/lib/format"
import { EVIDENCE_KINDS, publicEvidenceUrl, type PublicEvidence } from "@/lib/statement"

type ReportAction = (evidenceId: string, state: ActionResult, form: FormData) => Promise<ActionResult>

/**
 * The public evidence images of one disbursement, each with a way to report
 * it when it exposes someone's personal data (owner decision on DOS/Give#58).
 * Signed-out visitors get a sign-in link instead of the form.
 */
export function PublicEvidenceList({
  evidence,
  report,
  loginHref,
}: {
  evidence: PublicEvidence[]
  /** null when the visitor is not signed in. */
  report: ReportAction | null
  loginHref: string
}) {
  if (evidence.length === 0) return null
  return (
    <ul className="mt-2 flex flex-wrap gap-3" aria-label="Ảnh chứng từ">
      {evidence.map((e) => {
        const kind = EVIDENCE_KINDS[e.kind] ?? e.kind
        return (
          <li key={e.id} className="w-28 text-xs text-gray-500">
            <a href={publicEvidenceUrl(e.storage_path)} target="_blank" rel="noreferrer" className="block">
              <Image
                src={publicEvidenceUrl(e.storage_path)}
                alt={`${kind}, tải lên ngày ${formatDate(e.created_at)}`}
                width={112}
                height={112}
                unoptimized
                className="h-28 w-28 rounded border border-gray-200 bg-gray-50 object-cover"
              />
            </a>
            <p className="mt-1">{kind}</p>
            <details className="mt-1">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-800">Báo cáo ảnh</summary>
              {report ? (
                <ActionForm action={report.bind(null, e.id)} className="mt-2 w-64 space-y-2" resetOnSuccess>
                  <label htmlFor={`report-${e.id}`} className="block text-gray-700">
                    Ảnh lộ thông tin cá nhân (số CCCD, số điện thoại, địa chỉ…)? Ghi ngắn lý do (không bắt buộc).
                  </label>
                  <textarea id={`report-${e.id}`} name="reason" maxLength={500} rows={2} className="field text-xs" />
                  <SubmitButton className="btn-secondary text-xs">Gửi báo cáo</SubmitButton>
                </ActionForm>
              ) : (
                <a href={loginHref} className="mt-1 block text-brand-600 hover:text-brand-700">
                  Đăng nhập để báo cáo
                </a>
              )}
            </details>
          </li>
        )
      })}
    </ul>
  )
}
