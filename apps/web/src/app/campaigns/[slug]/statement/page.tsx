import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"

import { AccountChanges } from "@/components/AccountChanges"
import { MoneyTotals } from "@/components/MoneyTotals"
import { PublicEvidenceList } from "@/components/PublicEvidence"
import { FilterNav, TabNav } from "@/components/ui/Tabs"
import { listPublicAccountChanges } from "@/lib/account-swaps"
import { getSession } from "@/lib/auth/session"
import { getCampaignBySlug, isPublicStatus } from "@/lib/campaigns"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import { SLUG_PATTERN } from "@/lib/slug"
import {
  categoryLabel,
  counterpartyLabel,
  getMoneyTotals,
  listPublicEvidence,
  listStatement,
  parseStatementParams,
  STATEMENT_FILTER_LABELS,
  STATEMENT_FILTERS,
  STATEMENT_PAGE_SIZE,
  statementHref,
  type PublicEvidence,
  type StatementRow,
} from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

import { reportEvidence } from "./actions"

/**
 * Public statement of a campaign (design section 2.4): every transaction of
 * its receiving account, in and out, as an anonymous visitor reads it from
 * give.public_statement, with the evidence images of each explained
 * disbursement from give.public_disbursement_evidence. Only public campaigns
 * have one. The session only decides whether the report form is shown.
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

  const [totals, { rows, total }, session, accountChanges] = await Promise.all([
    getMoneyTotals(db, campaign.id),
    listStatement(db, campaign.id, filter, page),
    getSession(),
    // A failed read hides the notice rather than the statement.
    listPublicAccountChanges(db, campaign.id).catch(() => []),
  ])
  if (!totals) notFound()
  const pages = Math.max(1, Math.ceil(total / STATEMENT_PAGE_SIZE))
  // A stale link past the end (rows were explained since) goes to the last page.
  if (page > pages) redirect(statementHref(campaign.slug, filter, pages))
  const evidence = await listPublicEvidence(
    db,
    campaign.id,
    // Refund evidence is never public (it would name the donor); the view leaves it out too.
    rows.filter((row) => row.direction === "out" && row.explained && !row.is_refund).map((row) => row.id)
  )
  const loginHref = `/auth/login?return_path=${encodeURIComponent(statementHref(campaign.slug, filter, page))}`

  return (
    <div className="container-page py-10">
      <p>
        <Link href={`/campaigns/${campaign.slug}`} className="inline-flex min-h-11 items-center link">
          {campaign.title}
        </Link>
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">
        {filter === "in" ? (campaign.type === "give" ? "Người ủng hộ" : "Người đồng hành") : "Sao kê chiến dịch"}
      </h1>
      <TabNav
        label="Nội dung chiến dịch"
        className="mt-6"
        items={[
          { href: `/campaigns/${campaign.slug}`, label: "Câu chuyện", current: false },
          { href: statementHref(campaign.slug, "all"), label: "Sao kê", current: filter !== "in" },
          {
            href: statementHref(campaign.slug, "in"),
            label: campaign.type === "give" ? "Người ủng hộ" : "Người đồng hành",
            current: filter === "in",
            count: campaign.type === "give" ? totals.supporters_count : totals.backers_count,
          },
        ]}
      />
      <p className="mt-6 max-w-3xl text-body">
        Đây là bản sao sao kê tài khoản nhận của chiến dịch. Give không giữ tiền và không sửa số liệu: mỗi khoản chi do
        người tổ chức tự giải trình, kèm ảnh chứng từ. Tiền vào hiện tên hiển thị người ủng hộ đã chọn, hoặc &quot;Ẩn
        danh&quot;; tên chủ tài khoản ngân hàng, số tài khoản của người ủng hộ và nội dung chuyển khoản không được công
        khai.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <MoneyTotals totals={totals} />
          <AccountChanges changes={accountChanges} />
        </div>

        <section className="lg:col-span-2" aria-labelledby="statement-heading">
          <h2 id="statement-heading" className="sr-only">
            Giao dịch
          </h2>
          <FilterNav
            label="Lọc giao dịch"
            items={STATEMENT_FILTERS.map((value) => ({
              href: statementHref(campaign.slug, value),
              label: STATEMENT_FILTER_LABELS[value],
              current: filter === value,
              count: value === "unexplained" ? totals.unexplained_out_count : undefined,
            }))}
          />

          {rows.length === 0 ? (
            <p className="mt-6 text-muted">
              {filter === "unexplained"
                ? "Không có khoản chi nào chưa giải trình."
                : "Chưa có giao dịch nào trong sao kê."}
            </p>
          ) : (
            <ol className="mt-6 divide-y divide-line card">
              {rows.map((row) => (
                <StatementItem
                  key={row.id}
                  row={row}
                  evidence={evidence.get(row.id) ?? []}
                  report={session ? reportEvidence : null}
                  loginHref={loginHref}
                />
              ))}
            </ol>
          )}

          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-between" aria-label="Trang">
              {page > 1 ? (
                <Link href={statementHref(campaign.slug, filter, page - 1)} className="btn-secondary">
                  ← Mới hơn
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted">
                Trang {page} / {pages}
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

function StatementItem({
  row,
  evidence,
  report,
  loginHref,
}: {
  row: StatementRow
  evidence: PublicEvidence[]
  report: typeof reportEvidence | null
  loginHref: string
}) {
  const incoming = row.direction === "in"
  const category = categoryLabel(row.category)

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm text-muted">
          {row.booked_date_only ? formatDate(row.booked_at) : formatDateTime(row.booked_at)}
          {" · "}
          {incoming ? "Tiền vào" : "Tiền ra"}
        </p>
        <p className="font-medium break-words">
          {counterpartyLabel(row)}
          {row.counterparty_account_masked && (
            <span className="ml-2 text-sm font-normal text-muted">TK {row.counterparty_account_masked}</span>
          )}
        </p>
        {!incoming && row.explained && (
          <div className="text-body">
            <p className="break-words">{row.purpose}</p>
            <p className="mt-1 flex flex-wrap gap-2 text-sm text-muted">
              {row.is_refund && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800">Hoàn tiền</span>}
              {category && <span>{category}</span>}
              {row.explained_at && <span>Giải trình ngày {formatDate(row.explained_at)}</span>}
            </p>
            <PublicEvidenceList evidence={evidence} report={report} loginHref={loginHref} />
          </div>
        )}
        {!incoming && !row.explained && <p className="text-amber-800">Người tổ chức chưa giải trình khoản chi này.</p>}
        {incoming && row.in_explanation && (
          <p className="flex flex-wrap gap-2 text-sm text-muted">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">Không phải tiền ủng hộ</span>
            {row.in_explained_at && <span>Give giải trình ngày {formatDate(row.in_explained_at)}</span>}
          </p>
        )}
        {incoming && row.after_close && (
          <p className="text-sm text-amber-800">Tiền về sau khi chiến dịch đã kết thúc.</p>
        )}
      </div>
      <p className={`shrink-0 font-semibold tabular-nums ${incoming ? "text-brand-700" : "text-ink"}`}>
        {incoming ? "+" : "−"}
        {formatVnd(row.amount)}
      </p>
    </li>
  )
}
