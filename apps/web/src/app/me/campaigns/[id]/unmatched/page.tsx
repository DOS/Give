import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ManualMatchList, PaidBreakdownCard } from "@/components/Reconciliation"
import { UnmatchedTransactionCard } from "@/components/UnmatchedTransaction"
import { requireSession } from "@/lib/auth/session"
import { getCampaignById } from "@/lib/campaigns"
import { isUuid } from "@/lib/ids"
import { listManualMatches, listMatchCandidates, listUnmatched, paidBreakdown } from "@/lib/reconciliation"
import { dbAs } from "@/lib/supabase"

import { matchTransaction } from "./actions"

export const metadata: Metadata = { title: "Giao dịch chưa khớp", robots: { index: false } }

export default async function UnmatchedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession(`/me/campaigns/${id}/unmatched`)
  if (!isUuid(id)) notFound()
  const db = dbAs(session.accessToken)
  const campaign = await getCampaignById(db, id)
  if (!campaign || campaign.organizer_id !== session.user.id) notFound()

  const [unmatched, breakdown, matches, candidates] = await Promise.all([
    listUnmatched(db, { campaignId: campaign.id }),
    paidBreakdown(db, campaign.id),
    listManualMatches(db, { campaignId: campaign.id }),
    listMatchCandidates(db, campaign.id),
  ])

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-10">
      <div>
        <Link href={`/me/campaigns/${campaign.id}`} className="text-sm text-gray-600 hover:text-gray-900">
          ← {campaign.title}
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Giao dịch chưa khớp</h1>
        <p className="mt-2 text-gray-600">
          Tiền đã vào tài khoản nhận nhưng nội dung chuyển khoản không có mã ủng hộ hợp lệ. Nếu bạn biết khoản này của
          lượt ủng hộ nào (người ủng hộ báo lại, hoặc đúng tên và số tiền), hãy khớp tay. Khớp tay chỉ chuyển khoản tiền
          từ &quot;chưa khớp&quot; sang &quot;đã khớp&quot;: tổng đã thanh toán không đổi. Mọi lần khớp tay được ghi vào
          nhật ký kiểm toán.
        </p>
      </div>

      {breakdown && <PaidBreakdownCard breakdown={breakdown} />}

      <section>
        <h2 className="mb-4 text-xl font-bold">Chờ khớp ({unmatched.length})</h2>
        {unmatched.length === 0 ? (
          <p className="card p-6 text-gray-600">Không có giao dịch nào chờ khớp.</p>
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
  )
}
