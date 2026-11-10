import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { LedgerIcon } from "@/components/ui/icons"

/** Shown when the visitor may not open this donation, whether or not it exists. */
export default function DonationNotFound() {
  return (
    <div className="container-page flex flex-col items-center py-16 text-center sm:py-24">
      <LedgerIcon width={40} height={40} className="text-muted" aria-hidden />
      <h1 className="mt-4 text-h1-phone tracking-tight sm:text-h1">Không mở được khoản ủng hộ này</h1>
      <p className="mt-3 max-w-[68ch] text-fg">
        Nếu bạn ủng hộ mà không đăng nhập, trang chuyển khoản chỉ mở được trên trình duyệt bạn đã dùng để ủng hộ, trong
        7 ngày. Nếu bạn ủng hộ khi đã đăng nhập, hãy đăng nhập đúng tài khoản đó.
      </p>
      <div className="mt-6 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
        <a
          href={`/auth/login?return_path=${encodeURIComponent("/me/contributions")}`}
          className={buttonClass({ variant: "secondary" })}
        >
          Đăng nhập
        </a>
        <ButtonLink href="/campaigns">Khám phá chiến dịch</ButtonLink>
      </div>
    </div>
  )
}
