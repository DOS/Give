"use client"

import { useEffect } from "react"

/**
 * DESIGN.md 6, Focus ring, "Scrolled clear". A whole-box link (a campaign
 * card, a reward tier) draws its ring on the box (`data-ring-box`), but the
 * browser scrolls only the focused link, the title, into view: the rest of
 * the ring could stay under the sticky header, the support bar or the edge
 * of the screen. After keyboard focus lands on such a link, bring the box
 * into view; its scroll margins (globals.css) are the ones every focused
 * control gets. Pointer focus does not move the page.
 *
 * A box inside a row that scrolls sideways (ScrollRow, `data-scroll-row`)
 * has already been placed by the row, clear of its edge fades (DESIGN.md 6,
 * Filter bar, Focus room); the row's listener runs first, as focus bubbles
 * to it before the document. `scrollIntoView` scrolls every scrolling
 * ancestor, and would line the box up with the row's edge again, under the
 * fade, so the row's position is put back. Only the page scrolls here.
 */
export function RingBoxScroll() {
  useEffect(() => {
    const reveal = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.matches(":focus-visible")) return
      const box = target.closest<HTMLElement>("[data-ring-box]")
      if (!box) return
      const row = box.closest<HTMLElement>("[data-scroll-row]")
      // Both axes: the row scrolls sideways, but a fraction of a pixel of vertical overflow would let it move too.
      const [rowLeft, rowTop] = [row?.scrollLeft ?? 0, row?.scrollTop ?? 0]
      box.scrollIntoView({ block: "nearest", inline: "nearest" })
      if (row) {
        row.scrollLeft = rowLeft
        row.scrollTop = rowTop
      }
    }
    document.addEventListener("focusin", reveal)
    return () => document.removeEventListener("focusin", reveal)
  }, [])
  return null
}
