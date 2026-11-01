import Link from "next/link"

/** Shown when the visitor may not open this donation, whether or not it exists. */
export default function DonationNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Không mở được khoản ủng hộ này</h1>
      <p className="mt-2 text-gray-600">
        Nếu bạn ủng hộ mà không đăng nhập, trang chuyển khoản chỉ mở được trên trình duyệt bạn đã dùng để ủng hộ, trong
        7 ngày. Nếu bạn ủng hộ khi đã đăng nhập, hãy đăng nhập đúng tài khoản đó.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a href={`/auth/login?return_path=${encodeURIComponent("/me/contributions")}`} className="btn-secondary">
          Đăng nhập
        </a>
        <Link href="/campaigns" className="btn-primary">
          Khám phá chiến dịch
        </Link>
      </div>
    </div>
  )
}
