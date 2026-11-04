import Link from "next/link"
import type { ReactNode } from "react"

/**
 * The top of an inner page: an optional link back to the parent page, badges
 * above the title, the h1, a lead paragraph and the page's actions on the
 * right (below the title on phones).
 */
export function PageHeader({
  back,
  eyebrow,
  title,
  actions,
  children,
}: {
  back?: { href: string; label: string }
  eyebrow?: ReactNode
  title: ReactNode
  actions?: ReactNode
  /** The lead: what the page is for, in a sentence or two. */
  children?: ReactNode
}) {
  return (
    <header>
      {back && (
        <p>
          <Link
            href={back.href}
            className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-muted hover:text-ink"
          >
            <span aria-hidden>←</span>
            <span className="break-words">{back.label}</span>
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-80">
          {eyebrow && <div className="mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div>}
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight break-words sm:text-3xl">{title}</h1>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-3 max-w-3xl text-body">{children}</div>}
    </header>
  )
}
