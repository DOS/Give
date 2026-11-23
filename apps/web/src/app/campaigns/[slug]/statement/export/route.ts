import { NextResponse, type NextRequest } from "next/server"

import { getCampaignBySlug, isPublicStatus } from "@/lib/campaigns"
import { buildCsv, csvFilenameSlug } from "@/lib/csv"
import { SLUG_PATTERN } from "@/lib/slug"
import {
  getMoneyTotals,
  listStatement,
  listStatementPairs,
  parseStatementParams,
  STATEMENT_CSV_HEADERS,
  STATEMENT_EXPORT_MAX_ROWS,
  STATEMENT_PAGE_SIZE,
  statementCsvRow,
  type StatementPair,
  type StatementRow,
} from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

export const dynamic = "force-dynamic"

const EXPORT_FETCH_CONCURRENCY = 5
const PAIR_IDS_PER_REQUEST = 100

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
}

function emptyStatus(status: number) {
  return new NextResponse(null, { status, headers: NO_STORE_HEADERS })
}

/**
 * Public CSV export of a campaign's `give.public_statement` rows (DOS/Give#336).
 *
 * Security invariants:
 * - Reads strictly through the anonymous `dbAs()` client with explicit column lists.
 * - Requires `isPublicStatus(campaign.status)` (404 for drafts, pre-launch
 *   `approved` teasers, suspended, cancelled, or missing campaigns) and public totals.
 * - Neutralizes CSV formula injection via `buildCsv` and exports only public
 *   statement fields shown on `StatementPage` (zero donor PII, zero private
 *   bank account numbers, and zero evidence URLs).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) return emptyStatus(404)

  const { filter } = parseStatementParams({
    filter: request.nextUrl.searchParams.get("filter") ?? undefined,
  })

  try {
    const db = dbAs()
    const campaign = await getCampaignBySlug(db, slug)
    if (!campaign || !isPublicStatus(campaign.status)) return emptyStatus(404)

    const [totals, firstPage] = await Promise.all([
      getMoneyTotals(db, campaign.id),
      listStatement(db, campaign.id, filter, 1),
    ])
    if (!totals) return emptyStatus(404)

    const rows: StatementRow[] = []
    const seenIds = new Set<string>()
    const appendUnique = (items: readonly StatementRow[]) => {
      for (const item of items) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id)
          rows.push(item)
        }
      }
    }

    appendUnique(firstPage.rows)
    let latestTotal = firstPage.total
    let nextPage = 2
    // Allow a small margin past nominal max pages in case concurrent inserts shift rows across pages.
    const maxPagesCap = Math.ceil(STATEMENT_EXPORT_MAX_ROWS / STATEMENT_PAGE_SIZE) + 5

    if (firstPage.rows.length > 0) {
      while (rows.length < STATEMENT_EXPORT_MAX_ROWS && nextPage <= maxPagesCap) {
        const targetPages = Math.ceil(Math.min(latestTotal, STATEMENT_EXPORT_MAX_ROWS) / STATEMENT_PAGE_SIZE)
        if (nextPage > targetPages) break
        const pages: number[] = []
        for (let page = nextPage; page < nextPage + EXPORT_FETCH_CONCURRENCY && page <= targetPages; page += 1) {
          pages.push(page)
        }
        const batch = await Promise.all(pages.map((page) => listStatement(db, campaign.id, filter, page)))
        nextPage += pages.length
        let hitEnd = false
        for (const result of batch) {
          latestTotal = result.total
          if (result.rows.length === 0) {
            hitEnd = true
            break
          }
          appendUnique(result.rows)
          if (rows.length >= STATEMENT_EXPORT_MAX_ROWS) {
            hitEnd = true
            break
          }
        }
        if (hitEnd) break
      }
    }

    const truncated = latestTotal > STATEMENT_EXPORT_MAX_ROWS || rows.length > STATEMENT_EXPORT_MAX_ROWS
    const exportedRows = rows.slice(0, STATEMENT_EXPORT_MAX_ROWS)

    const returnedRows = exportedRows.filter((row) => row.return_of || row.returned_by)
    const pairs = new Map<string, StatementPair>()
    for (let i = 0; i < returnedRows.length; i += PAIR_IDS_PER_REQUEST) {
      const chunk = returnedRows.slice(i, i + PAIR_IDS_PER_REQUEST)
      const chunkPairs = await listStatementPairs(db, campaign.id, chunk).catch(() => new Map<string, StatementPair>())
      for (const [id, pair] of chunkPairs) pairs.set(id, pair)
    }

    const csv = buildCsv([
      STATEMENT_CSV_HEADERS,
      ...exportedRows.map((row) => statementCsvRow(row, pairs.get(row.id) ?? null)),
    ])

    const safeSlug = csvFilenameSlug(campaign.slug, "sao-ke")
    const headers: Record<string, string> = {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sao-ke-${safeSlug}.csv"`,
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    }
    if (truncated) {
      headers["X-Statement-Truncated"] = "true"
    }

    return new NextResponse(csv, { status: 200, headers })
  } catch (error) {
    const { code, message } = (error ?? {}) as { code?: string; message?: string }
    console.error("statement export failed", code, message)
    return emptyStatus(503)
  }
}
