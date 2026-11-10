"use client"

import { Button, ButtonLink } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"

/**
 * What a /me section shows when its page fails to render: what happened,
 * a retry, and a way back to the person's campaigns.
 */
export function MeError({ retry }: { retry: () => void }) {
  return (
    <div className="container-page pt-8 pb-16 sm:pt-12 lg:pb-24">
      <div className="max-w-160 space-y-6">
        <h1 className="text-h1-phone tracking-tight sm:text-h1">Không tải được trang này</h1>
        <Callout tone="danger" role="alert">
          Có thể kết nối bị gián đoạn hoặc máy chủ đang bận. Dữ liệu của bạn không bị ảnh hưởng; hãy thử lại sau ít
          phút.
        </Callout>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => retry()}>Thử lại</Button>
          <ButtonLink href="/me/campaigns" variant="secondary">
            Về Chiến dịch của tôi
          </ButtonLink>
        </div>
      </div>
    </div>
  )
}
