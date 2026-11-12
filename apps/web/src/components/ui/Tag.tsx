import clsx from "clsx"
import Link from "next/link"
import type { ReactNode } from "react"

/**
 * DESIGN.md 6, Tag: 28px high, 10px padding, 14px text, a surface fill with
 * no border. The visible box stays 28px; the 44px touch target is the
 * invisible `hit-area` utility (globals.css) centered on it.
 */
const BASE = "relative inline-flex h-7 shrink-0 items-center gap-1 rounded px-2.5 text-sm font-medium whitespace-nowrap"

export function Tag({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={clsx(BASE, "bg-surface text-fg", className)}>{children}</span>
}

/** An interactive tag: hover fills with the border color, the selected one is primary-soft with primary text. */
export function TagLink({
  href,
  current,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  href: string
  current?: boolean
  className?: string
  children: ReactNode
  "aria-label"?: string
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      aria-label={ariaLabel}
      className={clsx(
        BASE,
        "hit-area",
        "transition-colors duration-150",
        current ? "bg-primary-soft text-primary" : "bg-surface text-fg hover:bg-border",
        className
      )}
    >
      {children}
    </Link>
  )
}
