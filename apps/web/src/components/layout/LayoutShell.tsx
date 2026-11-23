"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { RingBoxScroll } from "@/components/layout/RingBoxScroll"

export function isEmbedRoute(pathname: string | null): boolean {
  return pathname === "/embed" || Boolean(pathname?.startsWith("/embed/"))
}

/**
 * Wraps the site chrome around page content, omitting header, footer, and
 * keyboard-scroll helpers on `/embed` and `/embed/*` so embedded widgets render
 * chrome-free on both SSR and client navigation (DOS/Give#335).
 */
export function LayoutShell({
  header,
  footer,
  children,
}: {
  header: ReactNode
  footer: ReactNode
  children?: ReactNode
}) {
  const pathname = usePathname()
  if (isEmbedRoute(pathname)) {
    return (
      <main id="main" className="flex-1">
        {children}
      </main>
    )
  }

  return (
    <>
      {header}
      <main id="main" className="flex-1">
        {children}
      </main>
      {footer}
      <RingBoxScroll />
    </>
  )
}
