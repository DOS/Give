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
      items={links.map((link) => ({ ...link, current: pathname === link.href }))}
    />
  )
}
