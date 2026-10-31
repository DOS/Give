import type { Metadata } from "next"
import Link from "next/link"

import { CampaignCard } from "@/components/CampaignCard"
import {
  categoriesFor,
  discoveryHref,
  listCategories,
  listPublicCampaigns,
  parseDiscoveryFilters,
  type CampaignType,
} from "@/lib/campaigns"
import { dbAs } from "@/lib/supabase"

export const metadata: Metadata = { title: "Khám phá chiến dịch" }

const TYPE_TABS: { value: CampaignType | null; label: string }[] = [
  { value: null, label: "Tất cả" },
  { value: "give", label: "❤️ Từ thiện" },
  { value: "back", label: "🚀 Dự án" },
]

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = parseDiscoveryFilters(await searchParams)
  const db = dbAs()
  const categories = await listCategories(db)
  const campaigns = await listPublicCampaigns(db, filters, categories)
  const visibleCategories = filters.type ? categoriesFor(categories, filters.type) : categories

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold">Khám phá chiến dịch</h1>

      <form action="/campaigns" method="get" className="mt-6 flex flex-col gap-3 sm:flex-row" role="search">
        {filters.type && <input type="hidden" name="type" value={filters.type} />}
        {filters.category && <input type="hidden" name="category" value={filters.category} />}
        <label htmlFor="q" className="sr-only">
          Tìm chiến dịch
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={filters.q ?? ""}
          placeholder="Tìm theo tên hoặc tóm tắt…"
          className="field sm:max-w-md"
          maxLength={80}
        />
        <button type="submit" className="btn-primary">
          Tìm
        </button>
      </form>

      <nav aria-label="Loại chiến dịch" className="mt-6 flex flex-wrap gap-2">
        {TYPE_TABS.map((tab) => {
          const active = filters.type === tab.value
          return (
            <Link
              key={tab.label}
              href={discoveryHref({ type: tab.value, q: filters.q })}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      <nav aria-label="Danh mục" className="mt-3 flex flex-wrap gap-2">
        <Link
          href={discoveryHref({ type: filters.type, q: filters.q })}
          aria-current={!filters.category ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${
            !filters.category ? "border-gray-900 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Mọi danh mục
        </Link>
        {visibleCategories.map((category) => {
          const active = filters.category === category.slug
          return (
            <Link
              key={category.id}
              href={discoveryHref({ ...filters, category: category.slug })}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${
                active ? "border-gray-900 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {category.icon} {category.name}
            </Link>
          )
        })}
      </nav>

      <section className="mt-8" aria-live="polite">
        {campaigns.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        ) : (
          <div className="card p-10 text-center">
            <p className="text-gray-700">Không có chiến dịch nào khớp bộ lọc.</p>
            <Link href="/campaigns" className="mt-3 inline-block text-sm font-medium text-brand-600">
              Xóa bộ lọc
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
