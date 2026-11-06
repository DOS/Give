"use client"

import clsx from "clsx"
import { useEffect, useRef, type ReactNode } from "react"

import { CloseIcon } from "@/components/ui/icons"

/**
 * A menu button built on <details>, so it opens without JavaScript. With
 * JavaScript it also closes on Escape (focus returns to the button), on a
 * click outside and after a link inside is followed. Below 768px the panel is
 * a sheet fixed to the bottom of the screen over a dimmed page, with its
 * title and a close button, so a sideways-scrolling filter row cannot clip it.
 */
export function Dropdown({
  title,
  summary,
  summaryClassName,
  panelClassName,
  children,
}: {
  /** Heads the phone sheet. */
  title: string
  summary: ReactNode
  summaryClassName?: string
  panelClassName?: string
  children: ReactNode
}) {
  const root = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const details = root.current
    if (!details) return
    const close = () => {
      details.open = false
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.open) {
        close()
        details.querySelector("summary")?.focus()
      }
    }
    const onClick = (event: MouseEvent) => {
      if (details.open && !details.contains(event.target as Node)) close()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("click", onClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("click", onClick)
    }
  }, [])

  return (
    <details ref={root} className="group/dropdown shrink-0 md:relative">
      <summary
        className={clsx(
          "inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded border border-border bg-bg px-3 text-sm font-medium text-fg transition-colors duration-150 group-open/dropdown:border-primary hover:bg-surface [&::-webkit-details-marker]:hidden",
          summaryClassName
        )}
      >
        {summary}
      </summary>
      <div
        aria-hidden
        className="fixed inset-0 z-50 bg-scrim md:hidden"
        onClick={() => {
          if (root.current) root.current.open = false
        }}
      />
      <div
        className={clsx(
          "fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-md border-t border-border bg-raised p-2 shadow-float md:absolute md:inset-x-auto md:top-13 md:bottom-auto md:left-0 md:w-72 md:rounded-md md:border",
          panelClassName
        )}
        onClick={(event) => {
          if ((event.target as Element).closest("a") && root.current) root.current.open = false
        }}
      >
        <div className="flex items-center justify-between pl-2 md:hidden">
          <p className="text-h3">{title}</p>
          <button
            type="button"
            aria-label="Đóng"
            className="inline-flex size-11 items-center justify-center rounded text-fg hover:bg-surface"
            onClick={() => {
              if (root.current) root.current.open = false
              root.current?.querySelector("summary")?.focus()
            }}
          >
            <CloseIcon width={24} height={24} />
          </button>
        </div>
        {children}
      </div>
    </details>
  )
}
