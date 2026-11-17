"use client"

import clsx from "clsx"
import { useEffect, useRef, type ReactNode } from "react"

import { CloseIcon } from "@/components/ui/icons"

/**
 * A menu button built on <details>, so it opens without JavaScript. With
 * JavaScript it also closes on Escape (focus returns to the button), on a
 * click outside, after a link inside is followed and when keyboard focus
 * leaves it, so focus never sits on a page the menu covers (as the header
 * menus do, Disclosure). Below 768px the panel is a sheet fixed to the bottom
 * of the screen over a dimmed page, with its title and a close button, so a
 * sideways-scrolling filter row cannot clip it. The sheet's scrim covers the
 * menu button too, so there focus moves into the sheet when it opens (to the
 * checked item), and going back to the button closes it. With scripting
 * turned off the scrim and the close button would do nothing, and the scrim
 * would cover the button, so both are hidden: the button closes the sheet.
 */
export function Dropdown({
  title,
  summary,
  className,
  summaryClassName,
  panelClassName,
  children,
}: {
  /** Heads the phone sheet. */
  title: string
  summary: ReactNode
  /** On the <details>, e.g. to let the menu button shrink inside a full row. */
  className?: string
  summaryClassName?: string
  panelClassName?: string
  children: ReactNode
}) {
  const root = useRef<HTMLDetailsElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const details = root.current
    if (!details) return
    const close = () => {
      details.open = false
    }
    // The scrim shows only where the panel is a sheet (below 768px).
    const isSheet = () => !!scrim.current && getComputedStyle(scrim.current).display !== "none"
    const onToggle = () => {
      if (!details.open || !isSheet()) return
      const sheet = panel.current
      const checked = sheet?.querySelector<HTMLElement>('a[aria-current="page"]')
      ;(checked ?? sheet?.querySelector<HTMLElement>("a[href]"))?.focus()
    }
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget
      // No new target: the window lost focus, or a click on nothing focusable
      // (a click outside closes the menu on its own).
      if (!details.open || !(next instanceof Node) || panel.current?.contains(next)) return
      // Beside a popover the button is in view, and a click on it toggles the
      // menu itself; under a sheet's scrim it is not.
      if (details.contains(next) && !isSheet()) return
      close()
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
    details.addEventListener("toggle", onToggle)
    details.addEventListener("focusout", onFocusOut)
    document.addEventListener("keydown", onKey)
    document.addEventListener("click", onClick)
    return () => {
      details.removeEventListener("toggle", onToggle)
      details.removeEventListener("focusout", onFocusOut)
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("click", onClick)
    }
  }, [])

  return (
    <details ref={root} className={clsx("group/dropdown shrink-0 md:relative", className)}>
      <summary
        className={clsx(
          "inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded border border-border bg-bg px-3 text-sm font-medium text-fg transition-colors duration-150 group-open/dropdown:border-primary hover:bg-surface [&::-webkit-details-marker]:hidden",
          summaryClassName
        )}
      >
        {summary}
      </summary>
      <div
        ref={scrim}
        aria-hidden
        className="fixed inset-0 z-50 bg-scrim md:hidden noscript:hidden"
        // Focus was in the sheet, which this hides: give it back to the button.
        onClick={() => {
          if (root.current) root.current.open = false
          root.current?.querySelector("summary")?.focus()
        }}
      />
      <div
        ref={panel}
        // Its own scroller (a sheet), clear of the header: no focus scroll room (globals.css).
        data-menu-panel
        className={clsx(
          "fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-md border-t border-border bg-raised p-2 shadow-float md:absolute md:inset-x-auto md:top-13 md:bottom-auto md:left-0 md:w-72 md:rounded-md md:border",
          panelClassName
        )}
        // A link chosen from the keyboard (no pointer: detail 0) would leave focus
        // on nothing once the menu closes; the menu outlives the navigation, so
        // give focus back to its button.
        onClick={(event) => {
          if (!(event.target as Element).closest("a") || !root.current) return
          root.current.open = false
          if (event.detail === 0) root.current.querySelector("summary")?.focus()
        }}
      >
        <div className="flex items-center justify-between pl-2 md:hidden">
          <p className="text-h3">{title}</p>
          <button
            type="button"
            aria-label="Đóng"
            className="inline-flex size-11 items-center justify-center rounded text-fg hover:bg-surface focus-visible:-outline-offset-4 noscript:hidden"
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
