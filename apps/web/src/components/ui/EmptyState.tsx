import clsx from "clsx"
import type { ReactNode } from "react"

import { LedgerIcon } from "@/components/ui/icons"

/**
 * What a list shows when it has nothing (DESIGN.md 6): a 40px muted icon, an
 * H3, one line of text and at most one button, centered, no dashed border.
 * Inside a page the title is a heading that looks like an H3; `level` is its
 * place in the page outline: 3 under a section's H2 (the default), 2 where
 * the empty state stands in for the content directly under the page's H1.
 * A whole page (`level={1}`, below) differs.
 *
 * Its text is balanced, so a phone never leaves one word alone on a line;
 * inside a page it is one short sentence.
 *
 * It keeps 48px above and below and 16px at the sides inside a panel, a
 * list or a tab. `flush` drops all of that where the page section that
 * holds it already carries the "Between page sections" padding of
 * DESIGN.md 2.4 and the container gutter, and has no other content (home),
 * so those distances are the whole gap.
 *
 * `level={1}` is the whole page (not found, an error, a donation the visitor
 * may not open): it is the page body in the container, 64px above and below
 * (96px from 640px), its title is the page's H1 and looks like one, 12px
 * above its text, and the text, which a visitor may need to act on, is in
 * the text color, balanced, at most two sentences. Its action row is full
 * width, so the page's `action` may hold a secondary button before the
 * primary, stacked at full width on phones. `flush` does not apply to it.
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
  level?: 1 | 2 | 3
  flush?: boolean
  icon?: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  const page = level === 1
  const Heading = page ? "h1" : level === 2 ? "h2" : "h3"
  return (
    <div
      className={clsx(
        "flex flex-col items-center text-center",
        page ? "container-page py-16 sm:py-24" : !flush && "px-4 py-12"
      )}
    >
      <span className="text-muted">{icon ?? <LedgerIcon width={40} height={40} />}</span>
      <Heading className={page ? "mt-4 text-h1-phone tracking-tight sm:text-h1" : "mt-4 text-h3 text-fg"}>
        {title}
      </Heading>
      {children && (
        <p className={clsx("max-w-[68ch] text-balance", page ? "mt-3 text-fg" : "mt-2 text-muted")}>{children}</p>
      )}
      {action && <div className={clsx("mt-6 flex justify-center", page && "w-full")}>{action}</div>}
    </div>
  )
}
