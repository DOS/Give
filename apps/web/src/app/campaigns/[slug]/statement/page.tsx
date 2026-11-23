import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"

import { AccountChanges } from "@/components/AccountChanges"
import { MoneyTotals } from "@/components/MoneyTotals"
import { PublicEvidenceList } from "@/components/PublicEvidence"
import { Badge } from "@/components/ui/Badge"
import { buttonClass } from "@/components/ui/Button"
import { DownloadIcon } from "@/components/ui/icons"
import { FilterNav, TabNav } from "@/components/ui/Tabs"
import { listPublicAccountChanges } from "@/lib/account-swaps"
import { siteOrigin } from "@/lib/auth/origin"
import { getSession } from "@/lib/auth/session"
import { getCampaignBySlug, isPublicStatus } from "@/lib/campaigns"
import { csvFilenameSlug } from "@/lib/csv"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import { SLUG_PATTERN } from "@/lib/slug"
import {
  categoryLabel,
  counterpartyLabel,
  explainedNotDonation,
  getMoneyTotals,
  listPublicEvidence,
  listStatement,
  listStatementPairs,
  parseStatementParams,
  remainingAmount,
  returnedTransferText,
  STATEMENT_FILTER_LABELS,
  STATEMENT_FILTERS,
  STATEMENT_PAGE_SIZE,
  statementExportHref,
  statementHref,
  type PublicEvidence,
  type StatementPair,
  type StatementRow,
} from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

import { PrintStatementButton } from "./PrintStatementButton"
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
  const [evidence, pairs] = await Promise.all([
    listPublicEvidence(
      db,
      campaign.id,
      // Refund evidence is never public (it would name the donor); the view leaves it out too.
      rows.filter((row) => row.direction === "out" && row.explained && !row.is_refund).map((row) => row.id)
    ),
    // A failed read leaves out the other row's amount and day, not the returned-transfer note.
    listStatementPairs(db, campaign.id, rows).catch(() => new Map<string, StatementPair>()),
  ])
  const loginHref = `/auth/login?return_path=${encodeURIComponent(statementHref(campaign.slug, filter, page))}`
  const exportHref = statementExportHref(campaign.slug, filter)
  const safeSlug = csvFilenameSlug(campaign.slug, "sao-ke")
  const canonicalPath = `/campaigns/${campaign.slug}/statement`
  const origin = siteOrigin()
  const canonicalUrl = origin ? `${origin}${canonicalPath}` : canonicalPath
  const printedAt = formatDateTime(new Date().toISOString())

  return (
    <div className="container-page pt-6 pb-16 sm:pt-8 lg:pb-24">
      <div className="print-only mb-6 hidden border-b border-border pb-4 print:block">
        <p className="text-sm font-semibold text-muted">Give · Sao kê công khai</p>
        <p className="mt-1 text-h3 text-fg">{campaign.title}</p>
        <p className="mt-1 text-sm text-muted">
          Nguồn công khai:{" "}
          <a href={canonicalUrl} className="underline">
            {canonicalUrl}
          </a>
          {" · "}
          In lúc: {printedAt}
          {filter !== "all" ? ` · Bộ lọc: ${STATEMENT_FILTER_LABELS[filter]}` : ""}
          {pages > 1 ? ` · Trang ${page}/${pages} (${rows.length}/${total} giao dịch)` : ""}
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm tabular-nums">
          <div>
            <dt className="inline text-muted">Đã nhận: </dt>
            <dd className="inline font-semibold text-fg">{formatVnd(totals.paid_amount)}</dd>
          </div>
          <div>
            <dt className="inline text-muted">Đã chi: </dt>
            <dd className="inline font-semibold text-fg">{formatVnd(totals.disbursed_amount)}</dd>
          </div>
          <div>
            <dt className="inline text-muted">Đã hoàn: </dt>
            <dd className="inline font-semibold text-fg">{formatVnd(totals.refunded_amount)}</dd>
          </div>
          <div>
            <dt className="inline text-muted">Còn lại: </dt>
            <dd className="inline font-semibold text-fg">{formatVnd(remainingAmount(totals))}</dd>
          </div>
          {totals.unexplained_out_count > 0 && (
            <div>
              <dt className="inline text-muted">Chưa giải trình: </dt>
              <dd className="inline font-semibold text-warning">
                {formatVnd(totals.unexplained_out_amount)} ({totals.unexplained_out_count} khoản)
              </dd>
            </div>
          )}
        </dl>
      </div>
      <p className="min-w-0 print:hidden">
        <Link
          href={`/campaigns/${campaign.slug}`}
          className="-ml-1 inline-flex min-h-11 items-center gap-2 px-1 text-sm break-words text-muted hover:text-fg hover:underline"
        >
          <span aria-hidden>←</span>
          {campaign.title}
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-h1-phone tracking-tight sm:text-h1">Sao kê chiến dịch</h1>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <a
            href={exportHref}
            download={`sao-ke-${safeSlug}.csv`}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <DownloadIcon aria-hidden />
            <span>Tải CSV sao kê</span>
          </a>
          <PrintStatementButton />
        </div>
      </div>
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
          },
        ]}
      />
      <p className="mt-6 max-w-[68ch] text-fg">
        Đây là bản sao sao kê tài khoản nhận của chiến dịch. Give không giữ tiền và không sửa số liệu: mỗi khoản chi do
        người tổ chức tự giải trình, kèm ảnh chứng từ. Tiền vào hiện tên hiển thị người ủng hộ đã chọn, hoặc &quot;Ẩn
        danh&quot;; tên chủ tài khoản ngân hàng, số tài khoản của người ủng hộ và nội dung chuyển khoản không được công
        khai.
      </p>

      {/* Detail page, 8/4 (DESIGN.md 2.2): the figures come first on phones, beside the rows from 1024px. */}
      <div className="mt-8 flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:gap-x-6 print:block print:space-y-6">
        <div className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:self-start print:static">
          <MoneyTotals totals={totals} />
          <AccountChanges changes={accountChanges} />
        </div>

        <section className="min-w-0 lg:col-span-8 lg:row-start-1" aria-labelledby="statement-heading">
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
            <ol className="mt-6 divide-y divide-border card">
              {rows.map((row) => (
                <StatementItem
                  key={row.id}
                  row={row}
                  evidence={evidence.get(row.id) ?? []}
                  pair={pairs.get(row.id) ?? null}
                  report={session ? reportEvidence : null}
                  loginHref={loginHref}
                />
              ))}
            </ol>
          )}

          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Trang">
              {page > 1 ? (
                <Link
                  href={statementHref(campaign.slug, filter, page - 1)}
                  className={buttonClass({ variant: "secondary" })}
                >
                  ← Mới hơn
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted">
                Trang {page} / {pages}
              </span>
              {page < pages ? (
                <Link
                  href={statementHref(campaign.slug, filter, page + 1)}
                  className={buttonClass({ variant: "secondary" })}
                >
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
  pair,
  report,
  loginHref,
}: {
  row: StatementRow
  evidence: PublicEvidence[]
  /** The other row of a returned transfer, when this row is one. */
  pair: StatementPair | null
  report: typeof reportEvidence | null
  loginHref: string
}) {
  const incoming = row.direction === "in"
  const category = categoryLabel(row.category)
  // A transfer between the campaign's own accounts after a swap (DOS/Give#84):
  // neither a donation nor spending, so neither green nor an explanation block.
  const ownTransfer = Boolean(row.own_transfer_label)

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm text-muted">
          {row.booked_date_only ? formatDate(row.booked_at) : formatDateTime(row.booked_at)}
          {" · "}
          {incoming ? "Tiền vào" : "Tiền ra"}
        </p>
        <p className="font-medium break-words">
          {incoming && row.return_of && pair
            ? `Ngân hàng trả lại ${pair.is_refund ? "khoản hoàn tiền" : "khoản chi"}`
            : counterpartyLabel(row)}
          {row.counterparty_account_masked && (
            <span className="ml-2 text-sm font-normal text-muted">TK {row.counterparty_account_masked}</span>
          )}
        </p>
        {ownTransfer && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone="info">Chuyển tài khoản</Badge>
            <span className="text-fg">
              {incoming
                ? "Tiền từ tài khoản cũ của chiến dịch, không tính là tiền ủng hộ mới."
                : "Chuyển sang tài khoản mới của chiến dịch, không tính là khoản chi."}
            </span>
            {row.own_transfer_at && <span>Give xác nhận ngày {formatDate(row.own_transfer_at)}</span>}
          </p>
        )}
        {!ownTransfer && !incoming && row.explained && (
          <div className="text-fg">
            <p className="break-words">{row.purpose}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              {row.is_refund && <Badge tone="info">Hoàn tiền</Badge>}
              {category && <span>{category}</span>}
              {row.explained_at && <span>Giải trình ngày {formatDate(row.explained_at)}</span>}
            </p>
            <PublicEvidenceList evidence={evidence} report={report} loginHref={loginHref} />
            {row.returned_by && <ReturnedNote row={row} pair={pair} />}
          </div>
        )}
        {!ownTransfer && !incoming && !row.explained && (
          <p className="text-warning">Người tổ chức chưa giải trình khoản chi này.</p>
        )}
        {!ownTransfer && explainedNotDonation(row) && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge>Không phải tiền ủng hộ</Badge>
            {row.in_explained_at && <span>Give giải trình ngày {formatDate(row.in_explained_at)}</span>}
          </p>
        )}
        {incoming && row.return_of && <ReturnedNote row={row} pair={pair} />}
        {incoming && !ownTransfer && !row.return_of && row.after_close && (
          <p className="text-sm text-warning">Tiền về sau khi chiến dịch đã kết thúc.</p>
        )}
      </div>
      <p className={`shrink-0 font-semibold tabular-nums ${incoming && !ownTransfer ? "text-primary" : "text-fg"}`}>
        {incoming ? "+" : "−"}
        {formatVnd(row.amount)}
      </p>
    </li>
  )
}

/**
 * Both rows of a returned transfer (DOS/Give#72), with the bank fee when the
 * bank kept one (DOS/Give#195); the words are returnedTransferText's.
 */
function ReturnedNote({ row, pair }: { row: StatementRow; pair: StatementPair | null }) {
  const incoming = row.direction === "in"
  const recorded = row.returned_at ? ` Give ghi nhận ngày ${formatDate(row.returned_at)}.` : ""
  const text = returnedTransferText(row, pair)
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
      {incoming ? <Badge>Không phải tiền ủng hộ</Badge> : <Badge tone="info">Bị ngân hàng trả lại</Badge>}
      <span>
        {text}
        {recorded}
      </span>
    </p>
  )
}
