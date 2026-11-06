"use client"

import clsx from "clsx"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

/** A header link that marks itself current (primary text, aria-current) on its own section. */
export function NavLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const pathname = usePathname()
  const current = pathname === href
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={clsx(
        "inline-flex h-10 items-center rounded px-3 transition-colors duration-150 hover:bg-surface",
        current ? "font-semibold text-primary" : "font-medium text-fg",
        className
      )}
    >
      {children}
    </Link>
  )
}
