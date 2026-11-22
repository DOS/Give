"use client"

import Link from "next/link"
import { startTransition, useActionState, useState } from "react"

import { ContactText } from "@/components/ContactText"
import type { ActionResult } from "@/lib/errors"
import {
  isNavigableOrganizerHandle,
  normalizeOrganizerHandle,
  ORGANIZER_BIO_MAX,
  ORGANIZER_HANDLE_MAX,
  organizerProfileHref,
  validateOrganizerHandle,
} from "@/lib/organizer-handle"

type FormAction = (state: ActionResult, formData: FormData) => Promise<ActionResult>

/**
 * Organizer public profile editor for `/me` (DOS/Give#251).
 *
 * Shows a live `give.vn/u/<handle>` URL preview and client-side format/reserved
 * validation matching `give.organizers_validate_handle`, while preserving form
 * inputs on server errors and submitting cleanly even before hydration.
 */
export function PublicProfileForm({
  initialHandle,
  initialBio,
  action,
}: {
  initialHandle: string | null
  initialBio: string | null
  action: FormAction
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const [handleInput, setHandleInput] = useState(initialHandle ?? "")
  const [bioInput, setBioInput] = useState(initialBio ?? "")
  const [syncedHandle, setSyncedHandle] = useState(initialHandle)
  const [syncedBio, setSyncedBio] = useState(initialBio)

  if (syncedHandle !== initialHandle) {
    setSyncedHandle(initialHandle)
    setHandleInput(initialHandle ?? "")
  }
  if (syncedBio !== initialBio) {
    setSyncedBio(initialBio)
    setBioInput(initialBio ?? "")
  }

  const normalizedHandle = normalizeOrganizerHandle(handleInput)
  const handleCheck = validateOrganizerHandle(handleInput)
  const bioLength = bioInput.replace(/\r\n?/g, "\n").trim().length
  const savedHref = isNavigableOrganizerHandle(initialHandle) ? organizerProfileHref(initialHandle) : null

  return (
    <form
      action={formAction}
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        const submitter = (event.nativeEvent as SubmitEvent).submitter
        const formData = new FormData(event.currentTarget, submitter)
        startTransition(() => formAction(formData))
      }}
    >
      <div>
        <label htmlFor="handle" className="label">
          Đường dẫn hồ sơ công khai
        </label>
        <input
          id="handle"
          name="handle"
          type="text"
          className="field"
          value={handleInput}
          onChange={(event) => setHandleInput(event.target.value)}
          maxLength={ORGANIZER_HANDLE_MAX}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="vi-du-quy-hoc-bong"
          aria-invalid={normalizedHandle !== "" && !handleCheck.ok}
          aria-describedby="handle_hint"
        />
        <p
          id="handle_hint"
          className={normalizedHandle !== "" && !handleCheck.ok ? "mt-2 text-sm text-danger" : "hint"}
        >
          {normalizedHandle === "" ? (
            "Để trống nếu chưa muốn mở trang công khai. Gồm 3–40 ký tự chữ thường (a-z), số (0-9) và dấu gạch ngang ở giữa."
          ) : handleCheck.ok ? (
            <span className="break-all">
              Xem trước đường dẫn: <span className="font-medium text-fg">give.vn/u/{normalizedHandle}</span>
            </span>
          ) : (
            handleCheck.message
          )}
        </p>
        {savedHref && initialHandle && (
          <p className="mt-2 text-sm break-all text-muted">
            Trang công khai hiện tại:{" "}
            <Link href={savedHref} className="link">
              give.vn/u/{initialHandle}
            </Link>
          </p>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="bio" className="label">
            Giới thiệu ngắn
          </label>
          <span className="text-sm text-muted tabular-nums">
            {bioLength}/{ORGANIZER_BIO_MAX}
          </span>
        </div>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={ORGANIZER_BIO_MAX}
          className="field resize-y"
          value={bioInput}
          onChange={(event) => setBioInput(event.target.value)}
          placeholder="Chia sẻ ngắn gọn về bạn hoặc tổ chức và mục đích gây quỹ…"
          aria-describedby="bio_hint"
        />
        <p id="bio_hint" className="hint">
          Hiển thị công khai trên trang hồ sơ của bạn (tối đa {ORGANIZER_BIO_MAX} ký tự).
        </p>
      </div>

      <p className="max-w-[68ch] text-sm text-muted">
        Cập nhật đường dẫn và phần giới thiệu không làm mất trạng thái xác minh. Tên pháp lý, số điện thoại và tài khoản
        nhận tiền không bao giờ hiển thị công khai.
      </p>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Đang xử lý…" : "Lưu hồ sơ công khai"}
      </button>

      {state?.message && (
        <p role={state.ok ? "status" : "alert"} className={`mt-2 text-sm ${state.ok ? "text-primary" : "text-danger"}`}>
          <ContactText text={state.message} />
        </p>
      )}
    </form>
  )
}
