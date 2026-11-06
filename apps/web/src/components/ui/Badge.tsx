import clsx from "clsx"
import type { ReactNode } from "react"

export type BadgeTone = "neutral" | "brand" | "accent" | "info" | "warning" | "danger"

/** Fills come from the semantic soft colors (DESIGN.md 4 and 6). */
const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface text-muted",
  brand: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  info: "bg-surface text-fg",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
}

/** A status label (DESIGN.md 6): 24px high, 8px padding, 12px semibold, 4px radius, never a pill. */
export function Badge({
  tone = "neutral",
  icon,
  className,
  children,
}: {
  tone?: BadgeTone
  icon?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-semibold whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}
