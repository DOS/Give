import clsx from "clsx"
import type { ReactNode } from "react"

/**
 * One section of an inner /me page: a card with an h2, an optional lead and
 * an optional action on the right. `id` is the anchor the page links to.
 */
export function Panel({
  id,
  title,
  description,
  action,
  className,
  children,
}: {
  id: string
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={clsx("scroll-mt-24 card p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
            {title}
          </h2>
          {description && <div className="mt-1 max-w-3xl text-body">{description}</div>}
        </div>
        {action && <div className="flex flex-wrap gap-2">{action}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  )
}

/** A file input whose picker button looks like the kit's secondary button. */
export const fileInputClass =
  "block w-full text-base text-body file:mr-3 file:min-h-11 file:cursor-pointer file:rounded file:border file:border-gray-300 file:bg-white file:px-4 file:py-2 file:font-semibold file:text-ink hover:file:bg-surface"

/** A checkbox or radio with its label, sized for touch. */
export const checkLabelClass = "flex min-h-11 items-center gap-3 text-base text-ink"
export const checkInputClass = "size-5 shrink-0 accent-brand-700"
