import clsx from "clsx"
import type { ReactNode } from "react"

/**
 * A Give reference code (`GV…` donation or pledge, `XM…` verification), set
 * as DESIGN.md 3 "Reference codes" says: system mono, weight 600, 0.025em
 * tracking, `text` color. `lg` is 24/32 for the code a person types into a
 * bank app; its 32px line height applies when the parent is a block (a
 * `dd` or `p`). `inline` is one step above the line, and never below 16px
 * (16px in a 14px line, 18px in a 16px line), since mono reads a step
 * smaller than Be Vietnam Pro at the same px. `translate="no"` stops page
 * translators from rewriting the code.
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
        size === "lg" ? "text-h2" : "text-[length:max(1.125em,1rem)]",
        className
      )}
    >
      {children}
    </span>
  )
}

/**
 * A machine string on a staff screen (bank transaction id, record id, error
 * code, parser name; DESIGN.md 3 "Other strings"): mono, weight 400, the
 * line's size but never below 16px. Color comes from the caller.
 */
export function MachineId({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span translate="no" className={clsx("font-mono text-[length:max(1em,1rem)] font-normal wrap-anywhere", className)}>
      {children}
    </span>
  )
}
