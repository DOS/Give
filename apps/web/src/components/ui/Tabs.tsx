import clsx from "clsx"
import Link from "next/link"
import type { ReactNode } from "react"

import { CurrentTabInView } from "@/components/ui/CurrentTabInView"
import { ScrollRow } from "@/components/ui/ScrollRow"
import { TagLink } from "@/components/ui/Tag"

export interface TabItem {
  href: string
  label: string
  current: boolean
  /** Shown after the label, e.g. how many updates there are. */
  count?: number
}

/**
 * Tabs that are pages (DESIGN.md 6): each tab is a link and the current one
 * carries aria-current, so they work without JavaScript and every tab has
 * its own URL. 44px high, 24px apart, a 2px primary underline on the active
 * tab over a 1px border baseline. Scrolls sideways on narrow screens instead
 * of wrapping.
 */
export function TabNav({ label, items, className }: { label: string; items: readonly TabItem[]; className?: string }) {
  return (
    <nav aria-label={label} className={clsx("border-b border-border", className)}>
      <ul className="-mb-px flex [scrollbar-width:none] gap-6 overflow-x-auto">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={clsx(
                "inline-flex h-11 items-center gap-1 border-b-2 text-base font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2",
                item.current
                  ? "border-primary text-fg"
                  : "border-transparent text-muted hover:border-border hover:text-fg"
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

/**
 * Section navigation for /me and /admin (DESIGN.md 8): a vertical list of
 * links from 1024px, the TabNav row below. Both render, and CSS shows one,
 * so it works without JavaScript; the hidden one is out of the
 * accessibility tree. On phones the tab row scrolls the current tab into
 * view. Each item is 44px; the current one is the selected
 * fill (primary-soft with primary text), as on a tag.
 */
export function SectionNav({
  label,
  heading,
  items,
}: {
  label: string
  /** A small caption above the vertical list, such as "Quản trị Give". */
  heading?: ReactNode
  items: readonly TabItem[]
}) {
  return (
    <div className="lg:sticky lg:top-24">
      {heading && <p className="flex items-center gap-2 text-sm font-medium text-muted lg:mb-2 lg:px-3">{heading}</p>}
      <CurrentTabInView>
        <TabNav label={label} items={items} className="lg:hidden" />
      </CurrentTabInView>
      <nav aria-label={label} className="hidden lg:block">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.current ? "page" : undefined}
                className={clsx(
                  "flex min-h-11 items-center rounded px-3 text-base transition-colors duration-150",
                  item.current ? "bg-primary-soft font-semibold text-primary" : "text-fg hover:bg-surface"
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/**
 * A filter row of tags (statement filters): one line that scrolls sideways
 * on narrow screens, never a wrapping chip wall (DESIGN.md 11).
 */
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
      <ScrollRow className="gap-2 py-2">
        {items.map((item) => (
          <TagLink key={item.href} href={item.href} current={item.current}>
            {item.label}
            {item.count !== undefined && item.count > 0 && <span className="tabular-nums">({item.count})</span>}
          </TagLink>
        ))}
      </ScrollRow>
    </nav>
  )
}

/**
 * A segmented control of links (discovery's campaign type): a surface strip
 * with the current item raised. Each item is its own URL.
 */
export function SegmentedNav({
  label,
  items,
  className,
}: {
  label: string
  items: readonly TabItem[]
  className?: string
}) {
  return (
    <nav aria-label={label} className={clsx("shrink-0", className)}>
      <ul className="flex gap-1 rounded-md bg-surface p-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={clsx(
                "inline-flex h-9 items-center rounded px-2.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150",
                item.current ? "bg-raised text-fg shadow-xs" : "text-muted hover:text-fg"
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
