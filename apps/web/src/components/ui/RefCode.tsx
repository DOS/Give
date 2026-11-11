import clsx from "clsx"
import type { ReactNode } from "react"

/**
 * A Give reference code (`GV…` donation or pledge, `XM…` verification), set
 * as DESIGN.md 3 "Reference codes" says: system mono, weight 600, 0.025em
 * tracking, `text` color. `lg` is 24/32 for the code a person types into a
 * bank app; `inline` keeps the line's size but never goes below 16px, since
 * mono reads a step smaller than Be Vietnam Pro at the same px.
 * `translate="no"` stops page translators from rewriting the code.
 */
export function RefCode({
  size = "inline",
  className,
  children,
}: {
  size?: "inline" | "lg"
  className?: string
  children: ReactNode
}) {
  return (
    <span
      translate="no"
      className={clsx(
        "font-mono font-semibold tracking-wide break-all text-fg",
        size === "lg" ? "text-h2" : "text-[length:max(1em,1rem)]",
        className
      )}
    >
      {children}
    </span>
  )
}
