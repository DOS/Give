import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ManualMatchList, PaidBreakdownCard } from "@/components/Reconciliation"
import { UnmatchedTransactionCard } from "@/components/UnmatchedTransaction"
import { Badge } from "@/components/ui/Badge"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { requireSession } from "@/lib/auth/session"
import { getCampaignById } from "@/lib/campaigns"
import { isUuid } from "@/lib/ids"
import { listManualMatches, listMatchCandidates, listUnmatched, paidBreakdown } from "@/lib/reconciliation"
import { dbAs } from "@/lib/supabase"

import { MeDetail } from "../../../_components/MePage"

import { matchTransaction } from "./actions"

export const metadata: Metadata = { title: "Giao dịch chưa khớp", robots: { index: false } }

export default async function UnmatchedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession(`/me/campaigns/${id}/unmatched`)
  if (!isUuid(id)) notFound()
  const db = dbAs(session.accessToken)
  const campaign = await getCampaignById(db, id)
  if (!campaign || campaign.organizer_id !== session.user.id) notFound()

  const [{ transactions: unmatched, total }, breakdown, matches, candidates] = await Promise.all([
    listUnmatched(db, { campaignId: campaign.id }),
    paidBreakdown(db, campaign.id),
    listManualMatches(db, { campaignId: campaign.id }),
    listMatchCandidates(db, campaign.id),
  ])

  return (
    <MeDetail>
      <PageHeader back={{ href: `/me/campaigns/${campaign.id}`, label: campaign.title }} title="Giao dịch chưa khớp">
        Tiền đã vào tài khoản nhận nhưng nội dung chuyển khoản không có mã ủng hộ hợp lệ. Nếu bạn biết khoản này của
        lượt ủng hộ nào (người ủng hộ báo lại, hoặc đúng tên và số tiền), hãy khớp tay. Khớp tay chỉ chuyển khoản tiền
        từ &quot;chưa khớp&quot; sang &quot;đã khớp&quot;: tổng đã thanh toán không đổi. Mọi lần khớp tay được ghi vào
        nhật ký kiểm toán.
      </PageHeader>

      {/* One 8-column reading column (DESIGN.md 2.2). */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-x-6">
        <div className="min-w-0 space-y-12 lg:col-span-8">
          {breakdown && <PaidBreakdownCard breakdown={breakdown} />}

          <section aria-labelledby="unmatched-heading">
            <h2 id="unmatched-heading" className="mb-6 flex flex-wrap items-center gap-3 text-h2">
              Chờ khớp
              <Badge tone={total > 0 ? "warning" : "neutral"}>
                {total > unmatched.length ? `${unmatched.length} mới nhất / ${total}` : total}
              </Badge>
            </h2>
            {unmatched.length === 0 ? (
              <EmptyState title="Không có giao dịch nào chờ khớp." />
            ) : (
              <ul className="space-y-4">
                {unmatched.map((tx) => (
                  <UnmatchedTransactionCard
                    key={tx.id}
                    tx={tx}
                    candidates={candidates}
                    action={matchTransaction.bind(null, tx.id)}
                  />
                ))}
              </ul>
            )}
          </section>

          <ManualMatchList matches={matches} />
        </div>
      </div>
    </MeDetail>
  )
}
