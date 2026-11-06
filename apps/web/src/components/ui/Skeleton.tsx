import clsx from "clsx"

/** A grey placeholder block while a section streams in; size it with classes. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-pulse rounded bg-gray-200/70", className)} />
}

/**
 * Placeholder rows for a list that is still loading, inside a card. `label`
 * is what a screen reader hears instead of the grey blocks.
 */
export function SkeletonList({ rows = 3, label = "Đang tải…" }: { rows?: number; label?: string }) {
  return (
    <div role="status" className="divide-y divide-line card">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 sm:p-5">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="hidden h-11 w-28 sm:block" />
        </div>
      ))}
    </div>
  )
}
