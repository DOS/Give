"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

import { TabNav } from "@/components/ui/Tabs"

export interface AdminNavLink {
  href: string
  label: string
}

/**
 * The admin section's tabs; the current one follows the URL. On a phone the
 * row scrolls sideways, so the current tab is scrolled into view.
 */
export function AdminNav({ links }: { links: readonly AdminNavLink[] }) {
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

  return (
    <div ref={ref}>
      <TabNav label="Trang quản trị" items={links.map((link) => ({ ...link, current: pathname === link.href }))} />
    </div>
  )
}
