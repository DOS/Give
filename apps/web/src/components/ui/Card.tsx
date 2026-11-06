import clsx from "clsx"
import type { ReactNode } from "react"

/** A card (DESIGN.md 5): raised fill, 1px border, 6px radius, 24px padding (16px on phones). */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("card p-4 sm:p-6", className)}>{children}</div>
}
