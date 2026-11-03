"use client"

import clsx from "clsx"
import { usePathname } from "next/navigation"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"

/**
 * A button that shows and hides a panel (the mobile menu, the account menu).
 * The panel closes on navigation, on Escape (focus returns to the button)
 * and on a click outside. Without JavaScript the button does nothing, so
 * every link in a panel is also reachable from a page of its own.
 */
export function Disclosure({
  label,
  openLabel,
  button,
  openButton,
  className,
  buttonClassName,
  panelClassName,
  children,
}: {
  /** Accessible name of the button while the panel is closed. */
  label: string
  /** Accessible name while open; defaults to `label`. */
  openLabel?: string
  /** What the button shows while closed, and while open (defaults to the same). */
  button: ReactNode
  openButton?: ReactNode
  className?: string
  buttonClassName?: string
  panelClassName?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  // Close after navigating (the layout, and so this component, persists).
  const [shownFor, setShownFor] = useState(pathname)
  if (shownFor !== pathname) {
    setShownFor(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const onClick = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("click", onClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("click", onClick)
    }
  }, [open])

  return (
    <div
      ref={root}
      className={clsx("relative", className)}
      // Tabbing out of the menu closes it, so focus never sits under an open panel.
      onBlur={(event) => {
        if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? (openLabel ?? label) : label}
        onClick={() => setOpen((value) => !value)}
        className={buttonClassName}
      >
        {open ? (openButton ?? button) : button}
      </button>
      <div
        id={id}
        hidden={!open}
        className={panelClassName}
        // A link or a search inside closes the panel even when only the query
        // string changes (the pathname check above would miss that).
        onClick={(event) => {
          if ((event.target as Element).closest("a")) setOpen(false)
        }}
        onSubmit={() => setOpen(false)}
      >
        {children}
      </div>
    </div>
  )
}
