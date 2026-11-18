import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { SearchIcon } from "@/components/ui/icons"

export default function CampaignNotFound() {
  return (
    <EmptyState
      level={1}
      title="Không tìm thấy chiến dịch"
      icon={<SearchIcon width={40} height={40} />}
      action={
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a
            href={`/auth/login?return_path=${encodeURIComponent("/me/campaigns")}`}
            className={buttonClass({ variant: "secondary" })}
          >
            Đăng nhập
          </a>
          <ButtonLink href="/campaigns">Khám phá chiến dịch</ButtonLink>
        </div>
      }
    >
      Chiến dịch này không tồn tại, chưa được công khai hoặc đang tạm dừng. Nếu bạn là người tổ chức, hãy đăng nhập để
      xem và quản lý chiến dịch.
    </EmptyState>
  )
}
