"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, type ReactNode } from "react"

/**
 * Scrolls a sideways-scrolling tab row so the current tab (aria-current)
 * sits in view, on load and after each navigation. Without JavaScript the
 * row still works; it just starts at the first tab.
 */
export function CurrentTabInView({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const current = ref.current?.querySelector<HTMLElement>('[aria-current="page"]')
    const row = current?.closest("ul")
    if (!current || !row || row.scrollWidth <= row.clientWidth) return
    const tab = current.getBoundingClientRect()
    const box = row.getBoundingClientRect()
    row.scrollLeft += tab.left - box.left - (box.width - tab.width) / 2
  }, [pathname])

  return <div ref={ref}>{children}</div>
}
