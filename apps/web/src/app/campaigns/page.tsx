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
  DISCOVERY_MAX_PAGE,
  DISCOVERY_PAGE_SIZE,
  DISCOVERY_SORTS,
  DISCOVERY_STATUSES,
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

const COUNT = new Intl.NumberFormat("vi-VN")

/** Lets the category button shrink in the filter row from 768px (see MenuSummary). */
const SHRINK = "md:min-w-0 md:shrink"

/** The id of the n-th card (1-based), so "Xem thêm" can land on the first new one. */
const cardId = (n: number) => `chien-dich-${n}`

/** A menu of links, the current one checked (inside a Dropdown). */
function MenuLinks({ label, items }: { label: string; items: { href: string; label: string; current: boolean }[] }) {
  return (
    <nav aria-label={label}>
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={clsx(
                "flex min-h-11 items-center gap-3 rounded px-2 text-sm",
                item.current ? "bg-primary-soft font-semibold text-primary" : "text-fg hover:bg-surface"
              )}
            >
              <span className="inline-flex size-5 shrink-0 items-center justify-center">
                {item.current && <CheckIcon width={16} height={16} />}
              </span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Where a menu button's name starts to show (literal classes for Tailwind). */
const NAME_FROM = {
  lg: "sr-only lg:not-sr-only lg:whitespace-nowrap",
  xl: "sr-only xl:not-sr-only xl:whitespace-nowrap",
} as const

/**
 * A menu button's text: "Name: value". Below `nameFrom` (1024px, or 1280px
 * for the category) only the value shows (the name is still read out), so
 * the row fits; with no value, just the name.
 * From 768px the row does not scroll, so the category button may shrink and
 * cut its text with an ellipsis when the longest values meet (SHRINK; the
 * category also shows in "Đang lọc"); status and sort always show in full.
 */
function MenuSummary({
  name,
  value,
  nameFrom = "lg",
}: {
  name: string
  value: string | null
  nameFrom?: keyof typeof NAME_FROM
}) {
  return (
    <>
      <span className="relative min-w-0 truncate">
        {value ? (
          <>
            <span className={NAME_FROM[nameFrom]}>{name}: </span>
            {value}
          </>
        ) : (
          name
        )}
      </span>
      <ChevronDownIcon width={16} height={16} className="shrink-0" />
    </>
  )
}

/**
 * Discovery (DESIGN.md 8): H1 and one line, the filter bar (one row: the
 * type control, the "Danh mục" and "Trạng thái" menus, then the result count
 * and the "Sắp xếp" menu on the right), the active filters, the card grid and
 * "Xem thêm". Every control is a link, so the state lives in the URL
 * (type, category, q, status, sort, page) and the server filters, sorts and
 * pages (lib/campaigns.ts, give.discover_campaigns). Page N shows the first N
 * pages of cards.
 */
export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = parseDiscoveryFilters(await searchParams)
  const db = dbAs()
  const categories = await listCategories(db)
  const { campaigns, total } = await listPublicCampaigns(db, filters, categories, filters.page * DISCOVERY_PAGE_SIZE)
  const totals = await listMoneyTotals(
    db,
    campaigns.map((c) => c.id)
  )
  const visibleCategories = filters.type ? categoriesFor(categories, filters.type) : categories
  const category = categories.find((c) => c.slug === filters.category) ?? null
  const status = DISCOVERY_STATUSES.find((s) => s.value === filters.status) ?? DISCOVERY_STATUSES[0]
  const sort = DISCOVERY_SORTS.find((s) => s.value === filters.sort) ?? DISCOVERY_SORTS[0]
  const filtered = Boolean(filters.category || filters.q)
  // What every link keeps; a change of filter or order starts again at page 1.
  const keep = {
    type: filters.type,
    category: filters.category,
    q: filters.q,
    status: filters.status,
    sort: filters.sort,
  }
  const shown = campaigns.length
  const more = shown < total && filters.page < DISCOVERY_MAX_PAGE
  const countText = `${COUNT.format(total)} chiến dịch`

  return (
    <div className="container-page pt-8 pb-16 sm:pt-12 lg:pb-24">
      <h1 className="text-h1-phone tracking-tight sm:text-h1">Khám phá chiến dịch</h1>
      <p className="mt-2 max-w-[68ch] text-muted">Ủng hộ một hoàn cảnh, hoặc đồng hành cùng một dự án sáng tạo.</p>

      {/* The header search is hidden below 768px; this one also works without JavaScript. */}
      <form action="/campaigns" method="get" className="mt-6 md:hidden" role="search">
        {filters.type && <input type="hidden" name="type" value={filters.type} />}
        {filters.category && <input type="hidden" name="category" value={filters.category} />}
        {filters.status !== "live" && <input type="hidden" name="status" value={filters.status} />}
        {filters.sort !== "featured" && <input type="hidden" name="sort" value={filters.sort} />}
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
        <ScrollRow className="gap-2 md:overflow-visible lg:gap-3">
          <SegmentedNav
            label="Loại chiến dịch"
            items={TYPE_TABS.map((tab) => ({
              href: discoveryHref({ ...keep, type: tab.value, category: null }),
              label: tab.label,
              current: filters.type === tab.value,
            }))}
          />
          <Dropdown
            title="Danh mục"
            className={SHRINK}
            summaryClassName="max-w-60 md:max-w-full"
            summary={<MenuSummary name="Danh mục" value={category?.name ?? null} nameFrom="xl" />}
          >
            <MenuLinks
              label="Danh mục"
              items={[
                { slug: null, name: "Mọi danh mục" },
                ...visibleCategories.map((c) => ({ slug: c.slug as string | null, name: c.name })),
              ].map((item) => ({
                href: discoveryHref({ ...keep, category: item.slug }),
                label: item.name,
                current: filters.category === item.slug,
              }))}
            />
          </Dropdown>
          <Dropdown title="Trạng thái" summary={<MenuSummary name="Trạng thái" value={status.label} />}>
            <MenuLinks
              label="Trạng thái"
              items={DISCOVERY_STATUSES.map((s) => ({
                href: discoveryHref({ ...keep, status: s.value }),
                label: s.label,
                current: s.value === filters.status,
              }))}
            />
          </Dropdown>
          <div className="ml-auto flex shrink-0 items-center gap-4 pl-2">
            <p className="hidden shrink-0 text-sm text-muted lg:block">{countText}</p>
            <Dropdown
              title="Sắp xếp"
              panelClassName="md:right-0 md:left-auto"
              summary={<MenuSummary name="Sắp xếp" value={sort.label} />}
            >
              <MenuLinks
                label="Sắp xếp"
                items={DISCOVERY_SORTS.map((s) => ({
                  href: discoveryHref({ ...keep, sort: s.value }),
                  label: s.label,
                  current: s.value === filters.sort,
                }))}
              />
            </Dropdown>
          </div>
        </ScrollRow>
        <p className="mt-3 text-sm text-muted lg:hidden">{countText}</p>
      </div>

      {filtered && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Đang lọc:</span>
          {category && (
            <TagLink href={discoveryHref({ ...keep, category: null })} aria-label={`Bỏ lọc danh mục ${category.name}`}>
              {category.name}
              <CloseIcon width={16} height={16} />
            </TagLink>
          )}
          {filters.q && (
            <TagLink href={discoveryHref({ ...keep, q: null })} aria-label={`Bỏ tìm “${filters.q}”`}>
              “{filters.q}”
              <CloseIcon width={16} height={16} />
            </TagLink>
          )}
          <Link
            href={discoveryHref({ ...keep, category: null, q: null })}
            className="inline-flex min-h-11 items-center link"
          >
            Xoá tất cả
          </Link>
        </div>
      )}

      <section className="mt-6" aria-labelledby="results-heading">
        <h2 id="results-heading" className="sr-only">
          Kết quả
        </h2>
        {shown > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {campaigns.map((campaign, index) => {
              const t = totals.get(campaign.id)
              return (
                <div key={campaign.id} id={cardId(index + 1)} className="min-w-0 scroll-mt-24">
                  <CampaignCard
                    campaign={campaign}
                    raised={raisedAmount(t, campaign.type)}
                    people={t ? (campaign.type === "give" ? t.supporters_count : t.backers_count) : undefined}
                    priority={index < 3}
                  />
                </div>
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
            Thử từ khoá ngắn hơn, chọn danh mục hoặc trạng thái khác.
          </EmptyState>
        )}
        {shown > 0 && (
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted">
              Đang xem {COUNT.format(shown)} trên {countText}
            </p>
            {more ? (
              <Link
                href={discoveryHref({ ...keep, page: filters.page + 1 }, cardId(shown + 1))}
                className={buttonClass({ variant: "secondary" })}
              >
                Xem thêm
              </Link>
            ) : (
              shown < total && <p className="text-sm text-muted">Chọn thêm bộ lọc để xem các chiến dịch còn lại.</p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
