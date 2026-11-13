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
 * more to scroll to; before JavaScript runs, the right edge fades. With
 * scripting turned off nothing can tell which side has more, so no edge fades
 * and nothing is covered (`noscript:hidden`, in browsers that know the
 * `scripting` media feature; others keep the right fade). The fades are overlays, not
 * masks, so a menu sheet opened from inside the row stays visible. An item
 * focused from the keyboard is scrolled clear of them; focus inside such a
 * sheet, which is fixed to the screen, leaves the row where it is.
 *
 * The scrolling element clips whatever leaves its padding box, focus rings
 * included. With `ringRoom`, a row whose first and last items carry the
 * standard ring (2px at a 2px offset) gets 5px of inline room for it: the 4px
 * of the ring, and 1px because the scroll extent can round to whole pixels,
 * which would shave a fraction off the last ring. An equal negative margin
 * takes the room back, and the fades keep to the old edge. The keyboard reveal
 * clears the fade by the same 5px more, so the ring is clear of it too, not
 * only the item. Only a ring may show in the room: while the row has anything
 * scrolled past an end, a solid cover hides the room there, as the clip did
 * before. So nothing moves at rest or while scrolling. Room above and below is the
 * caller's (`className`, `wrapClassName`). TabNav needs none: its ring is
 * drawn inside the tab.
 *
 * The filter bar stops scrolling at 768px, so its fades are hidden from there
 * (the default `fadeClassName`). A row that can overflow at any width, such as
 * TabNav's list (`as="ul"`) or FilterNav's tags, passes its own.
 */
export function ScrollRow({
  as: Row = "div",
  className,
  wrapClassName,
  fadeClassName = "md:hidden",
  ringRoom = false,
  coverClassName,
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
  /**
   * Classes of the covers over the ring room, which are `bg` and render on the
   * server at the right end: hide them where the row cannot scroll.
   */
  coverClassName?: string
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
      // end, a fractional scroll offset can leave a fraction of a pixel that no scroll
      // reaches; the row is at its end then, so no cover (it would hide the last ring).
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
      // The row itself can take focus (Firefox puts a scroller in the tab order).
      if (!(item instanceof HTMLElement) || item === el || !item.matches(":focus-visible")) return
      // A menu sheet opened from the row is a descendant, but it is fixed to the
      // screen: scrolling the row does not move it, so it is not ours to reveal.
      for (let node: HTMLElement | null = item; node && node !== el; node = node.parentElement) {
        if (getComputedStyle(node).position === "fixed") return
      }
      const box = el.getBoundingClientRect()
      const rect = item.getBoundingClientRect()
      // The fades cover FADE inside the row's edge as it is without ring room.
      // With ring room the items carry the ring outside their box, so clear the
      // fade by ROOM more: the ring, and the pixel a scroll offset can round by.
      const room = ringRoom ? ROOM : 0
      const left = box.left + room
      const right = box.right - room
      const clear = FADE + room
      if (rect.left < left + clear || rect.width > right - left - 2 * clear) {
        el.scrollLeft += rect.left - left - clear
      } else if (rect.right > right - clear) {
        el.scrollLeft += rect.right - right + clear
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

  const fade = "pointer-events-none absolute inset-y-0 w-6 transition-opacity duration-150 noscript:hidden"
  const cover = clsx("pointer-events-none absolute inset-y-0 w-[5px] bg-bg noscript:hidden", coverClassName)
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
