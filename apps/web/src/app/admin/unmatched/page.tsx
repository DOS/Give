import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ManualMatchList } from "@/components/Reconciliation"
import { UnmatchedTransactionCard } from "@/components/UnmatchedTransaction"
import { matchTransaction } from "@/app/me/campaigns/[id]/unmatched/actions"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { campaignRefs, FINANCE_ROLES } from "@/lib/receiving-accounts"
import { listManualMatches, listMatchCandidates, listUnmatched } from "@/lib/reconciliation"
import { dbAs } from "@/lib/supabase"

export const metadata: Metadata = { title: "Giao dịch chưa khớp", robots: { index: false } }

export default async function AdminUnmatchedPage() {
  const session = await requireSession("/admin/unmatched")
  const db = dbAs(session.accessToken)
  // Finance and admin staff only; others get a 404.
  if (!(await isStaff(db, FINANCE_ROLES))) notFound()

  const [{ transactions: unmatched, total }, matches] = await Promise.all([listUnmatched(db), listManualMatches(db)])
  const campaignIds = [...new Set(unmatched.map((tx) => tx.campaign_id))]
  const [refs, candidateLists] = await Promise.all([
    campaignRefs(db, [...campaignIds, ...matches.map((m) => m.tx.campaign_id)]),
    Promise.all(campaignIds.map((id) => listMatchCandidates(db, id))),
  ])
  const candidates = new Map(campaignIds.map((id, i) => [id, candidateLists[i]]))
  const titles = new Map([...refs].map(([id, ref]) => [id, ref.title]))

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <div>
        <Link href="/admin/statements" className="text-sm text-gray-600 hover:text-gray-900">
          ← Đối soát sao kê
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Giao dịch chưa khớp</h1>
        <p className="mt-2 text-sm text-gray-600">
          Tiền đã vào tài khoản nhận của chiến dịch nhưng không có mã ủng hộ hợp lệ, nên đang được tính là &quot;chưa
          khớp&quot;. Khớp tay khi đã rõ khoản này của lượt ủng hộ nào; người tổ chức cũng khớp được ở trang chiến dịch
          của họ. Khớp tay chỉ chuyển tiền từ &quot;chưa khớp&quot; sang &quot;đã khớp&quot;, tổng đã thanh toán của
          chiến dịch không đổi. Mỗi giao dịch chỉ khớp được một lần, và mỗi lần được ghi vào nhật ký kiểm toán.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-bold">
          Chờ khớp ({total > unmatched.length ? `${unmatched.length} mới nhất / ${total}` : total})
        </h2>
        {unmatched.length === 0 ? (
          <p className="card p-6 text-gray-600">Không có giao dịch nào chờ khớp.</p>
        ) : (
          <ul className="space-y-4">
            {unmatched.map((tx) => (
              <UnmatchedTransactionCard
                key={tx.id}
                tx={tx}
                candidates={candidates.get(tx.campaign_id) ?? []}
                action={matchTransaction.bind(null, tx.id)}
                campaignTitle={titles.get(tx.campaign_id) ?? tx.campaign_id}
              />
            ))}
          </ul>
        )}
      </section>

      <ManualMatchList matches={matches} titles={titles} />
    </div>
  )
}
