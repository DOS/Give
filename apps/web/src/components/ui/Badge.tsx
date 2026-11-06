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

/**
 * A status label (DESIGN.md 6): 24px high, 8px padding, 12px semibold, 4px
 * radius, never a pill. `md` is the 28px tag size (10px padding, 14px text).
 */
export function Badge({
  tone = "neutral",
  size = "sm",
  icon,
  className,
  children,
}: {
  tone?: BadgeTone
  size?: "sm" | "md"
  icon?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded font-semibold whitespace-nowrap",
        size === "md" ? "h-7 px-2.5 text-sm" : "h-6 px-2 text-xs",
        TONES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}
