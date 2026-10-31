import Link from "next/link"

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Không tìm thấy trang</h1>
      <p className="mt-2 text-gray-600">Trang này không tồn tại hoặc chưa được công khai.</p>
      <Link href="/campaigns" className="mt-6 btn-primary">
        Khám phá chiến dịch
      </Link>
    </div>
  )
}
