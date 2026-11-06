"use client"

import clsx from "clsx"
import { useEffect, useRef, type ReactNode } from "react"

/**
 * A menu button built on <details>, so it opens without JavaScript. With
 * JavaScript it also closes on Escape (focus returns to the button), on a
 * click outside and after a link inside is followed. On phones the panel is
 * a sheet fixed to the bottom of the screen, so a sideways-scrolling filter
 * row cannot clip it.
 */
export function Dropdown({
  summary,
  summaryClassName,
  panelClassName,
  children,
}: {
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
    <details ref={root} className="group/dropdown shrink-0 sm:relative">
      <summary
        className={clsx(
          "inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded border border-border bg-bg px-3 text-sm font-medium text-fg transition-colors duration-150 group-open/dropdown:border-primary hover:bg-surface [&::-webkit-details-marker]:hidden",
          summaryClassName
        )}
      >
        {summary}
      </summary>
      <div
        className={clsx(
          "fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto border-t border-border bg-raised p-2 shadow-float sm:absolute sm:inset-x-auto sm:top-12 sm:bottom-auto sm:left-0 sm:w-72 sm:rounded-md sm:border",
          panelClassName
        )}
        onClick={(event) => {
          if ((event.target as Element).closest("a") && root.current) root.current.open = false
        }}
      >
        {children}
      </div>
    </details>
  )
}
