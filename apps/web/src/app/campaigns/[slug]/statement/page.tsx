import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"

import { MoneyTotals } from "@/components/MoneyTotals"
import { getCampaignBySlug, isPublicStatus } from "@/lib/campaigns"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import { SLUG_PATTERN } from "@/lib/slug"
import {
  categoryLabel,
  counterpartyLabel,
  getMoneyTotals,
  listStatement,
  parseStatementParams,
  STATEMENT_FILTER_LABELS,
  STATEMENT_FILTERS,
  STATEMENT_PAGE_SIZE,
  statementHref,
  type StatementRow,
} from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

/**
 * Public statement of a campaign (design section 2.4): every transaction of
 * its receiving account, in and out, as an anonymous visitor reads it from
 * give.public_statement. Only public campaigns have one.
 */
const loadCampaign = cache(async (slug: string) => {
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) return null
  const db = dbAs()
  const campaign = await getCampaignBySlug(db, slug)
  return campaign && isPublicStatus(campaign.status) ? { campaign, db } : null
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const loaded = await loadCampaign((await params).slug)
  if (!loaded) return { title: "Không tìm thấy" }
  return {
    title: `Sao kê: ${loaded.campaign.title}`,
    description: "Mọi khoản tiền vào và ra của tài khoản nhận, kèm giải trình chi của người tổ chức.",
  }
}

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const loaded = await loadCampaign((await params).slug)
  if (!loaded) notFound()
  const { campaign, db } = loaded
  const { filter, page } = parseStatementParams(await searchParams)

  const [totals, { rows, total }] = await Promise.all([
    getMoneyTotals(db, campaign.id),
    listStatement(db, campaign.id, filter, page),
  ])
  if (!totals) notFound()
  const pages = Math.max(1, Math.ceil(total / STATEMENT_PAGE_SIZE))

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href={`/campaigns/${campaign.slug}`} className="text-sm text-gray-600 hover:text-gray-900">
        ← {campaign.title}
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Sao kê chiến dịch</h1>
      <p className="mt-2 max-w-3xl text-gray-600">
        Đây là bản sao sao kê tài khoản nhận của chiến dịch. Give không giữ tiền và không sửa số liệu: mỗi khoản chi do
        người tổ chức tự giải trình. Tên người ủng hộ chỉ hiện khi họ không chọn ẩn danh; số tài khoản chỉ hiện 4 số
        cuối; nội dung chuyển khoản không được công khai.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <MoneyTotals totals={totals} />
        </div>

        <section className="lg:col-span-2" aria-labelledby="statement-heading">
          <h2 id="statement-heading" className="sr-only">
            Giao dịch
          </h2>
          <nav className="flex flex-wrap gap-2" aria-label="Lọc giao dịch">
            {STATEMENT_FILTERS.map((value) => (
              <Link
                key={value}
                href={statementHref(campaign.slug, value)}
                aria-current={filter === value ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-sm ${
                  filter === value
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {STATEMENT_FILTER_LABELS[value]}
                {value === "unexplained" && totals.unexplained_out_count > 0 && ` (${totals.unexplained_out_count})`}
              </Link>
            ))}
          </nav>

          {rows.length === 0 ? (
            <p className="mt-6 text-gray-500">
              {filter === "unexplained"
                ? "Không có khoản chi nào chưa giải trình."
                : "Chưa có giao dịch nào trong sao kê."}
            </p>
          ) : (
            <ol className="mt-6 divide-y divide-gray-200 card">
              {rows.map((row) => (
                <StatementItem key={row.id} row={row} />
              ))}
            </ol>
          )}

          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Trang">
              {page > 1 ? (
                <Link href={statementHref(campaign.slug, filter, page - 1)} className="btn-secondary">
                  ← Mới hơn
                </Link>
              ) : (
                <span />
              )}
              <span className="text-gray-500">
                Trang {Math.min(page, pages)} / {pages}
              </span>
              {page < pages ? (
                <Link href={statementHref(campaign.slug, filter, page + 1)} className="btn-secondary">
                  Cũ hơn →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
      </div>
    </div>
  )
}

function StatementItem({ row }: { row: StatementRow }) {
  const incoming = row.direction === "in"
  const category = categoryLabel(row.category)

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-gray-500">
          {row.booked_date_only ? formatDate(row.booked_at) : formatDateTime(row.booked_at)}
          {" · "}
          {incoming ? "Tiền vào" : "Tiền ra"}
        </p>
        <p className="font-medium break-words">
          {counterpartyLabel(row)}
          {row.counterparty_account_masked && (
            <span className="ml-2 text-sm font-normal text-gray-500">TK {row.counterparty_account_masked}</span>
          )}
        </p>
        {!incoming && row.explained && (
          <div className="text-sm text-gray-700">
            <p className="break-words">{row.purpose}</p>
            <p className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
              {row.is_refund && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800">Hoàn tiền</span>}
              {category && <span>{category}</span>}
              {row.explained_at && <span>Giải trình ngày {formatDate(row.explained_at)}</span>}
            </p>
          </div>
        )}
        {!incoming && !row.explained && (
          <p className="text-sm text-amber-700">Người tổ chức chưa giải trình khoản chi này.</p>
        )}
        {incoming && row.after_close && (
          <p className="text-xs text-amber-700">Tiền về sau khi chiến dịch đã kết thúc.</p>
        )}
      </div>
      <p className={`shrink-0 font-semibold tabular-nums ${incoming ? "text-green-700" : "text-gray-900"}`}>
        {incoming ? "+" : "−"}
        {formatVnd(row.amount)}
      </p>
    </li>
  )
}
