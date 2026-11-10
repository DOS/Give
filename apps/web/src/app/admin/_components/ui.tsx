import clsx from "clsx"
import type { ReactNode } from "react"

/**
 * Building blocks the admin pages share, on the DESIGN.md kit: a page frame
 * (the layout supplies the container and the side navigation), a section
 * with its count, a card per queue item, a label/value grid and a table that
 * scrolls sideways on phones.
 */

/** A page: its title, an optional action on the right, the rules staff follow, then the sections. */
export function AdminPage({
  title,
  action,
  intro,
  children,
}: {
  title: string
  action?: ReactNode
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="min-w-0 text-h1-phone tracking-tight break-words sm:text-h1">{title}</h1>
          {action && <div className="flex flex-wrap gap-3">{action}</div>}
        </div>
        {intro && <div className="max-w-[68ch] space-y-2 text-fg">{intro}</div>}
      </header>
      {children}
    </div>
  )
}

/** A section with a heading, an optional count and lead, and its content. */
export function AdminSection({
  id,
  title,
  count,
  lead,
  children,
}: {
  id: string
  title: string
  /** A number, or a phrase such as "50 mới nhất / 120". */
  count?: number | string
  lead?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-6">
      <div className="space-y-2">
        <h2 id={id} className="flex flex-wrap items-center gap-3 text-h2">
          {title}
          {count !== undefined && (
            <span className="inline-flex h-7 items-center rounded bg-surface px-2.5 text-sm font-semibold text-muted tabular-nums">
              {count}
            </span>
          )}
        </h2>
        {lead && <p className="max-w-[68ch] text-fg">{lead}</p>}
      </div>
      {children}
    </section>
  )
}

/** A list of queue items, one card each. */
export function ItemList({ children }: { children: ReactNode }) {
  return <ul className="space-y-4">{children}</ul>
}

/** One queue item: facts on top, then the actions under a hairline. */
export function ItemCard({ className, children }: { className?: string; children: ReactNode }) {
  return <li className={clsx("min-w-0 space-y-6 card p-4 sm:p-6", className)}>{children}</li>
}

/** The actions of an item card, side by side from sm up. */
export function ItemActions({ children }: { children: ReactNode }) {
  return <div className="grid gap-6 border-t border-border pt-6 sm:grid-cols-2 [&>*]:min-w-0">{children}</div>
}

/** A label/value grid; wrap each pair in <Fact>. */
export function Facts({
  columns = 3,
  className,
  children,
}: {
  columns?: 2 | 3 | 4
  className?: string
  children: ReactNode
}) {
  return (
    <dl
      className={clsx(
        "grid gap-x-6 gap-y-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {children}
    </dl>
  )
}

export function Fact({ label, wide, children }: { label: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <div className={clsx("min-w-0", wide && "col-span-full")}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 break-words text-fg">{children}</dd>
    </div>
  )
}

/**
 * A table in a card that scrolls sideways when it does not fit (phones).
 * The scroll box is focusable and named so keyboard users can scroll it.
 */
export function DataTable({ label, head, children }: { label: string; head: readonly string[]; children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto card">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="border-b border-border bg-surface text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border align-top text-fg">{children}</tbody>
      </table>
    </div>
  )
}
