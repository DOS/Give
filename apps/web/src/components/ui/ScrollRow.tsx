"use client"

import clsx from "clsx"
import { useEffect, useRef, useState, type ReactNode } from "react"

/** The width of an edge fade (`w-6`), in pixels. */
const FADE = 24

/**
 * One row that scrolls sideways when it does not fit, never wrapping (DESIGN.md
 * 6, filter bar). An edge fades into the page only on the side that still has
 * more to scroll to; before JavaScript runs, the right edge fades. The fades
 * are overlays, not masks, so a menu sheet opened from inside the row stays
 * visible. An item focused from the keyboard is scrolled clear of them.
 *
 * The filter bar stops scrolling at 768px, so its fades are hidden from there
 * (the default `fadeClassName`). A row that can overflow at any width, such as
 * TabNav's list (`as="ul"`), passes its own.
 */
export function ScrollRow({
  as: Row = "div",
  className,
  wrapClassName,
  fadeClassName = "md:hidden",
  children,
}: {
  /** The scrolling element: a plain div, or a list whose children are its items. */
  as?: "div" | "ul"
  /** Classes of the scrolling element. */
  className?: string
  /** Classes of the box around the row and its fades. */
  wrapClassName?: string
  /** Classes of both fades: where they show and what they cover. */
  fadeClassName?: string
  children: ReactNode
}) {
  const row = useRef<HTMLDivElement & HTMLUListElement>(null)
  const [more, setMore] = useState({ left: false, right: true })

  useEffect(() => {
    const el = row.current
    if (!el) return
    const update = () => {
      const left = el.scrollLeft > 1
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }))
    }
    update()
    el.addEventListener("scroll", update, { passive: true })
    // A browser leaves a partly visible item where it is when the keyboard
    // focuses it, so it could stay cut off or under a fade. Bring it clear of
    // both. Keyboard focus only: moving the row under a pointer would lose
    // the click.
    const reveal = (event: FocusEvent) => {
      const item = event.target
      if (!(item instanceof HTMLElement) || !item.matches(":focus-visible")) return
      const box = el.getBoundingClientRect()
      const rect = item.getBoundingClientRect()
      if (rect.left < box.left + FADE || rect.width > box.width - 2 * FADE) {
        el.scrollLeft += rect.left - box.left - FADE
      } else if (rect.right > box.right - FADE) {
        el.scrollLeft += rect.right - box.right + FADE
      }
    }
    el.addEventListener("focusin", reveal)
    // The row's own box follows its container; its children change size when a
    // label changes (a client-side navigation keeps this instance), so watch both.
    const resize = new ResizeObserver(update)
    resize.observe(el)
    for (const child of el.children) resize.observe(child)
    return () => {
      el.removeEventListener("scroll", update)
      el.removeEventListener("focusin", reveal)
      resize.disconnect()
    }
  }, [])

  const fade = "pointer-events-none absolute inset-y-0 w-6 transition-opacity duration-150"
  return (
    <div className={clsx("relative min-w-0", wrapClassName)}>
      <Row ref={row} className={clsx("flex [scrollbar-width:none] items-center overflow-x-auto", className)}>
        {children}
      </Row>
      <span
        aria-hidden
        className={clsx(
          fade,
          fadeClassName,
          "left-0 bg-linear-to-r from-bg to-transparent",
          more.left ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        aria-hidden
        className={clsx(
          fade,
          fadeClassName,
          "right-0 bg-linear-to-l from-bg to-transparent",
          more.right ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  )
}
