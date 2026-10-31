"use client"

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react"

import type { ActionResult } from "@/lib/errors"

type FormAction = (state: ActionResult, formData: FormData) => Promise<ActionResult>

const PendingContext = createContext(false)

/**
 * A form bound to a server action that returns an ActionResult; shows the
 * action's message under the fields.
 *
 * Once hydrated, it submits through startTransition and prevents the default
 * submit: React 19 resets uncontrolled fields after every submission it runs
 * from the `action` prop, which would throw away what the person typed when
 * the server rejects it, and React skips that path when the default was
 * prevented. The `action` prop stays so a submit before hydration still
 * posts to the server action instead of a GET with the fields in the URL.
 * Fields keep their values unless `resetOnSuccess` is set and it succeeded.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess,
}: {
  action: FormAction
  children: ReactNode
  className?: string
  /** Asks the person before submitting (for irreversible actions). */
  confirm?: string
  /** Clears the fields after a successful submission (for "add" forms). */
  resetOnSuccess?: boolean
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset()
  }, [state, resetOnSuccess])

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className}
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        if (confirm && !window.confirm(confirm)) return
        const submitter = (event.nativeEvent as SubmitEvent).submitter
        const formData = new FormData(event.currentTarget, submitter)
        startTransition(() => formAction(formData))
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
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
  const pending = useContext(PendingContext)
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? "Đang xử lý…" : children}
    </button>
  )
}
