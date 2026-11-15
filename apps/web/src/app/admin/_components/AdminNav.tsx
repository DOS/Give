"use client"

import { usePathname } from "next/navigation"

import { ShieldIcon } from "@/components/ui/icons"
import { SectionNav } from "@/components/ui/Tabs"

export interface AdminNavLink {
  href: string
  label: string
}

/**
 * The admin section's navigation (DESIGN.md 8): a side list from 1024px,
 * tabs below; the current page follows the URL.
 */
export function AdminNav({ links }: { links: readonly AdminNavLink[] }) {
  const pathname = usePathname()
  return (
    <SectionNav
      label="Trang quản trị"
      heading={
        <>
          <ShieldIcon width={20} height={20} />
          Quản trị Give
        </>
      }
      items={links.map((link) => ({ ...link, current: isCurrent(pathname, link.href) }))}
    />
  )
}

/**
 * The tab of the page, or of the page a sub-page belongs to (/admin/refunds/[id]
 * under "Hoàn tiền"). "/admin" itself matches only exactly.
 */
export function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`))
}
