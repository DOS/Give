"use client"

import { useEffect, useRef, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"

import { CloseIcon } from "@/components/ui/icons"

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal dialog rendered via React Portal into `document.body` so it
 * never gets trapped inside a sticky stacking context or an aria-live region.
 *
 * Implements Escape close, backdrop click close, Tab/Shift+Tab focus trapping,
 * body scroll lock while open, and focus restoration to `returnFocusRef`.
 */
export function ModalDialog({
  open,
  onClose,
  titleId,
  title,
  returnFocusRef,
  children,
}: {
  open: boolean
  onClose: () => void
  titleId: string
  title: string
  returnFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false
        returnFocusRef?.current?.focus()
      }
      return
    }
    wasOpenRef.current = true
    closeRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== "Tab" || !dialogRef.current) return
      const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || !dialogRef.current.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, returnFocusRef])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 text-left"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border border-border bg-raised p-4 shadow-float sm:p-6"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-h2">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded text-fg hover:bg-surface focus-visible:-outline-offset-4"
          >
            <CloseIcon width={24} height={24} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
