import type { ReactNode } from "react"

import { LedgerIcon } from "@/components/ui/icons"

/**
 * What a list shows when it has nothing (DESIGN.md 6): a 40px muted icon, an
 * H3, one line of text and at most one button, centered, no dashed border.
 */
export function EmptyState({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="text-muted">{icon ?? <LedgerIcon width={40} height={40} />}</span>
      <p className="mt-4 text-h3 text-fg">{title}</p>
      {children && <p className="mt-2 max-w-[68ch] text-muted">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}
