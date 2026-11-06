"use client"

import { Button } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"

/** An admin page that failed to load; the admin tabs stay so staff can go elsewhere. */
export default function AdminError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="container-page py-8 sm:py-10">
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Không tải được trang này</h1>
        <Callout tone="danger">
          Có lỗi khi đọc dữ liệu của trang. Hãy thử lại; nếu vẫn lỗi, hãy tải lại trang sau ít phút.
        </Callout>
        <Button onClick={() => retry()}>Thử lại</Button>
      </div>
    </div>
  )
}
