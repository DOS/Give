"use client"

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Có lỗi xảy ra</h1>
      <p className="mt-2 text-gray-600">Không tải được trang này. Hãy thử lại sau ít phút.</p>
      <button type="button" onClick={reset} className="mt-6 btn-primary">
        Thử lại
      </button>
    </div>
  )
}
