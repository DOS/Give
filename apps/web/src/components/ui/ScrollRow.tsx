"use client"

import clsx from "clsx"
import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * One row that scrolls sideways when it does not fit, never wrapping (DESIGN.md
 * 6, filter bar). An edge fades into the page only on the side that still has
 * more to scroll to; before JavaScript runs, the right edge fades. The fades
 * are overlays, not masks, so a menu sheet opened from inside the row stays
 * visible.
 */
export function ScrollRow({ className, children }: { className?: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null)
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
    // The row's own box follows its container; its children change size when a
    // label changes (a client-side navigation keeps this instance), so watch both.
    const resize = new ResizeObserver(update)
    resize.observe(el)
    for (const child of el.children) resize.observe(child)
    return () => {
      el.removeEventListener("scroll", update)
      resize.disconnect()
    }
  }, [])

  const fade = "pointer-events-none absolute inset-y-0 w-6 transition-opacity duration-150 md:hidden"
  return (
    <div className="relative min-w-0">
      <div ref={row} className={clsx("flex [scrollbar-width:none] items-center overflow-x-auto", className)}>
        {children}
      </div>
      <span
        aria-hidden
        className={clsx(fade, "left-0 bg-linear-to-r from-bg to-transparent", more.left ? "opacity-100" : "opacity-0")}
      />
      <span
        aria-hidden
        className={clsx(
          fade,
          "right-0 bg-linear-to-l from-bg to-transparent",
          more.right ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  )
}
