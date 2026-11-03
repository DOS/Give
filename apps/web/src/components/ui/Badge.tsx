import clsx from "clsx"
import type { ReactNode } from "react"

export type BadgeTone = "neutral" | "brand" | "accent" | "info" | "warning" | "danger"

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-800",
  brand: "bg-brand-50 text-brand-800 ring-1 ring-brand-200 ring-inset",
  accent: "bg-accent-100 text-accent-800",
  info: "bg-sky-50 text-sky-800",
  warning: "bg-amber-50 text-amber-900",
  danger: "bg-red-50 text-red-800",
}

/** A small status label: low radius, never a pill (docs/Design-Principles.md). */
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
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm leading-6 font-medium whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}
