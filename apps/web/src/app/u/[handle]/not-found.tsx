import { ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { SearchIcon } from "@/components/ui/icons"

export default function OrganizerNotFound() {
  return (
    <EmptyState
      level={1}
      title="Không tìm thấy hồ sơ người tổ chức"
      icon={<SearchIcon width={40} height={40} />}
      action={<ButtonLink href="/campaigns">Khám phá chiến dịch</ButtonLink>}
    >
      Đường dẫn này không tồn tại hoặc người tổ chức chưa thiết lập trang công khai.
    </EmptyState>
  )
}
