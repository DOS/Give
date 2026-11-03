import clsx from "clsx"
import type { ReactNode } from "react"

/** A card: white, hairline border, 6px radius, padded. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("card p-5 sm:p-6", className)}>{children}</div>
}
