import clsx from "clsx"
import type { ReactNode } from "react"

import { LedgerIcon } from "@/components/ui/icons"

/**
 * What a list shows when it has nothing (DESIGN.md 6): a 40px muted icon, an
 * H3, one line of text and at most one button, centered, no dashed border.
 * The title is a heading that always looks like an H3; `level` is its place
 * in the page outline: 3 under a section's H2 (the default), 2 where the
 * empty state stands in for the content directly under the page's H1.
 *
 * It keeps 48px above and below inside a panel or a list region. `flush`
 * drops that padding where the page section that holds it already carries
 * the "Between page sections" padding of DESIGN.md 2.4 and has no other
 * content (home), so that distance is the whole gap.
 */
export function EmptyState({
  title,
  level = 3,
  flush = false,
  icon,
  action,
  children,
}: {
  title: string
  level?: 2 | 3
  flush?: boolean
  icon?: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  const Heading = level === 2 ? "h2" : "h3"
  return (
    <div className={clsx("flex flex-col items-center px-4 text-center", !flush && "py-12")}>
      <span className="text-muted">{icon ?? <LedgerIcon width={40} height={40} />}</span>
      <Heading className="mt-4 text-h3 text-fg">{title}</Heading>
      {children && <p className="mt-2 max-w-[68ch] text-muted">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}
