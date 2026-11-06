import clsx from "clsx"
import type { Metadata } from "next"
import Link from "next/link"

import { CampaignCard } from "@/components/CampaignCard"
import { buttonClass } from "@/components/ui/Button"
import { Dropdown } from "@/components/ui/Dropdown"
import { EmptyState } from "@/components/ui/EmptyState"
import { CheckIcon, ChevronDownIcon, CloseIcon, SearchIcon } from "@/components/ui/icons"
import { ScrollRow } from "@/components/ui/ScrollRow"
import { SegmentedNav } from "@/components/ui/Tabs"
import { TagLink } from "@/components/ui/Tag"
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

/**
 * Discovery (DESIGN.md 8): H1 and one line, the filter bar (one row: the
 * type control, the "Danh mục" menu and the result count), the active
 * filters, then the card grid. Live campaigns only, newest approved first.
 */
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
  const category = categories.find((c) => c.slug === filters.category) ?? null
  const filtered = Boolean(filters.category || filters.q)

  return (
    <div className="container-page pt-8 pb-16 sm:pt-12 lg:pb-24">
      <h1 className="text-h1-phone tracking-tight sm:text-h1">Khám phá chiến dịch</h1>
      <p className="mt-2 max-w-[68ch] text-muted">Ủng hộ một hoàn cảnh, hoặc đồng hành cùng một dự án sáng tạo.</p>

      {/* The header search is hidden below 768px; this one also works without JavaScript. */}
      <form action="/campaigns" method="get" className="mt-6 md:hidden" role="search">
        {filters.type && <input type="hidden" name="type" value={filters.type} />}
        {filters.category && <input type="hidden" name="category" value={filters.category} />}
        <label htmlFor="q" className="sr-only">
          Tìm chiến dịch
        </label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q ?? ""}
            placeholder="Tìm chiến dịch, dự án"
            className="field pl-10"
            maxLength={80}
          />
        </div>
      </form>

      <div className="mt-6 border-b border-border pb-4 sm:mt-8 sm:pb-6">
        <ScrollRow className="gap-3 sm:overflow-visible">
          <SegmentedNav
            label="Loại chiến dịch"
            items={TYPE_TABS.map((tab) => ({
              href: discoveryHref({ type: tab.value, q: filters.q }),
              label: tab.label,
              current: filters.type === tab.value,
            }))}
          />
          <Dropdown
            summary={
              <>
                {category ? `Danh mục: ${category.name}` : "Danh mục"}
                <ChevronDownIcon width={16} height={16} />
              </>
            }
          >
            <nav aria-label="Danh mục">
              <ul>
                {[
                  { slug: null, name: "Mọi danh mục" },
                  ...visibleCategories.map((c) => ({ slug: c.slug as string | null, name: c.name })),
                ].map((item) => {
                  const current = filters.category === item.slug
                  return (
                    <li key={item.slug ?? "all"}>
                      <Link
                        href={discoveryHref({ type: filters.type, category: item.slug, q: filters.q })}
                        aria-current={current ? "page" : undefined}
                        className={clsx(
                          "flex min-h-11 items-center gap-3 rounded px-2 text-sm",
                          current ? "bg-primary-soft font-semibold text-primary" : "text-fg hover:bg-surface"
                        )}
                      >
                        <span className="inline-flex size-5 shrink-0 items-center justify-center">
                          {current && <CheckIcon width={16} height={16} />}
                        </span>
                        {item.name}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </Dropdown>
          <p className="ml-auto shrink-0 pl-3 text-sm text-muted" aria-live="polite">
            {campaigns.length} chiến dịch đang gây quỹ
          </p>
        </ScrollRow>
      </div>

      {filtered && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Đang lọc:</span>
          {category && (
            <TagLink
              href={discoveryHref({ type: filters.type, q: filters.q })}
              aria-label={`Bỏ lọc danh mục ${category.name}`}
            >
              {category.name}
              <CloseIcon width={16} height={16} />
            </TagLink>
          )}
          {filters.q && (
            <TagLink
              href={discoveryHref({ type: filters.type, category: filters.category })}
              aria-label={`Bỏ tìm “${filters.q}”`}
            >
              “{filters.q}”
              <CloseIcon width={16} height={16} />
            </TagLink>
          )}
          <Link href={discoveryHref({ type: filters.type })} className="ml-1 inline-flex min-h-11 items-center link">
            Xoá tất cả
          </Link>
        </div>
      )}

      <section className="mt-6" aria-labelledby="results-heading">
        <h2 id="results-heading" className="sr-only">
          Kết quả
        </h2>
        {campaigns.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {campaigns.map((campaign, index) => {
              const t = totals.get(campaign.id)
              return (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  raised={raisedAmount(t, campaign.type)}
                  people={t ? (campaign.type === "give" ? t.supporters_count : t.backers_count) : undefined}
                  priority={index < 3}
                />
              )
            })}
          </div>
        ) : (
          <EmptyState
            title="Không có chiến dịch nào khớp bộ lọc"
            icon={<SearchIcon width={40} height={40} />}
            action={
              <Link href="/campaigns" className={buttonClass({ variant: "secondary" })}>
                Xoá bộ lọc
              </Link>
            }
          >
            Thử từ khoá ngắn hơn hoặc chọn danh mục khác.
          </EmptyState>
        )}
      </section>
    </div>
  )
}
