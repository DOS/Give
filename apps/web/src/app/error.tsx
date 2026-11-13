"use client"

import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { ClockIcon } from "@/components/ui/icons"

/** A page that failed to render: the whole-page empty state (DESIGN.md 6), what happened and a retry. */
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <EmptyState
      level={1}
      title="Có lỗi xảy ra"
      icon={<ClockIcon width={40} height={40} />}
      action={<Button onClick={() => retry()}>Thử lại</Button>}
    >
      Không tải được trang này. Hãy thử lại sau ít phút.
    </EmptyState>
  )
}
