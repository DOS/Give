import { ActionForm, SubmitButton } from "@/components/forms"
import { buttonClass } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { ChevronDownIcon } from "@/components/ui/icons"
import {
  canEditFaqs,
  FAQ_ANSWER_MAX,
  FAQ_QUESTION_MAX,
  MAX_CAMPAIGN_FAQS,
  sortFaqs,
  type CampaignFaq,
} from "@/lib/campaign-faqs"
import type { CampaignStatus } from "@/lib/campaigns"

import { Panel } from "../../_components/Panel"
import { deleteCampaignFaq, moveCampaignFaq, saveCampaignFaq } from "../faq-actions"

/**
 * Structured campaign FAQ editor in /me/campaigns/[id] (DOS/Give#316).
 * Editable by the owning organizer and active accepted co-organizer editors
 * while the campaign is draft, changes_requested, approved, or live.
 */
export function FaqSection({
  campaignId,
  status,
  faqs,
}: {
  campaignId: string
  status: CampaignStatus
  /** null when FAQs could not be read. */
  faqs: CampaignFaq[] | null
}) {
  const editable = canEditFaqs(status)
  const ordered = faqs ? sortFaqs(faqs) : []

  return (
    <Panel
      id="faqs"
      title="Câu hỏi thường gặp"
      description={
        <p>
          Giải đáp trước các thắc mắc phổ biến của người ủng hộ (tối đa {MAX_CAMPAIGN_FAQS} câu).{" "}
          {editable
            ? "Bạn có thể thêm, sửa, xóa hoặc sắp xếp lại khi chiến dịch là bản nháp, cần chỉnh sửa, đã duyệt hoặc đang mở."
            : "Câu hỏi thường gặp không chỉnh sửa được ở trạng thái này."}
        </p>
      }
    >
      {!faqs ? (
        <Callout tone="danger">Không tải được danh sách câu hỏi thường gặp. Hãy tải lại trang.</Callout>
      ) : ordered.length === 0 ? (
        <p className="text-muted">
          {editable
            ? "Chưa có câu hỏi thường gặp nào. Thêm câu hỏi giúp người ủng hộ hiểu rõ hơn trước khi đóng góp."
            : "Chiến dịch chưa có câu hỏi thường gặp nào."}
        </p>
      ) : (
        <ol className="space-y-4">
          {ordered.map((faq, index) => (
            <li key={faq.id} className="min-w-0 space-y-4 rounded-md border border-border p-4 sm:p-6">
              <div className="space-y-2">
                <h3 className="min-w-0 text-h3 break-words text-fg">{faq.question}</h3>
                <p className="max-w-[68ch] break-words whitespace-pre-line text-fg">{faq.answer}</p>
              </div>
              {editable && (
                <div className="space-y-2 border-t border-border pt-4">
                  <div className="flex flex-wrap gap-2">
                    {index > 0 && (
                      <ActionForm action={moveCampaignFaq.bind(null, campaignId, faq.id, "up")}>
                        <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>
                          ↑ Lên<span className="sr-only">: {faq.question}</span>
                        </SubmitButton>
                      </ActionForm>
                    )}
                    {index < ordered.length - 1 && (
                      <ActionForm action={moveCampaignFaq.bind(null, campaignId, faq.id, "down")}>
                        <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>
                          ↓ Xuống<span className="sr-only">: {faq.question}</span>
                        </SubmitButton>
                      </ActionForm>
                    )}
                    <ActionForm
                      action={deleteCampaignFaq.bind(null, campaignId, faq.id)}
                      confirm={`Xóa câu hỏi “${faq.question}”?`}
                    >
                      <SubmitButton className={buttonClass({ variant: "danger", size: "sm" })}>
                        Xóa<span className="sr-only"> câu hỏi {faq.question}</span>
                      </SubmitButton>
                    </ActionForm>
                  </div>
                  <details className="group">
                    <summary
                      aria-label={`Sửa câu hỏi này: ${faq.question}`}
                      className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 link [&::-webkit-details-marker]:hidden"
                    >
                      Sửa câu hỏi này
                      <ChevronDownIcon width={20} height={20} className="group-open:rotate-180" />
                    </summary>
                    <ActionForm
                      action={saveCampaignFaq.bind(null, campaignId, faq.id)}
                      className="mt-3 max-w-160 space-y-6"
                    >
                      <div key={`${faq.id}:${faq.updated_at}`} className="space-y-6">
                        <FaqFields prefix={`faq_${faq.id}`} faq={faq} />
                      </div>
                      <SubmitButton className={buttonClass({ variant: "secondary" })}>
                        Lưu câu hỏi<span className="sr-only">: {faq.question}</span>
                      </SubmitButton>
                    </ActionForm>
                  </details>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {editable && faqs && ordered.length < MAX_CAMPAIGN_FAQS && (
        <details className="group mt-4 rounded-md border border-border px-4 py-1" open={ordered.length === 0}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold text-fg [&::-webkit-details-marker]:hidden">
            <span>
              Thêm câu hỏi thường gặp{" "}
              <span className="text-sm font-normal text-muted tabular-nums">
                ({ordered.length}/{MAX_CAMPAIGN_FAQS})
              </span>
            </span>
            <ChevronDownIcon width={20} height={20} className="group-open:rotate-180" />
          </summary>
          <ActionForm
            action={saveCampaignFaq.bind(null, campaignId, null)}
            resetOnSuccess
            className="mt-2 mb-4 max-w-160 space-y-6"
          >
            <FaqFields prefix="new_faq" faq={null} />
            <SubmitButton className={buttonClass({ variant: "secondary" })}>Thêm câu hỏi</SubmitButton>
          </ActionForm>
        </details>
      )}

      {editable && faqs && ordered.length >= MAX_CAMPAIGN_FAQS && (
        <p className="mt-4 text-sm text-muted">Đã đạt giới hạn tối đa {MAX_CAMPAIGN_FAQS} câu hỏi thường gặp.</p>
      )}
    </Panel>
  )
}

function FaqFields({ prefix, faq }: { prefix: string; faq: CampaignFaq | null }) {
  return (
    <>
      <div>
        <label htmlFor={`${prefix}_question`} className="label">
          Câu hỏi
        </label>
        <input
          id={`${prefix}_question`}
          name="question"
          className="field"
          required
          minLength={1}
          maxLength={FAQ_QUESTION_MAX}
          aria-describedby={`${prefix}_question_hint`}
          defaultValue={faq?.question ?? ""}
        />
        <p id={`${prefix}_question_hint`} className="hint">
          Tối đa {FAQ_QUESTION_MAX} ký tự.
        </p>
      </div>
      <div>
        <label htmlFor={`${prefix}_answer`} className="label">
          Câu trả lời
        </label>
        <textarea
          id={`${prefix}_answer`}
          name="answer"
          className="field"
          rows={4}
          required
          minLength={1}
          maxLength={FAQ_ANSWER_MAX}
          aria-describedby={`${prefix}_answer_hint`}
          defaultValue={faq?.answer ?? ""}
        />
        <p id={`${prefix}_answer_hint`} className="hint">
          Tối đa {FAQ_ANSWER_MAX.toLocaleString("vi-VN")} ký tự. Xuống dòng được giữ nguyên; không hỗ trợ HTML.
        </p>
      </div>
    </>
  )
}
