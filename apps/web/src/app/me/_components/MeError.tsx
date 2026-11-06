"use client"

import { Button, ButtonLink } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"

/**
 * What a /me section shows when its page fails to render: what happened,
 * a retry, and a way back to the person's campaigns.
 */
export function MeError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Không tải được trang này</h1>
      <Callout tone="danger" role="alert">
        Có thể kết nối bị gián đoạn hoặc máy chủ đang bận. Dữ liệu của bạn không bị ảnh hưởng; hãy thử lại sau ít phút.
      </Callout>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => retry()}>Thử lại</Button>
        <ButtonLink href="/me/campaigns" variant="secondary">
          Về Chiến dịch của tôi
        </ButtonLink>
      </div>
    </div>
  )
}
