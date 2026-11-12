import type { ReactNode } from "react"

import { LedgerIcon } from "@/components/ui/icons"

/**
 * What a list shows when it has nothing (DESIGN.md 6): a 40px muted icon, an
 * H3, one line of text and at most one button, centered, no dashed border.
 * The title is a heading that always looks like an H3; `level` is its place
 * in the page outline: 3 under a section's H2 (the default), 2 where the
 * empty state stands in for the content directly under the page's H1.
 */
export function EmptyState({
  title,
  level = 3,
  icon,
  action,
  children,
}: {
  title: string
  level?: 2 | 3
  icon?: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  const Heading = level === 2 ? "h2" : "h3"
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="text-muted">{icon ?? <LedgerIcon width={40} height={40} />}</span>
      <Heading className="mt-4 text-h3 text-fg">{title}</Heading>
      {children && <p className="mt-2 max-w-[68ch] text-muted">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}
