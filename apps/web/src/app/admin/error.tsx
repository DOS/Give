"use client"

import { Button } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"

/** An admin page that failed to load; the admin navigation stays so staff can go elsewhere. */
export default function AdminError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="max-w-160 space-y-6">
      <h1 className="text-h1-phone tracking-tight sm:text-h1">Không tải được trang này</h1>
      <Callout tone="danger">
        Có lỗi khi đọc dữ liệu của trang. Hãy thử lại; nếu vẫn lỗi, hãy tải lại trang sau ít phút.
      </Callout>
      <Button onClick={() => retry()}>Thử lại</Button>
    </div>
  )
}
