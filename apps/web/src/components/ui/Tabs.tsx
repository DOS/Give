import clsx from "clsx"
import Link from "next/link"

export interface TabItem {
  href: string
  label: string
  current: boolean
  /** Shown after the label, e.g. how many updates there are. */
  count?: number
}

/**
 * Tabs that are pages: each tab is a link and the current one carries
 * aria-current, so they work without JavaScript and every tab has its own
 * URL. Scrolls sideways on narrow screens instead of wrapping.
 */
export function TabNav({ label, items, className }: { label: string; items: readonly TabItem[]; className?: string }) {
  return (
    <nav aria-label={label} className={clsx("border-b border-line", className)}>
      <ul className="-mb-px flex gap-2 overflow-x-auto sm:gap-6">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={clsx(
                "inline-flex min-h-12 items-center gap-2 border-b-2 px-2 text-base font-medium sm:px-0",
                item.current
                  ? "border-brand-600 text-ink"
                  : "border-transparent text-muted hover:border-gray-300 hover:text-ink"
              )}
            >
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span className="rounded-sm bg-gray-100 px-1.5 text-sm text-body tabular-nums">{item.count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** A filter row of small toggle links (statement filters, discovery types). */
export function FilterNav({
  label,
  items,
  className,
}: {
  label: string
  items: readonly TabItem[]
  className?: string
}) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={clsx(
                "inline-flex min-h-11 items-center gap-1.5 rounded border px-3 text-base",
                item.current
                  ? "border-brand-600 bg-brand-50 font-medium text-brand-800"
                  : "border-line bg-white text-body hover:border-gray-400 hover:text-ink"
              )}
            >
              {item.label}
              {item.count !== undefined && item.count > 0 && <span className="tabular-nums">({item.count})</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
