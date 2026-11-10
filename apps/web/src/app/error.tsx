"use client"

import { Button } from "@/components/ui/Button"
import { ClockIcon } from "@/components/ui/icons"

/** A page that failed to render (DESIGN.md 6, empty state): what happened and a retry, centered in the container. */
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="container-page flex flex-col items-center py-16 text-center sm:py-24">
      <ClockIcon width={40} height={40} className="text-muted" aria-hidden />
      <h1 className="mt-4 text-h1-phone tracking-tight sm:text-h1">Có lỗi xảy ra</h1>
      <p className="mt-3 max-w-[68ch] text-fg">Không tải được trang này. Hãy thử lại sau ít phút.</p>
      <Button onClick={() => retry()} className="mt-6">
        Thử lại
      </Button>
    </div>
  )
}
