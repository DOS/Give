import { ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { SearchIcon } from "@/components/ui/icons"

/** A page that does not exist or is not public: the whole-page empty state (DESIGN.md 6). */
export default function NotFound() {
  return (
    <EmptyState
      level={1}
      title="Không tìm thấy trang"
      icon={<SearchIcon width={40} height={40} />}
      action={<ButtonLink href="/campaigns">Khám phá chiến dịch</ButtonLink>}
    >
      Trang này không tồn tại hoặc chưa được công khai.
    </EmptyState>
  )
}
