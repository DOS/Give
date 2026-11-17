import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { LedgerIcon } from "@/components/ui/icons"

/**
 * Shown when the visitor may not open this donation, whether or not it exists: the whole-page empty
 * state (DESIGN.md 6), with signing in next to the way back. On phones the two buttons stack at full width.
 */
export default function DonationNotFound() {
  return (
    <EmptyState
      level={1}
      title="Không mở được khoản ủng hộ này"
      icon={<LedgerIcon width={40} height={40} />}
      action={
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a
            href={`/auth/login?return_path=${encodeURIComponent("/me/contributions")}`}
            className={buttonClass({ variant: "secondary" })}
          >
            Đăng nhập
          </a>
          <ButtonLink href="/campaigns">Khám phá chiến dịch</ButtonLink>
        </div>
      }
    >
      Nếu bạn ủng hộ mà không đăng nhập, trang này mở được bằng đường dẫn theo dõi đã lưu hoặc trên trình duyệt vừa ủng
      hộ, trong 7 ngày. Nếu đã đăng nhập, hãy đăng nhập đúng tài khoản đó.
    </EmptyState>
  )
}
