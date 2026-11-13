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
 * of wrapping; while it overflows, the edge with more tabs fades into the
 * page (ScrollRow). The fades stop above the baseline, so the border runs
 * the full width, and a tab reached by keyboard is scrolled clear of them.
 *
 * The focus ring is drawn inside the tab (DESIGN.md 6, Focus ring), and a
 * tab reaches 4px past its label on each side (a negative margin with equal
 * padding), so the ring clears the label's first and last glyph while the
 * labels stay 24px apart and the first one on the container edge. The
 * underline keeps to the label. The row's ring room holds those 4px at
 * each end.
 */
export function TabNav({ label, items, className }: { label: string; items: readonly TabItem[]; className?: string }) {
  return (
    <nav aria-label={label} className={clsx("border-b border-border", className)}>
      <ScrollRow as="ul" ringRoom wrapClassName="-mb-px" className="gap-6" fadeClassName="bottom-0.5">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={clsx(
                "relative -mx-1 inline-flex h-11 items-center gap-1 px-1 pb-0.5 text-base font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2",
                "after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:transition-colors after:duration-150",
                item.current ? "text-fg after:bg-primary" : "text-muted hover:text-fg hover:after:bg-border"
              )}
            >
              {item.label}
              {item.count !== undefined && item.count > 0 && <span className="tabular-nums">({item.count})</span>}
            </Link>
          </li>
        ))}
      </ScrollRow>
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
 * on narrow screens, never a wrapping chip wall (DESIGN.md 11). The row
 * keeps room for the focus ring of its first and last tag (`ringRoom`); the
 * first tag stays on the container edge. Unlike the discovery filter bar, the
 * row can overflow at any width (a longer label, a larger count), so its edge
 * fades are not limited to phones.
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
      <ScrollRow ringRoom fadeClassName="" className="gap-2 py-2">
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
 * with the current item raised and outlined by a 1px border line, drawn
 * inside the item so nothing moves (no shadow: it does not float, DESIGN.md
 * 5). Each item is its own URL. The items sit 4px
 * apart and 4px from the strip's edge, which the site-wide ring (4px outward)
 * would fill, so the focus ring is drawn inside the item, as on a tab
 * (DESIGN.md 6, Focus ring).
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
      <ul className="flex gap-1 rounded bg-surface p-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={clsx(
                "inline-flex h-9 items-center rounded px-2.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2",
                item.current ? "bg-raised text-fg ring-1 ring-border ring-inset" : "text-muted hover:text-fg"
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
