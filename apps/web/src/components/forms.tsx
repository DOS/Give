"use client"

import { useActionState, type ReactNode } from "react"
import { useFormStatus } from "react-dom"

import type { ActionResult } from "@/lib/errors"

type FormAction = (state: ActionResult, formData: FormData) => Promise<ActionResult>

/**
 * A form bound to a server action that returns an ActionResult; shows the
 * action's message under the fields.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
}: {
  action: FormAction
  children: ReactNode
  className?: string
  /** Asks the person before submitting (for irreversible actions). */
  confirm?: string
}) {
  const [state, formAction] = useActionState(action, null)
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
    >
      {children}
      {state?.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`mt-2 text-sm ${state.ok ? "text-green-700" : "text-red-700"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  )
}

export function SubmitButton({
  children,
  className = "btn-primary",
  name,
  value,
}: {
  children: ReactNode
  className?: string
  name?: string
  value?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? "Đang xử lý…" : children}
    </button>
  )
}
