"use client"

import clsx from "clsx"
import { useRef, useState, type KeyboardEvent } from "react"

import { ActionForm, SubmitButton } from "@/components/forms"
import { HeartIcon, LedgerIcon, SparkIcon } from "@/components/ui/icons"
import {
  CAMPAIGN_TEMPLATES,
  formatTemplateGoal,
  type CampaignTemplate,
  type CampaignTemplateId,
} from "@/lib/campaign-templates"
import type { ActionResult } from "@/lib/errors"
import { formatVnd } from "@/lib/format"

/** A campaign type choice: a bordered option; the checked one takes the selected fill (DESIGN.md 6). */
const TYPE_CHOICE =
  "flex cursor-pointer gap-3 rounded-md border border-border bg-raised p-4 transition-colors duration-150 hover:bg-surface has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:ring-1 has-[:checked]:ring-primary"

/**
 * Campaign creation form on /start with optional quick-start Vietnamese
 * templates (DOS/Give#338). Defaults to "blank" and keeps type/title/goal
 * uncontrolled so pre-hydration edits and zero-JS submissions remain intact.
 */
export function StartCampaignForm({
  action,
}: {
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>
}) {
  const [selectedId, setSelectedId] = useState<CampaignTemplateId>("blank")
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const giveRadioRef = useRef<HTMLInputElement>(null)
  const backRadioRef = useRef<HTMLInputElement>(null)
  const goalInputRef = useRef<HTMLInputElement>(null)

  const selectedTemplate = CAMPAIGN_TEMPLATES.find((t) => t.id === selectedId) ?? CAMPAIGN_TEMPLATES[0]
  const activeTemplate = selectedTemplate.id === "blank" ? null : selectedTemplate
  const suggestedGoal = activeTemplate?.suggestedGoal ?? null

  function selectTemplate(template: CampaignTemplate) {
    if (template.id === selectedId) return
    const previous = CAMPAIGN_TEMPLATES.find((t) => t.id === selectedId)
    setSelectedId(template.id)

    if (giveRadioRef.current) giveRadioRef.current.checked = template.type === "give"
    if (backRadioRef.current) backRadioRef.current.checked = template.type === "back"

    const goalInput = goalInputRef.current
    if (!goalInput) return
    if (template.suggestedGoal !== null) {
      goalInput.value = formatTemplateGoal(template.suggestedGoal)
    } else if (
      previous?.suggestedGoal !== null &&
      previous?.suggestedGoal !== undefined &&
      goalInput.value === formatTemplateGoal(previous.suggestedGoal)
    ) {
      goalInput.value = ""
    }
  }

  function handleTemplateKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = CAMPAIGN_TEMPLATES.length
    let nextIndex: number | null = null
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % count
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + count) % count
    } else if (event.key === "Home") {
      nextIndex = 0
    } else if (event.key === "End") {
      nextIndex = count - 1
    }
    if (nextIndex === null) return
    event.preventDefault()
    const next = CAMPAIGN_TEMPLATES[nextIndex]
    selectTemplate(next)
    optionRefs.current[nextIndex]?.focus()
  }

  return (
    <ActionForm action={action} className="mt-6 space-y-6">
      <input type="hidden" name="template_id" value={selectedId} />

      <div className="noscript:hidden">
        <div id="template_picker_label" className="label">
          Mẫu khởi tạo
        </div>
        <div
          role="radiogroup"
          aria-labelledby="template_picker_label"
          aria-describedby="template_hint"
          className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0"
        >
          {CAMPAIGN_TEMPLATES.map((template, index) => {
            const selected = selectedId === template.id
            const isBlank = template.id === "blank"
            const nameId = `template_name_${template.id}`
            const metaId = `template_meta_${template.id}`
            const descId = `template_desc_${template.id}`
            return (
              <button
                key={template.id}
                ref={(el) => {
                  optionRefs.current[index] = el
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-labelledby={nameId}
                aria-describedby={`${metaId} ${descId}`}
                tabIndex={selected ? 0 : -1}
                data-template-id={template.id}
                onClick={() => selectTemplate(template)}
                onKeyDown={(event) => handleTemplateKeyDown(event, index)}
                className={clsx(
                  "flex min-h-11 w-full cursor-pointer flex-col items-start gap-1 rounded-md border p-4 text-left transition-colors duration-150",
                  isBlank && "sm:col-span-2",
                  selected
                    ? "border-primary bg-primary-soft ring-1 ring-primary"
                    : "border-border bg-raised hover:bg-surface"
                )}
              >
                <span
                  id={metaId}
                  className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm"
                >
                  <span className="inline-flex items-center gap-2 font-medium text-muted">
                    {isBlank ? (
                      <LedgerIcon width={16} height={16} className="shrink-0 text-muted" />
                    ) : template.type === "give" ? (
                      <HeartIcon width={16} height={16} className="shrink-0 text-primary" />
                    ) : (
                      <SparkIcon width={16} height={16} className="shrink-0 text-accent" />
                    )}
                    <span>
                      {isBlank ? "Bắt đầu trống" : template.type === "give" ? "Từ thiện" : "Dự án có quà tặng"}
                    </span>
                  </span>
                  {template.suggestedGoal !== null && (
                    <span className="text-muted tabular-nums">Gợi ý {formatVnd(template.suggestedGoal)}</span>
                  )}
                </span>
                <span id={nameId} className="font-semibold break-words text-fg">
                  {template.name}
                </span>
                <span id={descId} className="text-sm break-words text-fg">
                  {template.tagline}
                </span>
              </button>
            )
          })}
        </div>
        <p id="template_hint" className="hint">
          {activeTemplate
            ? "Bản nháp sẽ được điền sẵn danh mục gợi ý, tóm tắt, khung câu chuyện và 3 câu hỏi thường gặp để bạn chỉnh sửa."
            : "Chọn một mẫu để gợi ý nhanh loại chiến dịch, mục tiêu và khung nội dung, hoặc tự tạo từ đầu."}
        </p>
      </div>

      <fieldset aria-describedby="campaign_type_hint">
        <legend className="label">Loại chiến dịch</legend>
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <label className={TYPE_CHOICE}>
            <input
              ref={giveRadioRef}
              type="radio"
              name="type"
              value="give"
              defaultChecked
              className="mt-1 size-5 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold text-fg">
                <HeartIcon className="text-primary" />
                Từ thiện
              </span>
              <span className="mt-1 block text-sm text-fg">Nhận ủng hộ linh hoạt, không cần đạt đủ mục tiêu.</span>
            </span>
          </label>
          <label className={TYPE_CHOICE}>
            <input
              ref={backRadioRef}
              type="radio"
              name="type"
              value="back"
              className="mt-1 size-5 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold text-fg">
                <SparkIcon className="text-accent" />
                Dự án có quà tặng
              </span>
              <span className="mt-1 block text-sm text-fg">
                Người ủng hộ cam kết trước, chỉ trả tiền khi dự án đạt mục tiêu.
              </span>
            </span>
          </label>
        </div>
        <p id="campaign_type_hint" className="hint">
          Không đổi được loại sau khi gửi duyệt.
        </p>
      </fieldset>

      <div>
        <label htmlFor="title" className="label">
          Tiêu đề
        </label>
        <input
          id="title"
          name="title"
          className="field"
          required
          minLength={5}
          maxLength={120}
          placeholder={activeTemplate ? activeTemplate.titlePlaceholder : undefined}
          aria-describedby={activeTemplate ? "title_hint" : undefined}
        />
        {activeTemplate && (
          <p id="title_hint" className="hint">
            Gợi ý theo mẫu {activeTemplate.name}. Bạn có thể tự đặt tiêu đề riêng (5–120 ký tự).
          </p>
        )}
      </div>

      <div>
        <label htmlFor="goal_amount" className="label">
          Mục tiêu (₫)
        </label>
        <input
          ref={goalInputRef}
          id="goal_amount"
          name="goal_amount"
          className="field tabular-nums"
          inputMode="numeric"
          defaultValue=""
          placeholder={suggestedGoal !== null ? formatTemplateGoal(suggestedGoal) : "50.000.000"}
          aria-describedby={suggestedGoal !== null ? "goal_amount_hint" : undefined}
          required
        />
        {suggestedGoal !== null && (
          <p id="goal_amount_hint" className="hint">
            Mục tiêu gợi ý cho mẫu này ({formatVnd(suggestedGoal)}). Bạn có thể sửa lại bất kỳ mức nào từ 10.000 ₫.
          </p>
        )}
      </div>

      <SubmitButton>Tạo bản nháp</SubmitButton>
    </ActionForm>
  )
}
