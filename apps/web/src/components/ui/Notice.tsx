import clsx from "clsx"
import type { ReactNode } from "react"

export type NoticeTone = "info" | "warning" | "danger" | "success"

const TONES: Record<NoticeTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
  success: "border-brand-200 bg-brand-50 text-brand-900",
}

/**
 * A boxed message inside a page or card: why an action is blocked, a state
 * that needs attention, a list that failed to load. One text colour per tone
 * (DOS/Give#95 gotcha); pass `title` for a bold first line.
 */
export function Notice({
  tone = "info",
  title,
  className,
  children,
}: {
  tone?: NoticeTone
  title?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={clsx("rounded-md border px-4 py-3 text-base", TONES[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={clsx(title && "mt-1")}>{children}</div>}
    </div>
  )
}
