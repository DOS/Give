import Link from "next/link"

import { CampaignCard } from "@/components/CampaignCard"
import { categoriesFor, discoveryHref, listCategories, listPublicCampaigns } from "@/lib/campaigns"
import { dbAs } from "@/lib/supabase"

const LOGIN_ERRORS: Record<string, string> = {
  denied: "Bạn đã hủy đăng nhập.",
  state: "Phiên đăng nhập đã hết hạn. Hãy thử lại.",
  tokens: "Không nhận được phiên đăng nhập từ DOS.Me. Hãy thử lại.",
  exchange: "Đăng nhập DOS.Me không thành công. Hãy thử lại.",
  unavailable: "Đăng nhập DOS.Me chưa được cấu hình trên môi trường này.",
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ login_error?: string }> }) {
  const { login_error: loginError } = await searchParams
  const db = dbAs()
  const categories = await listCategories(db)
  const campaigns = await listPublicCampaigns(db, { type: null, category: null, q: null }, categories, 6)

  return (
    <>
      {loginError && (
        <div role="alert" className="bg-red-50 px-4 py-3 text-center text-sm text-red-800">
          {Object.hasOwn(LOGIN_ERRORS, loginError) ? LOGIN_ERRORS[loginError] : LOGIN_ERRORS.exchange}
        </div>
      )}

      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Gây quỹ minh bạch cho điều tốt đẹp và ý tưởng mới
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-600">
            Ủng hộ chiến dịch từ thiện, hoặc đồng hành cùng dự án sáng tạo. Tiền đi thẳng vào tài khoản nhận của từng
            chiến dịch, Give chỉ ghi nhận và công khai.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/campaigns" className="btn-primary px-6 py-3 text-base">
              Khám phá chiến dịch
            </Link>
            <Link href="/start" className="btn-secondary px-6 py-3 text-base">
              Tạo chiến dịch
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-2xl font-bold">Chiến dịch mới</h2>
          <Link href="/campaigns" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Xem tất cả →
          </Link>
        </div>
        {campaigns.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        ) : (
          <p className="card p-8 text-center text-gray-600">
            Chưa có chiến dịch nào đang gây quỹ.{" "}
            <Link href="/start" className="font-medium text-brand-600">
              Tạo chiến dịch đầu tiên
            </Link>
          </p>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-8 md:grid-cols-2">
          {(["give", "back"] as const).map((type) => (
            <div key={type}>
              <h2 className="mb-4 text-xl font-bold">{type === "give" ? "❤️ Từ thiện" : "🚀 Dự án sáng tạo"}</h2>
              <div className="flex flex-wrap gap-2">
                {categoriesFor(categories, type).map((category) => (
                  <Link
                    key={category.id}
                    href={discoveryHref({ type, category: category.slug })}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-sm hover:border-gray-300 hover:bg-gray-50"
                  >
                    {category.icon} {category.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
