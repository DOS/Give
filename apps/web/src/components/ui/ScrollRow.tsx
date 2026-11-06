import clsx from "clsx"
import type { ReactNode } from "react"

/**
 * One row that scrolls sideways when it does not fit, never wrapping (DESIGN.md
 * 6, filter bar), with its right edge fading into the page. The fade is an
 * overlay, not a mask, so a menu sheet opened from inside the row stays visible.
 */
export function ScrollRow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="relative min-w-0">
      <div className={clsx("flex [scrollbar-width:none] items-center overflow-x-auto", className)}>{children}</div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-bg to-transparent sm:hidden"
      />
    </div>
  )
}
