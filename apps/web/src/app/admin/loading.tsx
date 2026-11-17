import { Skeleton } from "@/components/ui/Skeleton"

/** Shown while an admin page loads: the page's shape in placeholder blocks, beside the admin navigation. */
export default function AdminLoading() {
  return (
    <div className="space-y-12" role="status" aria-live="polite">
      <span className="sr-only">Đang tải…</span>
      <div aria-hidden className="space-y-3">
        <Skeleton className="h-11 w-64 max-w-full" />
        <Skeleton className="h-4 w-full max-w-[68ch]" />
        <Skeleton className="h-4 w-2/3 max-w-[44ch]" />
      </div>
      <div aria-hidden className="space-y-6">
        <Skeleton className="h-8 w-48" />
        {[0, 1].map((i) => (
          <div key={i} className="space-y-4 card p-4 sm:p-6">
            <Skeleton className="h-5 w-1/2" />
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((j) => (
                <Skeleton key={j} className="h-10" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
