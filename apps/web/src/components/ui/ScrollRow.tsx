"use client"

import clsx from "clsx"
import { useEffect, useRef, useState, type ReactNode } from "react"

/** The width of an edge fade (`w-6`), in pixels. */
const FADE = 24
/** The inline room `ringRoom` adds on each side (`px-[5px]`), in pixels. */
const ROOM = 5

/**
 * One row that scrolls sideways when it does not fit, never wrapping (DESIGN.md
 * 6, filter bar). An edge fades into the page only on the side that still has
 * more to scroll to; before JavaScript runs, the right edge fades. The fades
 * are overlays, not masks, so a menu sheet opened from inside the row stays
 * visible. An item focused from the keyboard is scrolled clear of them.
 *
 * The scrolling element clips whatever leaves its padding box, focus rings
 * included. With `ringRoom`, a row whose first and last items carry the
 * standard ring (2px at a 2px offset) gets 5px of inline room for it: the 4px
 * of the ring, and 1px because the scroll extent can round to whole pixels,
 * which would shave a fraction off the last ring. An equal negative margin
 * takes the room back, and the fades and the keyboard reveal keep to the old
 * edge. Only a ring may show in the room: while the row has anything scrolled
 * past an end, a solid cover hides the room there, as the clip did before. So
 * nothing moves at rest or while scrolling. Room above and below is the
 * caller's (`className`, `wrapClassName`). TabNav needs none: its ring is
 * drawn inside the tab.
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
  ringRoom = false,
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
  /** Inline room for the focus ring of the first and last item (see above). */
  ringRoom?: boolean
  children: ReactNode
}) {
  const row = useRef<HTMLDivElement & HTMLUListElement>(null)
  const [more, setMore] = useState({ left: false, right: true })
  // Ring room only: whether anything at all is scrolled past each end.
  const [past, setPast] = useState({ left: false, right: true })

  useEffect(() => {
    const el = row.current
    if (!el) return
    const update = () => {
      const left = el.scrollLeft > 1
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }))
      if (!ringRoom) return
      // A row that stopped scrolling (the filter bar from 768px) clips nothing. At the
      // end, under 1px can stay out of reach of a whole-pixel scroll: that is not content.
      const scrolls = getComputedStyle(el).overflowX !== "visible"
      const pastLeft = scrolls && el.scrollLeft > 0
      const pastRight = scrolls && el.scrollWidth - el.clientWidth - el.scrollLeft > 0.75
      setPast((p) => (p.left === pastLeft && p.right === pastRight ? p : { left: pastLeft, right: pastRight }))
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
      // The fades cover FADE inside the row's edge as it is without ring room.
      const room = ringRoom ? ROOM : 0
      const left = box.left + room
      const right = box.right - room
      if (rect.left < left + FADE || rect.width > right - left - 2 * FADE) {
        el.scrollLeft += rect.left - left - FADE
      } else if (rect.right > right - FADE) {
        el.scrollLeft += rect.right - right + FADE
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
  }, [ringRoom])

  const fade = "pointer-events-none absolute inset-y-0 w-6 transition-opacity duration-150"
  const cover = "pointer-events-none absolute inset-y-0 w-[5px] bg-bg"
  return (
    <div className={clsx("relative min-w-0", ringRoom && "-mx-[5px]", wrapClassName)}>
      <Row
        ref={row}
        className={clsx("flex [scrollbar-width:none] items-center overflow-x-auto", ringRoom && "px-[5px]", className)}
      >
        {children}
      </Row>
      <span
        aria-hidden
        className={clsx(
          fade,
          fadeClassName,
          ringRoom ? "left-[5px]" : "left-0",
          "bg-linear-to-r from-bg to-transparent",
          more.left ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        aria-hidden
        className={clsx(
          fade,
          fadeClassName,
          ringRoom ? "right-[5px]" : "right-0",
          "bg-linear-to-l from-bg to-transparent",
          more.right ? "opacity-100" : "opacity-0"
        )}
      />
      {ringRoom && past.left && <span aria-hidden className={clsx(cover, "left-0")} />}
      {ringRoom && past.right && <span aria-hidden className={clsx(cover, "right-0")} />}
    </div>
  )
}
