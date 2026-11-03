import type { ReactNode } from "react"

/** A section's heading, an optional lead line, and an optional link on the right. */
export function SectionHeader({
  id,
  title,
  action,
  children,
}: {
  id?: string
  title: string
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="max-w-2xl">
        <h2 id={id} className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">
          {title}
        </h2>
        {children && <p className="mt-2 text-lg text-body">{children}</p>}
      </div>
      {action && <div className="inline-flex min-h-11 items-center link">{action}</div>}
    </div>
  )
}
