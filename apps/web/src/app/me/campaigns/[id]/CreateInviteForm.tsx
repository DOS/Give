"use client"

import { startTransition, useActionState, useEffect, useRef } from "react"

import { CopyButton } from "@/components/CopyButton"
import { buttonClass } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { Field } from "@/components/ui/Field"
import { DEFAULT_INVITE_EXPIRY_HOURS, INVITE_EXPIRY_PRESETS, INVITE_NOTE_MAX } from "@/lib/campaign-members"
import { formatDateTime } from "@/lib/format"

import type { CreateInviteResult } from "../member-actions"

type CreateInviteAction = (state: CreateInviteResult, formData: FormData) => Promise<CreateInviteResult>

/**
 * Generates a single-use co-organizer invite link and shows it ONCE in the
 * browser right after creation (the DB stores only the SHA-256 hash, so the
 * raw link cannot be shown again after a page refresh).
 */
export function CreateInviteForm({
  action,
  origin,
}: {
  action: CreateInviteAction
  /** Configured site origin, if set; otherwise uses window.location.origin on the client. */
  origin?: string
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.ok) formRef.current?.reset()
  }, [state])

  const inviteUrl = state?.invite
    ? origin
      ? `${origin}${state.invite.path}`
      : typeof window !== "undefined"
        ? `${window.location.origin}${state.invite.path}`
        : state.invite.path
    : null

  return (
    <div className="max-w-160 space-y-6">
      <form
        ref={formRef}
        action={formAction}
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          if (pending) return
          const formData = new FormData(event.currentTarget)
          startTransition(() => formAction(formData))
        }}
      >
        <div className="grid gap-6 sm:grid-cols-2 [&>*]:min-w-0">
          <Field htmlFor="invite_expires_in_hours" label="Thời hạn liên kết">
            <select
              id="invite_expires_in_hours"
              name="expires_in_hours"
              className="field"
              defaultValue={String(DEFAULT_INVITE_EXPIRY_HOURS)}
            >
              {INVITE_EXPIRY_PRESETS.map((preset) => (
                <option key={preset.hours} value={String(preset.hours)}>
                  {preset.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            htmlFor="invite_note"
            label="Ghi chú nội bộ (không bắt buộc)"
            hintId="invite_note_hint"
            hint={`Tối đa ${INVITE_NOTE_MAX} ký tự, chỉ bạn thấy để nhớ đã gửi cho ai.`}
          >
            <input
              id="invite_note"
              name="note"
              className="field"
              maxLength={INVITE_NOTE_MAX}
              aria-describedby="invite_note_hint"
              placeholder="Ví dụ: Gửi cho Minh phụ trách cập nhật"
            />
          </Field>
        </div>

        <button type="submit" className={buttonClass()} disabled={pending}>
          {pending ? "Đang tạo liên kết…" : "Tạo liên kết mời"}
        </button>

        {state?.message && !state.invite && (
          <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-primary" : "text-danger"}`}>
            {state.message}
          </p>
        )}
      </form>

      {state?.ok && state.invite && inviteUrl && (
        <Callout tone="success" role="status" title="Liên kết mời chỉ hiển thị một lần này">
          <p>
            Sao chép và gửi riêng cho người bạn muốn mời. Liên kết chỉ dùng được một lần, hết hạn lúc{" "}
            <span className="font-semibold tabular-nums">{formatDateTime(state.invite.expiresAt)}</span> và sẽ không
            hiển thị lại sau khi bạn tải lại trang.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              readOnly
              value={inviteUrl}
              aria-label="Liên kết mời đồng tổ chức"
              className="field min-w-0 sm:flex-1"
              onFocus={(event) => event.currentTarget.select()}
            />
            <CopyButton value={inviteUrl} label="Sao chép liên kết" name="liên kết mời đồng tổ chức" />
          </div>
        </Callout>
      )}
    </div>
  )
}
