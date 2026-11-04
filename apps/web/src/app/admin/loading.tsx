/** Shown while an admin page loads: the page's shape in grey, under the admin tabs. */
export default function AdminLoading() {
  return (
    <div className="container-page space-y-10 py-8 sm:py-10" role="status" aria-live="polite">
      <span className="sr-only">Đang tải…</span>
      <div aria-hidden className="space-y-3">
        <div className="h-8 w-64 max-w-full animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-full max-w-3xl animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-2/3 max-w-2xl animate-pulse rounded bg-gray-100" />
      </div>
      <div aria-hidden className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />
        {[0, 1].map((i) => (
          <div key={i} className="space-y-4 card p-5 sm:p-6">
            <div className="h-5 w-1/2 animate-pulse rounded bg-gray-200" />
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((j) => (
                <div key={j} className="h-10 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
