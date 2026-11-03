import type { Metadata } from "next"
import Link from "next/link"

import { CampaignCard } from "@/components/CampaignCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { SearchIcon } from "@/components/ui/icons"
import { FilterNav, TabNav } from "@/components/ui/Tabs"
import {
  categoriesFor,
  discoveryHref,
  listCategories,
  listPublicCampaigns,
  parseDiscoveryFilters,
  type CampaignType,
} from "@/lib/campaigns"
import { listMoneyTotals, raisedAmount } from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

export const metadata: Metadata = { title: "Khám phá chiến dịch" }

const TYPE_TABS: { value: CampaignType | null; label: string }[] = [
  { value: null, label: "Tất cả" },
  { value: "give", label: "Từ thiện" },
  { value: "back", label: "Dự án sáng tạo" },
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
  const totals = await listMoneyTotals(
    db,
    campaigns.map((c) => c.id)
  )
  const visibleCategories = filters.type ? categoriesFor(categories, filters.type) : categories

  return (
    <div className="container-page py-10 sm:py-12">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Khám phá chiến dịch</h1>
      <p className="mt-2 max-w-2xl text-lg text-body">
        Chiến dịch đang gây quỹ, mới duyệt trước. Lọc theo hình thức hoặc danh mục.
      </p>

      <form action="/campaigns" method="get" className="mt-6 flex max-w-2xl gap-2" role="search">
        {filters.type && <input type="hidden" name="type" value={filters.type} />}
        {filters.category && <input type="hidden" name="category" value={filters.category} />}
        <label htmlFor="q" className="sr-only">
          Tìm chiến dịch
        </label>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q ?? ""}
            placeholder="Tìm theo tên hoặc tóm tắt…"
            className="field pl-10"
            maxLength={80}
          />
        </div>
        <button type="submit" className="btn-primary">
          Tìm
        </button>
      </form>

      <TabNav
        label="Loại chiến dịch"
        className="mt-8"
        items={TYPE_TABS.map((tab) => ({
          href: discoveryHref({ type: tab.value, q: filters.q }),
          label: tab.label,
          current: filters.type === tab.value,
        }))}
      />

      <FilterNav
        label="Danh mục"
        className="mt-4"
        items={[
          {
            href: discoveryHref({ type: filters.type, q: filters.q }),
            label: "Mọi danh mục",
            current: !filters.category,
          },
          ...visibleCategories.map((category) => ({
            href: discoveryHref({ ...filters, category: category.slug }),
            label: category.name,
            current: filters.category === category.slug,
          })),
        ]}
      />

      <section className="mt-8" aria-live="polite" aria-labelledby="results-heading">
        <h2 id="results-heading" className="sr-only">
          Kết quả
        </h2>
        {campaigns.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                raised={raisedAmount(totals.get(campaign.id), campaign.type)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Không có chiến dịch nào khớp bộ lọc"
            action={
              <Link href="/campaigns" className="btn-secondary">
                Xóa bộ lọc
              </Link>
            }
          >
            Thử từ khóa ngắn hơn hoặc chọn danh mục khác.
          </EmptyState>
        )}
      </section>
    </div>
  )
}
