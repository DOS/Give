import clsx from "clsx"
import type { ReactNode } from "react"

/**
 * Building blocks the admin pages share (DOS/Give#96 part C), on the #95
 * kit: a page frame, a section with its count, a card per queue item, a
 * label/value grid and a table that scrolls sideways on phones.
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
    <div className="container-page space-y-10 py-8 sm:py-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {action && <div className="flex flex-wrap gap-2">{action}</div>}
        </div>
        {intro && <div className="max-w-3xl space-y-2 text-body">{intro}</div>}
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
    <section aria-labelledby={id} className="space-y-4">
      <div className="space-y-1">
        <h2 id={id} className="flex flex-wrap items-center gap-2 text-xl font-bold">
          {title}
          {count !== undefined && (
            <span className="rounded-sm bg-gray-100 px-1.5 text-base font-medium text-body tabular-nums">{count}</span>
          )}
        </h2>
        {lead && <p className="max-w-3xl text-body">{lead}</p>}
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
  return <li className={clsx("space-y-5 card p-5 sm:p-6", className)}>{children}</li>
}

/** The actions of an item card, side by side from sm up. */
export function ItemActions({ children }: { children: ReactNode }) {
  return <div className="grid gap-6 border-t border-line pt-5 sm:grid-cols-2">{children}</div>
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
        "grid gap-x-6 gap-y-3",
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
      <dd className="mt-0.5 break-words text-ink">{children}</dd>
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
        <thead className="border-b border-line bg-surface text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line align-top text-body">{children}</tbody>
      </table>
    </div>
  )
}
