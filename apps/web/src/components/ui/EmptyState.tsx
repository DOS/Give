import type { ReactNode } from "react"

/** What a list shows when it has nothing: what is missing and what to do next. */
export function EmptyState({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-gray-300 bg-surface px-6 py-12 text-center">
      <p className="text-lg font-semibold text-ink">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-body">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}
