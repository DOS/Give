import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { LedgerIcon } from "@/components/ui/icons"

/** Shown when the visitor may not open this donation, whether or not it exists. */
export default function DonationNotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 text-center sm:px-6 sm:py-24">
      <span className="mx-auto flex size-12 items-center justify-center rounded-md bg-surface text-muted" aria-hidden>
        <LedgerIcon width={28} height={28} />
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">Không mở được khoản ủng hộ này</h1>
      <p className="mt-3 text-lg text-body">
        Nếu bạn ủng hộ mà không đăng nhập, trang chuyển khoản chỉ mở được trên trình duyệt bạn đã dùng để ủng hộ, trong
        7 ngày. Nếu bạn ủng hộ khi đã đăng nhập, hãy đăng nhập đúng tài khoản đó.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
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
