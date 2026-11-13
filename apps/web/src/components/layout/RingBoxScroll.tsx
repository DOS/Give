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
 */
export function RingBoxScroll() {
  useEffect(() => {
    const reveal = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.matches(":focus-visible")) return
      target.closest<HTMLElement>("[data-ring-box]")?.scrollIntoView({ block: "nearest", inline: "nearest" })
    }
    document.addEventListener("focusin", reveal)
    return () => document.removeEventListener("focusin", reveal)
  }, [])
  return null
}
