import clsx from "clsx"
import type { ReactNode } from "react"

/**
 * One section of an inner /me page: an H2, an optional lead and an optional
 * action on the right, then its content 24px below. No card around it
 * (DESIGN.md 1, fewer boxes): a 1px rule above it separates it from the
 * section before, so lists and forms inside are one level deep. `id` is the
 * anchor the page links to.
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
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={clsx("min-w-0 scroll-mt-24 border-t border-border pt-8", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={`${id}-title`} className="text-h2 break-words">
            {title}
          </h2>
          {description && <div className="mt-2 max-w-[68ch] text-fg">{description}</div>}
        </div>
        {action && <div className="flex flex-wrap gap-2">{action}</div>}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </section>
  )
}

/** A file input whose picker button looks like the kit's secondary button. */
export const fileInputClass =
  "block w-full text-base text-fg file:mr-3 file:min-h-11 file:cursor-pointer file:rounded file:border file:border-border file:bg-bg file:px-4 file:py-2 file:font-semibold file:text-fg hover:file:bg-surface"

/** A checkbox or radio with its label, sized for touch. */
export const checkLabelClass = "flex min-h-11 items-center gap-3 text-base text-fg"
export const checkInputClass = "size-5 shrink-0 accent-primary"
