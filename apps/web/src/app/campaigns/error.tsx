"use client"

import { Button, ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { ClockIcon } from "@/components/ui/icons"

export default function CampaignsErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <EmptyState
      level={1}
      title="Không tải được chiến dịch"
      icon={<ClockIcon width={40} height={40} />}
      action={
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <ButtonLink href="/campaigns" variant="secondary">
            Khám phá chiến dịch
          </ButtonLink>
          <Button onClick={() => retry()}>Thử lại</Button>
        </div>
      }
    >
      Không đọc được dữ liệu chiến dịch lúc này. Hãy thử lại sau ít phút.
    </EmptyState>
  )
}
